import type { DotaDraftSource, DotaSourceIncident } from '../../modules/dota';
import { clip, escapeHtml } from './schedule-notice';

export const DOTA_ALERT_BUTTON_TEXT = 'Открыть черновик';
export const DOTA_INCIDENT_BUTTON_TEXT = 'Открыть студию';

type AlertableDotaDraft = Omit<DotaDraftSource, 'draftPostId'> & { draftPostId: string };

export function formatDotaDraftAlert(
  source: AlertableDotaDraft,
  appOrigin: string
): {
  html: string;
  button: { text: string; url: string };
} {
  const title = escapeHtml(clip(source.title));
  const date = new Date(source.publishedAt).toISOString().slice(0, 10);
  return {
    html: `<b>Вышло обновление Dota — черновик готов</b>\n${title}\nОпубликовано: ${date}`,
    button: { text: DOTA_ALERT_BUTTON_TEXT, url: `${appOrigin}/posts/${source.draftPostId}` }
  };
}

export function formatDotaIncidentAlert(
  incident: DotaSourceIncident,
  appOrigin: string
): {
  html: string;
  button: { text: string; url: string };
} {
  const source =
    incident.externalId !== null
      ? `Патч-ноты Dota ${escapeHtml(incident.externalId)}`
      : incident.sourceKey === 'steam_news'
        ? 'Steam News'
        : 'Патч-ноты Dota';
  const recovered = incident.resolvedAt !== null;
  return {
    html: recovered
      ? `<b>Источник Dota восстановился</b>\nИсточник: ${source}\nПоследняя ошибка: ${incident.code}`
      : `<b>Не удалось обновить источник Dota</b>\nИсточник: ${source}\nКод: ${incident.code}`,
    button: { text: DOTA_INCIDENT_BUTTON_TEXT, url: `${appOrigin}/` }
  };
}
