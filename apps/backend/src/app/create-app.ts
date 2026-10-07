import type { ApiErrorDto, HealthDto } from '@alexeev/contracts';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { apiErrorCodeForStatus, AppError } from '../shared/app-error';
import { telegramWebhook } from './bot/webhook-route';
import { type ContainerOverrides, createContainer } from './container';
import type { AppBindings } from './env';
import { authRoutes } from './auth-routes';
import { botRoutes } from './bot-routes';
import { destinationsRoutes } from './destinations-routes';
import { postsRoutes } from './posts-routes';
import { publicationsRoutes } from './publications-routes';
import { requireOwner } from './require-owner';
import { settingsRoutes } from './settings-routes';

// Reachable without a session. Sign-in, refresh and logout authenticate themselves with the
// initData or widget signature, the Bearer token or the refresh cookie, so a stricter guard in front of them
// would make signing in impossible.
const PUBLIC_ROUTES = new Set([
  'GET /api/v1/health',
  'POST /api/v1/auth/telegram',
  'POST /api/v1/auth/telegram-widget',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout'
]);

function errorBody(
  code: ApiErrorDto['error']['code'],
  message: string,
  requestId: string,
  details?: ApiErrorDto['error']['details']
): ApiErrorDto {
  return { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } };
}

export function createApp(
  options: Pick<ContainerOverrides, 'clock' | 'telegramChatApi' | 'telegramBotAdminApi' | 'ownerMessenger'> = {}
) {
  const app = new Hono<AppBindings>();

  app.use('*', async (c, next) => {
    const requestId = crypto.randomUUID();
    const container = createContainer(c.env, options);
    const startedAt = container.clock.now();
    c.set('requestId', requestId);
    c.set('container', container);
    c.header('x-request-id', requestId);
    await next();
    c.header('x-content-type-options', 'nosniff');
    c.header('referrer-policy', 'no-referrer');
    // Everything under /api/v1 answers one private owner; a browser or proxy must not keep a copy.
    if (c.req.path.startsWith('/api/v1/') && c.req.path !== '/api/v1/health') c.header('cache-control', 'no-store');
    container.logger.info({
      component: 'http',
      operation: `${c.req.method} ${c.req.routePath}`,
      requestId,
      status: c.res.status,
      durationMs: container.clock.now() - startedAt
    });
  });

  app.get('/api/v1/health', (c) => {
    const body: HealthDto = {
      status: 'ok',
      service: 'content-bot',
      publishingEnabled: c.get('container').publishing.enabled,
      time: new Date(c.get('container').clock.now()).toISOString()
    };
    return c.json(body);
  });

  // Everything under /api/v1 needs the owner's session except the public routes above, so a new
  // route is closed by default and a missing handler answers 401 rather than revealing what exists.
  app.use('/api/v1/*', (c, next) =>
    PUBLIC_ROUTES.has(`${c.req.method} ${c.req.path}`) ? next() : requireOwner(c, next)
  );
  app.route('/api/v1/auth', authRoutes);
  app.route('/api/v1/posts', postsRoutes);
  app.route('/api/v1/destinations', destinationsRoutes);
  app.route('/api/v1/publications', publicationsRoutes);
  app.route('/api/v1/settings', settingsRoutes);
  app.route('/api/v1/bot', botRoutes);

  app.route('/webhooks', telegramWebhook);

  app.notFound((c) => c.json(errorBody('NOT_FOUND', 'Unknown route', c.get('requestId')), 404));

  app.onError((error, c) => {
    const requestId = c.get('requestId');
    if (error instanceof AppError) {
      if (error.retryAfterSec !== undefined) c.header('retry-after', String(error.retryAfterSec));
      return c.json(errorBody(error.code, error.message, requestId, error.details), error.status);
    }
    if (error instanceof HTTPException) {
      const code = apiErrorCodeForStatus(error.status);
      return c.json(errorBody(code, 'Request rejected', requestId), error.status);
    }
    c.get('container').logger.error({
      component: 'http',
      operation: `${c.req.method} ${c.req.routePath}`,
      requestId,
      errorCode: error.name
    });
    return c.json(errorBody('UNAVAILABLE', 'Internal error', requestId), 500);
  });

  return app;
}
