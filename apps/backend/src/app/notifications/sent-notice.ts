import type { OwnerOperationsSettingsDto } from '@alexeev/contracts';
import type { InlineKeyboardMarkup } from '@grammyjs/types';
import type { TelegramOwnerMessageApi } from '../../integrations/telegram/telegram-api';
import type { DeliveredPublication } from '../../modules/publishing';
import type { Logger } from '../../platform/logging/logger';
import { AppError } from '../../shared/app-error';
import { createTelegramCaller } from '../bot/telegram-call';
import { channelFact, noticeHtml, telegramMessageUrl } from './notice-template';

const NOTICE_TIMEOUT_MS = 5_000;
// Each notice is one Telegram subrequest of the tick's 50; the rest of a big batch is simply not announced.
const MAX_NOTICES_PER_TICK = 3;

export interface SentNoticeDeps {
  messenger: TelegramOwnerMessageApi | null;
  ownerChatId: string | null;
  readAppOrigin: () => Promise<string | null>;
  readPreferences: () => Promise<OwnerOperationsSettingsDto>;
  logger: Logger;
  timeoutMs?: number;
}

export function formatSentNotice(
  delivered: DeliveredPublication,
  appOrigin: string
): { html: string; markup: InlineKeyboardMarkup } {
  const url = telegramMessageUrl(delivered.chatId, delivered.externalMessageId);
  const html = noticeHtml({
    tone: 'sent',
    status: 'Опубликовано',
    subject: delivered.postTitle,
    facts: [
      channelFact(delivered.channelTitle),
      delivered.externalMessageId === null ? null : { icon: '🔗', text: `Сообщение № ${delivered.externalMessageId}` }
    ]
  });
  const details = { text: 'Подробнее', web_app: { url: `${appOrigin}/publications?id=${delivered.publicationId}` } };
  return {
    html,
    markup: { inline_keyboard: [url === null ? [details] : [{ text: 'Открыть в Telegram', url }, details]] }
  };
}

/**
 * «Опубликовано» to the owner after the tick stored its outcomes: only for sends whose `succeeded` write applied,
 * at most a few per tick, never retried (a lost notice is harmless; the panel shows the truth). Follows the
 * owner's «Опубликовано» switch.
 */
export async function notifyOwnerOfDeliveries(
  deps: SentNoticeDeps,
  delivered: readonly DeliveredPublication[]
): Promise<{ sent: number; failed: number }> {
  const summary = { sent: 0, failed: 0 };
  if (delivered.length === 0) return summary;
  const log = (status: 'sent' | 'skipped' | 'failed', errorCode?: string) =>
    deps.logger[status === 'failed' ? 'warn' : 'info']({
      component: 'owner_notice',
      operation: 'sent_notice',
      status,
      ...(errorCode === undefined ? {} : { errorCode })
    });
  const { messenger, ownerChatId } = deps;
  if (messenger === null || ownerChatId === null) {
    log('skipped', messenger === null ? 'BOT_TOKEN_MISSING' : 'OWNER_ID_MISSING');
    return summary;
  }
  let appOrigin: string | null;
  let preferences: OwnerOperationsSettingsDto;
  try {
    appOrigin = await deps.readAppOrigin();
    preferences = await deps.readPreferences();
  } catch {
    log('failed', 'NOTICE_STATE_UNAVAILABLE');
    return { sent: 0, failed: 1 };
  }
  if (appOrigin === null) {
    log('skipped', 'APP_ORIGIN_UNKNOWN');
    return summary;
  }
  if (!preferences.notifications.sentNotices) {
    log('skipped', 'NOTICE_CATEGORY_DISABLED');
    return summary;
  }
  const call = createTelegramCaller({ logger: deps.logger, timeoutMs: deps.timeoutMs ?? NOTICE_TIMEOUT_MS });
  for (const item of delivered.slice(0, MAX_NOTICES_PER_TICK)) {
    try {
      const notice = formatSentNotice(item, appOrigin);
      await call.act('sent_notice.send', (signal) => messenger.sendMessageWithKeyboard(ownerChatId, notice, signal));
      summary.sent += 1;
      log('sent');
    } catch (error) {
      summary.failed += 1;
      log('failed', error instanceof AppError ? error.code : 'UNEXPECTED_ERROR');
    }
  }
  return summary;
}
