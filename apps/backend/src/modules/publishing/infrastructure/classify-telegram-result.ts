import { GrammyError, HttpError } from 'grammy';
import { boundDetail, causeDetail } from '../../../platform/error-detail';
import type { SendOutcome } from '../application/ports';

// Permission wording also contains "text" ("not enough rights to send text messages"), so it is checked first.
const DESTINATION_ERROR = /chat not found|not enough rights|have no rights|administrator rights/i;
// "message is too long" carries none of the other words, yet it is the content's fault.

const DEFAULT_RETRY_AFTER_SEC = 30;

// Telegram has no idempotency for sendMessage/sendPhoto: unless the Bot API clearly says
// "refused", the safe answer is `unknown` (manual reconcile), never an automatic retry.
export function classifyTelegramError(error: unknown): SendOutcome {
  if (error instanceof GrammyError) return classifyApiError(error);
  const detail = causeDetail(error);
  const withDetail = detail === undefined ? {} : { detail };
  if (error instanceof HttpError) return { kind: 'unknown', reason: 'network_error', ...withDetail };
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return { kind: 'unknown', reason: 'timeout', ...withDetail };
  }
  // An unknown Error's message can hold anything: report only its class.
  return { kind: 'unknown', reason: 'unexpected_error', detail: error instanceof Error ? error.name : 'unknown' };
}

function classifyApiError(error: GrammyError): SendOutcome {
  const code = error.error_code;
  const detail = boundDetail(`${error.method}: ${error.description}`);
  const retryAfter = error.parameters.retry_after;

  // A 429 is a refusal with or without its wait (review 24.10.2026: without one it was `unknown`); a missing wait gets
  // a conservative one.
  if (code === 429)
    return {
      kind: 'rate_limited',
      retryAfterSec: typeof retryAfter === 'number' ? retryAfter : DEFAULT_RETRY_AFTER_SEC
    };
  // 413: the upload was too large, refused before anything was posted.
  if (code === 413) return { kind: 'rejected', code: 'CONTENT_INVALID', detail };
  if (code === 400) {
    if (error.parameters.migrate_to_chat_id !== undefined) return { kind: 'rejected', code: 'CHAT_MIGRATED', detail };
    if (DESTINATION_ERROR.test(error.description)) return { kind: 'rejected', code: 'DESTINATION_UNAVAILABLE', detail };
    return { kind: 'rejected', code: 'CONTENT_INVALID', detail };
  }
  // The Bot API answers 401 (and 404 for a malformed path) when the token is wrong: Telegram refused
  // before doing anything, so this is a definite refusal that needs the owner, not an unknown send.
  if (code === 401 || code === 404) return { kind: 'rejected', code: 'BOT_UNAUTHORIZED', detail };
  if (code === 403) return { kind: 'rejected', code: 'DESTINATION_UNAVAILABLE', detail };
  return { kind: 'unknown', reason: `telegram_http_${code}`, detail };
}

// A successful sendMessage/sendPhoto result must carry a positive safe integer message_id; otherwise we cannot prove
// what was published, so it is `unknown` rather than `sent`.
export function classifySendResult(result: unknown): SendOutcome {
  if (typeof result === 'object' && result !== null && 'message_id' in result) {
    const id = result.message_id;
    if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) {
      return { kind: 'sent', externalMessageIds: [String(id)] };
    }
  }
  return { kind: 'unknown', reason: 'ok_without_message_id' };
}
