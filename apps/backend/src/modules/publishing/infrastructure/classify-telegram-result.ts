import { GrammyError, HttpError } from 'grammy';
import type { SendOutcome } from '../application/ports';

// Permission wording also contains "text" ("not enough rights to send text messages"), so it is checked first.
const DESTINATION_ERROR = /chat not found|not enough rights|have no rights|administrator rights/i;
// "message is too long" carries none of the other words, yet it is the content's fault.

// Telegram has no idempotency for sendMessage/sendPhoto: unless the Bot API clearly says
// "refused", the safe answer is `unknown` (manual reconcile), never an automatic retry.
export function classifyTelegramError(error: unknown): SendOutcome {
  if (error instanceof GrammyError) return classifyApiError(error);
  if (error instanceof HttpError) return { kind: 'unknown', reason: 'network_error' };
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return { kind: 'unknown', reason: 'timeout' };
  }
  return { kind: 'unknown', reason: 'unexpected_error' };
}

function classifyApiError(error: GrammyError): SendOutcome {
  const code = error.error_code;
  const retryAfter = error.parameters.retry_after;

  if (code === 429 && typeof retryAfter === 'number') return { kind: 'rate_limited', retryAfterSec: retryAfter };
  if (code === 400) {
    if (error.parameters.migrate_to_chat_id !== undefined) return { kind: 'rejected', code: 'CHAT_MIGRATED' };
    if (DESTINATION_ERROR.test(error.description)) return { kind: 'rejected', code: 'DESTINATION_UNAVAILABLE' };
    return { kind: 'rejected', code: 'CONTENT_INVALID' };
  }
  // The Bot API answers 401 (and 404 for a malformed path) when the token is wrong: Telegram refused
  // before doing anything, so this is a definite refusal that needs the owner, not an unknown send.
  if (code === 401 || code === 404) return { kind: 'rejected', code: 'BOT_UNAUTHORIZED' };
  if (code === 403) return { kind: 'rejected', code: 'DESTINATION_UNAVAILABLE' };
  return { kind: 'unknown', reason: `telegram_http_${code}` };
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
