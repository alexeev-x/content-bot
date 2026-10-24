import type { OwnerIncidentAlertGroup, RaisedIncident } from '../../modules/publishing';
import { channelFact, formatOwnerTime, noticeHtml, timesRu, type NoticeFact, type NoticeTone } from './notice-template';

const OPEN_BUTTON_TEXT = 'Открыть';

// What the owner reads for each stable incident code. A code this table does not know still gets an
// honest line (the code itself, which is ASCII and ours), never Telegram's own description.
const FAILURE_REASONS: Record<string, string> = {
  DESTINATION_UNAVAILABLE: 'бот потерял права на публикацию в канале или канал недоступен',
  CHAT_MIGRATED: 'канал переехал, нужно обновить его ID в настройках',
  CONTENT_INVALID: 'Telegram не принимает текст или он не проходит по длине',
  DESTINATION_DISABLED: 'канал выключен в настройках',
  BOT_UNAUTHORIZED: 'Telegram отклонил токен бота',
  RETRIES_EXHAUSTED: 'исчерпаны повторные попытки',
  PUBLICATION_MISSING: 'публикация не найдена',
  TELEGRAM_MEDIA_UNSUPPORTED: 'Telegram не принимает такой набор медиа (больше 10 файлов или GIF в альбоме)',
  TELEGRAM_MEDIA_TOO_LARGE: 'файлы поста вместе больше 90 МБ — их не успеть загрузить в Telegram'
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

function formatIncidentAlert(
  alert: RaisedIncident,
  appOrigin: string,
  extra: { status?: string; tone?: NoticeTone; facts?: NoticeFact[] } = {}
): IncidentAlertMessage {
  const unknown = alert.kind === 'publish_unknown';
  const html = noticeHtml({
    tone: extra.tone ?? (unknown ? 'unknown' : 'failed'),
    status: extra.status ?? (unknown ? 'Отправка не подтверждена' : 'Публикация не отправлена'),
    subject: alert.postTitle,
    facts: [
      channelFact(alert.channelTitle),
      unknown ? null : { icon: '💬', text: `Причина: ${FAILURE_REASONS[alert.code] ?? `код ${alert.code}`}` },
      ...(extra.facts ?? [])
    ],
    ...(extra.tone === 'recovered'
      ? {}
      : {
          note: unknown
            ? 'Сообщение могло выйти в канал. Проверьте канал и отметьте результат: бот не отправит его повторно сам.'
            : 'Откройте публикацию, чтобы перенести её или отправить заново.'
        })
  });
  return { html, button: { text: OPEN_BUTTON_TEXT, url: openUrl(alert, appOrigin) } };
}

function incidentOf(group: OwnerIncidentAlertGroup): RaisedIncident {
  return {
    id: group.groupKey,
    kind: group.kind,
    code: group.code,
    publicationId: group.publicationId,
    postTitle: group.postTitle,
    channelTitle: group.channelTitle
  };
}

export function formatOwnerIncidentOccurrence(
  group: OwnerIncidentAlertGroup,
  appOrigin: string,
  timezone: string
): IncidentAlertMessage {
  const repeated = group.occurrenceCount > 1;
  return formatIncidentAlert(incidentOf(group), appOrigin, {
    ...(repeated ? { tone: 'repeat' as const } : {}),
    facts: repeated
      ? [
          { icon: '🔂', text: `Повторилось ${timesRu(group.occurrenceCount)}` },
          { icon: '🕒', text: `Впервые: ${formatOwnerTime(group.firstSeenAt, timezone)}` }
        ]
      : []
  });
}

export function formatOwnerIncidentRecovery(group: OwnerIncidentAlertGroup, appOrigin: string): IncidentAlertMessage {
  const recoveredAt = group.recoveredAt ?? group.lastSeenAt;
  const durationMs = Math.max(0, recoveredAt - group.firstSeenAt);
  const minutes = Math.floor(durationMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const duration = hours > 0 ? `${hours} ч ${minutes % 60} мин` : `${minutes} мин`;
  return formatIncidentAlert(incidentOf(group), appOrigin, {
    tone: 'recovered',
    status: 'Снова работает',
    facts: [{ icon: '⏱', text: `Сбой длился ${duration}` }]
  });
}
