import { ApiError } from '../../../shared/api/http-client';
import { classifyApiError } from '../../../shared/api/error-kind';

export type RequestFailureKind =
  | 'not_found'
  | 'not_channel'
  | 'validation'
  | 'rate_limited'
  | 'unavailable'
  | 'forbidden'
  | 'chat_taken'
  | 'in_flight'
  | 'key_reused'
  | 'stale_revision'
  | 'not_found_destination'
  | 'unexpected';

export type RequestFailure = {
  kind: RequestFailureKind;
  requestId: string | undefined;
  retryAfterSeconds: number | undefined;
};

const DEFAULT_RETRY_SECONDS = 30;

/** Maps an API error of the check, create or update calls to a UI kind; the screen owns the wording. */
export function describeFailure(error: unknown): RequestFailure {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const retryAfterSeconds =
    error instanceof ApiError && (error.status === 429 || error.status === 503)
      ? (error.retryAfterSeconds ?? (error.status === 429 ? DEFAULT_RETRY_SECONDS : undefined))
      : undefined;
  return { kind: kindOf(error), requestId, retryAfterSeconds };
}

function kindOf(error: unknown): RequestFailureKind {
  if (error instanceof ApiError) {
    if (error.reason === 'CHAT_NOT_FOUND') return 'not_found';
    if (error.reason === 'NOT_A_CHANNEL_OR_GROUP') return 'not_channel';
  }
  switch (classifyApiError(error)) {
    case 'validation':
    case 'payload_too_large':
      return 'validation';
    case 'rate_limited':
      return 'rate_limited';
    case 'unavailable':
      return 'unavailable';
    case 'forbidden':
      return 'forbidden';
    case 'chat_id_taken':
      return 'chat_taken';
    case 'in_flight':
      return 'in_flight';
    case 'idempotency_key_reused':
      return 'key_reused';
    case 'stale_revision':
      return 'stale_revision';
    case 'destination_not_found':
    case 'not_found':
      return 'not_found_destination';
    default:
      return 'unexpected';
  }
}
