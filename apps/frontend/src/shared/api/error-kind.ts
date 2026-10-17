import { ApiError } from './http-client';

export type ApiErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'unavailable'
  | 'payload_too_large'
  | 'validation'
  | 'empty_body'
  | 'entities_too_many'
  | 'entities_too_large'
  | 'entities_out_of_range'
  | 'entities_split_surrogate'
  | 'entities_invalid_nesting'
  | 'entities_required'
  | 'schedule_out_of_range'
  | 'not_found'
  | 'post_not_found'
  | 'destination_not_found'
  | 'conflict'
  | 'stale_revision'
  | 'not_editable'
  | 'already_approved'
  | 'idempotency_key_reused'
  | 'in_flight'
  | 'post_not_approved'
  | 'already_published'
  | 'destination_disabled'
  | 'not_cancellable'
  | 'not_reschedulable'
  | 'not_unknown'
  | 'chat_id_taken'
  | 'unknown_send_result'
  | 'unexpected';

// Only the code/reason pairings documented in apps/contracts refine a code.
const REASONS: Partial<Record<ApiError['code'], Record<string, ApiErrorKind>>> = {
  VALIDATION_ERROR: {
    EMPTY_BODY: 'empty_body',
    SCHEDULE_OUT_OF_RANGE: 'schedule_out_of_range',
    ENTITIES_TOO_MANY: 'entities_too_many',
    ENTITIES_TOO_LARGE: 'entities_too_large',
    ENTITIES_OUT_OF_RANGE: 'entities_out_of_range',
    ENTITIES_SPLIT_SURROGATE: 'entities_split_surrogate',
    ENTITIES_INVALID_NESTING: 'entities_invalid_nesting',
    ENTITIES_REQUIRED: 'entities_required'
  },
  NOT_FOUND: { POST_NOT_FOUND: 'post_not_found', DESTINATION_NOT_FOUND: 'destination_not_found' },
  CONFLICT: {
    STALE_REVISION: 'stale_revision',
    NOT_EDITABLE: 'not_editable',
    ALREADY_APPROVED: 'already_approved',
    IDEMPOTENCY_KEY_REUSED: 'idempotency_key_reused',
    IN_FLIGHT: 'in_flight',
    POST_NOT_APPROVED: 'post_not_approved',
    ALREADY_PUBLISHED: 'already_published',
    DESTINATION_DISABLED: 'destination_disabled',
    NOT_CANCELLABLE: 'not_cancellable',
    NOT_RESCHEDULABLE: 'not_reschedulable',
    NOT_UNKNOWN: 'not_unknown',
    CHAT_ID_TAKEN: 'chat_id_taken'
  }
};

const BY_CODE: Record<ApiError['code'], ApiErrorKind> = {
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  VALIDATION_ERROR: 'validation',
  CONFLICT: 'conflict',
  NOT_FOUND: 'not_found',
  RATE_LIMIT: 'rate_limited',
  UNAVAILABLE: 'unavailable',
  UNKNOWN_SEND_RESULT: 'unknown_send_result'
};

/** Stable key for UI copy: screens map kinds to Russian text and decide what to keep or disable. */
export function classifyApiError(error: unknown): ApiErrorKind {
  if (!(error instanceof ApiError)) return 'unexpected';
  if (error.status === 413) return 'payload_too_large';
  const byReason = error.reason === undefined ? undefined : REASONS[error.code]?.[error.reason];
  return byReason ?? BY_CODE[error.code];
}
