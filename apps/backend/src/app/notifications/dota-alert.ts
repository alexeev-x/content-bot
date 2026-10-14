import type { DotaDraftSource, DotaSourceIncident } from '../../modules/dota';
import { clip, escapeHtml } from './schedule-notice';

const DOTA_INCIDENT_BUTTON_TEXT = 'Открыть студию';

const EVENT_LABEL: Record<DotaDraftSource['eventType'], string> = {
  patch: 'Патч',
  treasure: 'Сокровищница',
  news: 'Новость'
};

// «<тип>: <заголовок> — черновик готов»; the buttons come from the publish keyboard.
export function formatDotaDraftAlert(source: Pick<DotaDraftSource, 'eventType' | 'title'>): string {
  return `<b>${EVENT_LABEL[source.eventType]}: ${escapeHtml(clip(source.title))} — черновик готов</b>`;
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
