import type { RaisedIncident } from '../../modules/publishing';
import { clip, escapeHtml } from './schedule-notice';

export const OPEN_BUTTON_TEXT = 'Открыть';

// What the owner reads for each stable incident code. A code this table does not know still gets an
// honest line (the code itself, which is ASCII and ours), never Telegram's own description.
const FAILURE_REASONS: Record<string, string> = {
  DESTINATION_UNAVAILABLE: 'бот потерял права на публикацию в канале или канал недоступен',
  CHAT_MIGRATED: 'канал переехал, нужно обновить его ID в настройках',
  CONTENT_INVALID: 'Telegram не принимает текст или он не проходит по длине',
  DESTINATION_DISABLED: 'канал выключен в настройках',
  BOT_UNAUTHORIZED: 'Telegram отклонил токен бота',
  RETRIES_EXHAUSTED: 'исчерпаны повторные попытки',
  PUBLICATION_MISSING: 'публикация не найдена'
};

export interface IncidentAlertMessage {
  /** Telegram HTML: every user-controlled part is escaped. */
  html: string;
  button: { text: string; url: string };
}

function openUrl(alert: RaisedIncident, appOrigin: string): string {
  if (alert.publicationId !== null) return `${appOrigin}/publications?id=${alert.publicationId}`;
  return `${appOrigin}/publications?status=${alert.kind === 'publish_unknown' ? 'unknown' : 'failed'}`;
}

export function formatIncidentAlert(alert: RaisedIncident, appOrigin: string): IncidentAlertMessage {
  const lines: string[] = [];
  const post = alert.postTitle?.trim() ?? '';
  const channel = alert.channelTitle?.trim() ?? '';
  if (alert.kind === 'publish_unknown') {
    lines.push('<b>Отправка не подтверждена</b>');
    if (post !== '') lines.push(`Пост: ${escapeHtml(clip(post))}`);
    if (channel !== '') lines.push(`Канал: ${escapeHtml(clip(channel))}`);
    lines.push('Сообщение могло выйти в канал. Проверьте канал вручную: бот не отправит его повторно сам.');
  } else {
    lines.push('<b>Публикация не отправлена</b>');
    if (post !== '') lines.push(`Пост: ${escapeHtml(clip(post))}`);
    if (channel !== '') lines.push(`Канал: ${escapeHtml(clip(channel))}`);
    lines.push(`Причина: ${escapeHtml(FAILURE_REASONS[alert.code] ?? `код ${alert.code}`)}`);
  }
  return { html: lines.join('\n'), button: { text: OPEN_BUTTON_TEXT, url: openUrl(alert, appOrigin) } };
}
