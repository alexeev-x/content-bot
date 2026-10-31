import type { ApiErrorDto, HealthDto } from '@alexeev/contracts';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { apiErrorCodeForStatus, AppError } from '../shared/app-error';
import { telegramWebhook } from './bot/webhook-route';
import { type ContainerOverrides, createContainer } from './container';
import type { AppBindings } from './env';
import { authRoutes } from './auth-routes';
import { analyticsRoutes } from './analytics-routes';
import { contentAnalyticsRoutes } from './content-analytics-routes';
import { automationsRoutes } from './automations-routes';
import { botRoutes } from './bot-routes';
import { activityRoutes } from './activity-routes';
import { dashboardRoutes } from './dashboard-routes';
import { destinationsRoutes } from './destinations-routes';
import { aiRoutes } from './ai-routes';
import { dotaRoutes } from './dota-routes';
import { incidentsRoutes } from './incidents-routes';
import { mediaRoutes } from './media-routes';
import { postsRoutes } from './posts-routes';
import { sourcesRoutes } from './sources-routes';
import { publicationsRoutes } from './publications-routes';
import { rubricRoutes } from './rubric-routes';
import { requireOwner } from './require-owner';
import { settingsRoutes } from './settings-routes';
import { notifyOwnerOfFailure } from './notifications/failure-notice';
import { describeError } from '../platform/error-detail';

// Reachable without a session. Sign-in, refresh and logout authenticate themselves with the
// initData or widget signature, the Bearer token or the refresh cookie, so a stricter guard in front of them
// would make signing in impossible.
const PUBLIC_ROUTES = new Set([
  'GET /api/v1/health',
  'POST /api/v1/auth/telegram',
  'POST /api/v1/auth/telegram-widget',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
  // TikTok sends the browser back here without our Bearer token; the single-use OAuth state is the check.
  'GET /api/v1/content-analytics/tiktok/callback'
]);

function errorBody(
  code: ApiErrorDto['error']['code'],
  message: string,
  requestId: string,
  details?: ApiErrorDto['error']['details']
): ApiErrorDto {
  return { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } };
}

function unexpectedErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('no such column')) return 'D1_NO_SUCH_COLUMN';
  if (message.includes('no such table')) return 'D1_NO_SUCH_TABLE';
  if (message.includes('foreign key constraint failed')) return 'D1_FOREIGN_KEY';
  if (message.includes('unique constraint failed: post_media.')) return 'D1_UNIQUE_POST_MEDIA';
  if (message.includes('unique constraint failed: post_revisions.')) return 'D1_UNIQUE_POST_REVISION';
  if (message.includes('unique constraint failed')) return 'D1_UNIQUE_CONSTRAINT';
  if (message.includes('check constraint failed')) return 'D1_CHECK_CONSTRAINT';
  if (message.includes('too many sql variables')) return 'D1_BIND_LIMIT';
  if (message.includes('d1_error') || message.includes('sqlite_error')) return 'D1_ERROR';
  return error instanceof Error ? error.name : 'UNKNOWN_ERROR';
}

export function createApp(
  options: Pick<
    ContainerOverrides,
    'clock' | 'telegramChatApi' | 'telegramBotAdminApi' | 'ownerMessenger' | 'contentFetch' | 'aiProvider'
  > & {
    /** Routes registered before the session guard: the `npm run dev` sign-in (local-sign-in-route.ts). */
    mountBeforeGuard?: (app: Hono<AppBindings>) => void;
    /** Routes behind the session guard that only a `__LAB__` build has: «Тестирование» (lab/lab-routes.ts). */
    mountLab?: (app: Hono<AppBindings>) => void;
  } = {}
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

  options.mountBeforeGuard?.(app);

  // Everything under /api/v1 needs the owner's session except the public routes above, so a new
  // route is closed by default and a missing handler answers 401 rather than revealing what exists.
  app.use('/api/v1/*', (c, next) =>
    PUBLIC_ROUTES.has(`${c.req.method} ${c.req.path}`) ? next() : requireOwner(c, next)
  );
  app.route('/api/v1/auth', authRoutes);
  app.route('/api/v1/ai', aiRoutes);
  app.route('/api/v1/analytics', analyticsRoutes);
  app.route('/api/v1/content-analytics', contentAnalyticsRoutes);
  app.route('/api/v1/automations', automationsRoutes);
  app.route('/api/v1/posts', postsRoutes);
  app.route('/api/v1/media', mediaRoutes);
  app.route('/api/v1/destinations', destinationsRoutes);
  app.route('/api/v1/dota', dotaRoutes);
  app.route('/api/v1/sources', sourcesRoutes);
  app.route('/api/v1/publications', publicationsRoutes);
  app.route('/api/v1/rubrics', rubricRoutes);
  options.mountLab?.(app);
  app.route('/api/v1/dashboard', dashboardRoutes);
  app.route('/api/v1/activity', activityRoutes);
  app.route('/api/v1/incidents', incidentsRoutes);
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
    const container = c.get('container');
    const operation = `${c.req.method} ${c.req.routePath}`;
    container.logger.error({
      component: 'http',
      operation,
      requestId,
      errorCode: unexpectedErrorCode(error),
      detail: describeError(error)
    });
    // The owner hears of an unexpected failure in his chat once per window (owner, 28.10.2026).
    const notice = notifyOwnerOfFailure(
      {
        messenger: container.ownerMessenger,
        ownerChatId: container.ownerChatId,
        state: container.systemState,
        clock: container.clock,
        logger: container.logger
      },
      { where: `API ${operation}`, error, requestId }
    );
    try {
      c.executionCtx.waitUntil(notice);
    } catch {
      // No execution context (a local test run): the notice is best effort.
      void notice;
    }
    return c.json(errorBody('UNAVAILABLE', 'Internal error', requestId), 500);
  });

  return app;
}
