import { GrammyError } from 'grammy';
import type { TelegramOwnerMessageApi } from '../../integrations/telegram/telegram-api';
import type { ContentAlertRepository } from '../../modules/content-analytics';
import type { Logger } from '../../platform/logging/logger';
import { escapeHtml } from '../notifications/notice-template';

/** Per tick; the rest waits ten minutes for the next content-alerts tick. */
export const CONTENT_ALERT_BATCH_LIMIT = 2;
const CONTENT_ALERT_TIMEOUT_MS = 5_000;
/** A claim older than this never finished: the Worker was cut off mid-send. */
const STUCK_SENDING_MS = 2 * 60 * 1000;

// Sends raised content alerts to the owner. One attempt each: a rejection is `failed`, a timeout or a
// network error is `unknown` (the message may have arrived) and is never retried.
export async function sendContentAlerts(deps: {
  repo: Pick<ContentAlertRepository, 'listPending' | 'claim' | 'finish' | 'markStuckUnknown'>;
  messenger: TelegramOwnerMessageApi | null;
  ownerChatId: string | null;
  appOrigin: string | null;
  now: () => number;
  charge: (count: number) => void;
  logger: Logger;
}): Promise<{ sent: number; failed: number; unknown: number }> {
  const summary = { sent: 0, failed: 0, unknown: 0 };
  summary.unknown += await deps.repo.markStuckUnknown({
    startedBefore: deps.now() - STUCK_SENDING_MS,
    now: deps.now()
  });
  const pending = await deps.repo.listPending(CONTENT_ALERT_BATCH_LIMIT);
  for (const alert of pending) {
    if (!(await deps.repo.claim(alert.id, deps.now()))) continue;
    if (deps.messenger === null || deps.ownerChatId === null || deps.appOrigin === null) {
      const errorCode =
        deps.messenger === null
          ? 'BOT_NOT_CONFIGURED'
          : deps.ownerChatId === null
            ? 'OWNER_ID_MISSING'
            : 'APP_ORIGIN_UNKNOWN';
      await deps.repo.finish({ id: alert.id, now: deps.now(), status: 'failed', errorCode });
      summary.failed += 1;
      continue;
    }
    // Alerts raised before migration 0049 have no HTML: their plain text is escaped as before.
    const html = alert.html ?? `<b>${escapeHtml(alert.title)}</b>\n${escapeHtml(alert.body)}`;
    const origin = deps.appOrigin;
    const button = (text: string, linkPath: string) => [
      { text, web_app: { url: new URL(linkPath, origin).toString() } }
    ];
    const markup = {
      inline_keyboard: [
        ...alert.buttons.map((extra) =>
          'callbackData' in extra
            ? [{ text: extra.text, callback_data: extra.callbackData }]
            : button(extra.text, extra.linkPath)
        ),
        // A link to the studio's start page shows nothing the message didn't say: no button (owner, 30.10.2026).
        ...(alert.linkPath === '/'
          ? []
          : [
              button(
                alert.kind === 'source'
                  ? 'Открыть и обновить'
                  : alert.kind === 'item'
                    ? 'Открыть в студии'
                    : 'Открыть аналитику',
                alert.linkPath
              )
            ])
      ]
    };
    deps.charge(1);
    try {
      // A report goes as its rich message first (owner, 23.10.2026). Telegram refusing it (a definite 400: nothing was
      // sent) falls back to the classic message in the same tick; any other failure is handled as before.
      let sentRich = false;
      if (alert.richHtml != null) {
        sentRich = await deps.messenger
          .sendRichMessageWithKeyboard(
            deps.ownerChatId,
            { html: alert.richHtml, markup },
            AbortSignal.timeout(CONTENT_ALERT_TIMEOUT_MS)
          )
          .then(() => true)
          .catch((error: unknown) => {
            if (error instanceof GrammyError && error.error_code === 400) {
              deps.logger.warn({
                component: 'content-alerts',
                operation: 'alert_send_rich',
                jobId: alert.id,
                status: 'fallback',
                errorCode: 'RICH_REJECTED'
              });
              return false;
            }
            throw error;
          });
        if (!sentRich) deps.charge(1);
      }
      if (!sentRich)
        await deps.messenger.sendMessageWithKeyboard(
          deps.ownerChatId,
          { html, markup },
          AbortSignal.timeout(CONTENT_ALERT_TIMEOUT_MS)
        );
      await deps.repo.finish({ id: alert.id, now: deps.now(), status: 'sent' });
      summary.sent += 1;
    } catch (error) {
      const definite = error instanceof GrammyError;
      const status = definite ? 'failed' : 'unknown';
      const errorCode = definite ? 'TELEGRAM_REJECTED' : 'TELEGRAM_RESULT_UNKNOWN';
      await deps.repo.finish({ id: alert.id, now: deps.now(), status, errorCode });
      if (definite) summary.failed += 1;
      else summary.unknown += 1;
      deps.logger.warn({ component: 'content-alerts', operation: 'alert_send', jobId: alert.id, status, errorCode });
    }
  }
  return summary;
}
