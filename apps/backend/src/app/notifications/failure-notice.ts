import type { TelegramOwnerMessageApi } from '../../integrations/telegram/telegram-api';
import type { Clock } from '../../platform/clock';
import { describeError } from '../../platform/error-detail';
import type { Logger } from '../../platform/logging/logger';
import type { SystemStateStore } from '../system-state';
import { escapeHtml } from './notice-template';

// The same failure is told once per window (owner, 28.10.2026: every failure reaches the owner, but never a flood).
const FAILURE_NOTICE_WINDOW_MS = 30 * 60_000;
const NOTICE_TIMEOUT_MS = 5_000;
// Telegram answers these to a stale button or an edit that changed nothing: not a failure of ours.
const EXPECTED_TELEGRAM = /message is not modified|query is too old|message to (edit|delete) not found/i;

export interface FailureNoticeDeps {
  messenger: TelegramOwnerMessageApi | null;
  /** In a private chat, the owner's Telegram id is the chat id. */
  ownerChatId: string | null;
  state: Pick<SystemStateStore, 'claimFailureNotice'>;
  clock: Clock;
  logger: Logger;
}

async function noticeKey(where: string, line: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${where}\n${line}`));
  const hex = Array.from(new Uint8Array(digest).slice(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `failure_notice:${hex}`;
}

/**
 * Tells the owner in his chat what failed: where, and `describeError`'s one line (API, step, code, HTTP status, the
 * provider's own words; no secrets). Never throws: a notice is a courtesy and must not turn a failure into two.
 * `where` is a stable label (a job kind, a Cron step), so a repeat of the same failure is recognised.
 */
export async function notifyOwnerOfFailure(
  deps: FailureNoticeDeps,
  input: { where: string; error: unknown; requestId?: string; operation?: string }
): Promise<void> {
  const { messenger, ownerChatId } = deps;
  if (messenger === null || ownerChatId === null) return;
  try {
    const line = describeError(input.error, input.operation);
    if (EXPECTED_TELEGRAM.test(line)) return;
    const claimed = await deps.state.claimFailureNotice(
      await noticeKey(input.where, line),
      deps.clock.now(),
      FAILURE_NOTICE_WINDOW_MS
    );
    if (!claimed) return;
    const html = [
      `⚠️ <b>Сбой: ${escapeHtml(input.where)}</b>`,
      `<code>${escapeHtml(line)}</code>`,
      ...(input.requestId === undefined ? [] : [`<i>запрос ${escapeHtml(input.requestId)}</i>`])
    ].join('\n');
    await messenger.sendMessageWithKeyboard(
      ownerChatId,
      { html, markup: { inline_keyboard: [] } },
      AbortSignal.timeout(NOTICE_TIMEOUT_MS)
    );
  } catch (error) {
    deps.logger.warn({
      component: 'owner_alert',
      operation: 'failure_notice',
      status: 'failed',
      errorCode: 'FAILURE_NOTICE_FAILED',
      detail: describeError(error)
    });
  }
}
