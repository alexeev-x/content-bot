import type { ErrorHandler } from 'hono';
import { type ErrorCode, isAppError } from 'src/lib/errors';
import { logger } from 'src/lib/logger';
import type { AppEnv } from 'src/types/env';

/** Код ошибки приложения -> HTTP-статус. Знание про HTTP живёт здесь, а не в lib. */
const httpStatusByCode: Record<ErrorCode, 400 | 401 | 500 | 502 | 503> = {
  unauthorized: 401,
  bad_request: 400,
  not_configured: 503,
  upstream_failed: 502,
  internal: 500,
};

/** Единый формат ошибки наружу. Причину и стек оставляем в логах, а не в ответе. */
export const errorHandler: ErrorHandler<AppEnv> = (error, c) => {
  if (isAppError(error)) {
    logger.warn('request failed', {
      requestId: c.get('requestId'),
      code: error.code,
      path: c.req.path,
      retryable: error.retryable,
    });
    return c.json({ code: error.code, message: error.message }, httpStatusByCode[error.code]);
  }

  logger.error('unhandled error', {
    requestId: c.get('requestId'),
    path: c.req.path,
    message: error instanceof Error ? error.message : 'unknown',
  });
  return c.json({ code: 'internal', message: 'Internal error' }, 500);
};
