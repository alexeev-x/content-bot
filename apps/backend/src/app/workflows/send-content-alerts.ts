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
    const html = `<b>${escapeHtml(alert.title)}</b>\n${escapeHtml(alert.body)}`;
    const button = {
      text: alert.kind === 'source' ? 'Открыть настройки' : 'Открыть аналитику',
      url: new URL(alert.linkPath, deps.appOrigin).toString()
    };
    deps.charge(1);
    try {
      await deps.messenger.sendMessageWithWebAppButton(
        deps.ownerChatId,
        { html, button },
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
