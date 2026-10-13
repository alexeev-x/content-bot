import type { TelegramOwnerMessageApi } from '../../integrations/telegram/telegram-api';
import { type DotaWatchlistRepository } from '../../modules/dota-watchlists';
import type { Logger } from '../../platform/logging/logger';
import { GrammyError } from 'grammy';
import { escapeHtml } from '../notifications/schedule-notice';

export const DOTA_WATCHLIST_ALERT_BATCH_LIMIT = 2;
export const DOTA_WATCHLIST_ALERT_TIMEOUT_MS = 5_000;

export async function sendDotaWatchlistAlerts(deps: {
  repo: Pick<DotaWatchlistRepository, 'listPending' | 'claimAlert' | 'finishAlert'>;
  messenger: TelegramOwnerMessageApi | null;
  ownerChatId: string | null;
  appOrigin: string | null;
  now: () => number;
  logger: Logger;
}): Promise<{ sent: number; failed: number; unknown: number; claimed: number }> {
  const summary = { sent: 0, failed: 0, unknown: 0, claimed: 0 };
  const pending = await deps.repo.listPending(DOTA_WATCHLIST_ALERT_BATCH_LIMIT);
  for (const alert of pending) {
    if (!(await deps.repo.claimAlert(alert.id, deps.now()))) continue;
    summary.claimed += 1;
    if (deps.messenger === null || deps.ownerChatId === null || deps.appOrigin === null) {
      const errorCode =
        deps.messenger === null
          ? 'BOT_NOT_CONFIGURED'
          : deps.ownerChatId === null
            ? 'OWNER_ID_MISSING'
            : 'APP_ORIGIN_UNKNOWN';
      await deps.repo.finishAlert({ id: alert.id, now: deps.now(), status: 'failed', errorCode });
      summary.failed += 1;
      continue;
    }
    const url = new URL('/sources', deps.appOrigin);
    url.searchParams.set('update', `patch_notes:${alert.externalId}`);
    const html = `<b>Обновление Dota совпало с отслеживанием</b>\n${alert.entityType === 'hero' ? 'Герой' : 'Предмет'}: ${escapeHtml(alert.entityName)}\n${escapeHtml(alert.title)}`;
    try {
      await deps.messenger.sendMessageWithWebAppButton(
        deps.ownerChatId,
        { html, button: { text: 'Открыть обновление', url: url.toString() } },
        AbortSignal.timeout(DOTA_WATCHLIST_ALERT_TIMEOUT_MS)
      );
      await deps.repo.finishAlert({ id: alert.id, now: deps.now(), status: 'sent' });
      summary.sent += 1;
    } catch (error) {
      const definite = error instanceof GrammyError;
      const status = definite ? 'failed' : 'unknown';
      const errorCode = definite ? 'TELEGRAM_REJECTED' : 'TELEGRAM_RESULT_UNKNOWN';
      await deps.repo.finishAlert({ id: alert.id, now: deps.now(), status, errorCode });
      if (definite) summary.failed += 1;
      else summary.unknown += 1;
      deps.logger.warn({
        component: 'dota_watchlist',
        operation: 'alert_send',
        jobId: alert.id,
        status,
        errorCode
      });
    }
  }
  return summary;
}
