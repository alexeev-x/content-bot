import { createMiddleware } from 'hono/factory';
import { logger } from 'src/lib/logger';
import type { AppEnv } from 'src/types/env';

/** Request ID + длительность. Тело запроса не логируем: в нём сообщения автора. */
export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  c.set('requestId', requestId);

  await next();

  logger.info('request', {
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: Date.now() - startedAt,
  });
});
