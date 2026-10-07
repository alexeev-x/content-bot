import { ApiError } from '../../../shared/api/http-client';
import { classifyApiError, type ApiErrorKind } from '../../../shared/api/error-kind';
import { copy } from '../ui/copy';

export type ActionContext = 'create' | 'reschedule' | 'cancel' | 'resolve';
export type ErrorTone = 'info' | 'warning' | 'error' | 'conflict';

/** `post_archived` is 409 POST_ARCHIVED of POST /publications, which the shared classifier does not know. */
export type ActionErrorKind = ApiErrorKind | 'post_archived';

export type ActionError = {
  kind: ActionErrorKind;
  tone: ErrorTone;
  title: string;
  body: string;
  requestId?: string;
};

/** Plain-Russian text for a failed publication action; the caller keeps whatever the owner typed. */
export function describeActionError(error: unknown, context: ActionContext): ActionError {
  const kind: ActionErrorKind =
    error instanceof ApiError && error.code === 'CONFLICT' && error.reason === 'POST_ARCHIVED'
      ? 'post_archived'
      : classifyApiError(error);
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const make = (tone: ErrorTone, text: { title: string; body: string }): ActionError => ({
    kind,
    tone,
    ...text,
    ...(requestId ? { requestId } : {})
  });
  const e = copy.errors;
  switch (kind) {
    case 'post_not_approved':
      return make('error', e.postNotApproved);
    case 'post_archived':
      return make('conflict', e.postArchived);
    case 'stale_revision':
      return make('conflict', context === 'create' ? e.stale : e.staleDetail);
    case 'destination_disabled':
      return make('error', e.destinationDisabled);
    case 'destination_not_found':
      return make('error', e.destinationMissing);
    case 'post_not_found':
      return make('error', e.postMissing);
    case 'schedule_out_of_range':
      return make('error', e.outOfRange);
    case 'in_flight':
      return make('warning', e.inFlight);
    case 'idempotency_key_reused':
      return make('error', e.keyReused);
    case 'rate_limited':
      return make('warning', e.rateLimited(error instanceof ApiError ? error.retryAfterSeconds : undefined));
    case 'not_reschedulable':
      return make('conflict', e.notReschedulable);
    case 'not_cancellable':
      return make('conflict', e.notCancellable);
    case 'not_unknown':
      return make('conflict', e.notUnknown);
    case 'not_found':
      return make('error', e.notFoundDetail);
    case 'forbidden':
      return make('error', e.forbidden);
    case 'unavailable':
      // A create that timed out may still have reached the server: say so instead of "try again".
      return context === 'create' ? make('warning', e.unavailableCreate) : make('error', e.unavailable);
    default:
      return make('error', e.unexpected);
  }
}

/** Kinds after which the action can never succeed as typed: submit stays disabled until the owner changes something. */
export function isTerminalForAction(kind: ActionErrorKind): boolean {
  return kind === 'not_cancellable' || kind === 'not_reschedulable' || kind === 'not_unknown' || kind === 'not_found';
}

/** Short explanation of `lastErrorCode`; an unknown code is shown raw next to a neutral sentence. */
export function explainErrorCode(code: string): string {
  const known: Record<string, string> = copy.errorCodes;
  return Object.hasOwn(known, code) ? (known[code] ?? copy.errorCodes.fallback) : copy.errorCodes.fallback;
}
