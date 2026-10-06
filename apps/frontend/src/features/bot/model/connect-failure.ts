import { ApiError } from '../../../shared/api/http-client';
import { classifyApiError } from '../../../shared/api/error-kind';

export type ConnectFailureKind = 'not_configured' | 'rate_limited' | 'unavailable' | 'forbidden' | 'unexpected';
export type ConnectFailure = {
  kind: ConnectFailureKind;
  retryAfterSeconds: number | undefined;
  requestId: string | undefined;
};

const DEFAULT_RETRY_SECONDS = 30;

export function describeConnectFailure(error: unknown): ConnectFailure {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  if (error instanceof ApiError && error.reason === 'BOT_NOT_CONFIGURED') {
    return { kind: 'not_configured', retryAfterSeconds: undefined, requestId };
  }
  switch (classifyApiError(error)) {
    case 'rate_limited':
      return {
        kind: 'rate_limited',
        retryAfterSeconds:
          error instanceof ApiError ? (error.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS) : DEFAULT_RETRY_SECONDS,
        requestId
      };
    case 'unavailable':
      return { kind: 'unavailable', retryAfterSeconds: undefined, requestId };
    case 'forbidden':
      return { kind: 'forbidden', retryAfterSeconds: undefined, requestId };
    default:
      return { kind: 'unexpected', retryAfterSeconds: undefined, requestId };
  }
}
