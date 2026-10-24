import type { ApiErrorCode } from '@alexeev/contracts';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

const statusByCode: Record<ApiErrorCode, ContentfulStatusCode> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  NOT_FOUND: 404,
  RATE_LIMIT: 429,
  UNAVAILABLE: 503,
  UNKNOWN_SEND_RESULT: 409
};

// The only error type use cases throw on purpose; `onError` maps it to ApiErrorDto.
export class AppError extends Error {
  readonly status: ContentfulStatusCode;

  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, string>,
    /** For RATE_LIMIT: how long the caller should wait; `onError` turns it into a Retry-After header. */
    readonly retryAfterSec?: number
  ) {
    super(message);
    this.name = 'AppError';
    this.status = statusByCode[code];
  }
}

// Maps a plain HTTP status (for example from Hono's HTTPException) to a contract error code,
// so the body code and the response status always agree.
export function apiErrorCodeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMIT';
    default:
      return status >= 500 ? 'UNAVAILABLE' : 'VALIDATION_ERROR';
  }
}
