import type { ApiErrorDto, HealthDto } from '@alexeev/contracts';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { apiErrorCodeForStatus, AppError } from '../shared/app-error';
import { telegramWebhook } from './bot/webhook-route';
import type { Clock } from '../platform/clock';
import { createContainer } from './container';
import type { AppBindings } from './env';
import { postsRoutes } from './posts-routes';
import { requireOwner } from './require-owner';

function errorBody(
  code: ApiErrorDto['error']['code'],
  message: string,
  requestId: string,
  details?: ApiErrorDto['error']['details']
): ApiErrorDto {
  return { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } };
}

export function createApp(options: { clock?: Clock } = {}) {
  const app = new Hono<AppBindings>();

  app.use('*', async (c, next) => {
    const requestId = crypto.randomUUID();
    const container = createContainer(c.env, options);
    const startedAt = container.clock.now();
    c.set('requestId', requestId);
    c.set('container', container);
    c.header('x-request-id', requestId);
    await next();
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
      publishingEnabled: false,
      time: new Date(c.get('container').clock.now()).toISOString()
    };
    return c.json(body);
  });

  // Everything under /api/v1 needs the owner's session except the health probe, so a new route
  // is closed by default and a missing handler answers 401 rather than revealing what exists.
  app.use('/api/v1/*', (c, next) => (c.req.path === '/api/v1/health' ? next() : requireOwner(c, next)));
  app.route('/api/v1/posts', postsRoutes);

  app.route('/webhooks', telegramWebhook);

  app.notFound((c) => c.json(errorBody('NOT_FOUND', 'Unknown route', c.get('requestId')), 404));

  app.onError((error, c) => {
    const requestId = c.get('requestId');
    if (error instanceof AppError) {
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
