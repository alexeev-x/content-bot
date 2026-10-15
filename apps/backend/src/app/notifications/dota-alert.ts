import type { DotaDraftSource, DotaSourceIncident } from '../../modules/dota';
import { clip, escapeHtml, noticeHtml } from './notice-template';

const DOTA_INCIDENT_BUTTON_TEXT = 'Открыть источники';

const EVENT_LABEL: Record<DotaDraftSource['eventType'], string> = {
  patch: 'Патч',
  treasure: 'Сокровищница',
  news: 'Новость'
};

// What the owner reads for a stable source code; an unknown code still gets an honest line.
const SOURCE_REASONS: Record<string, string> = {
  DOTA_SOURCE_FETCH: 'источник не ответил вовремя или недоступен',
  DOTA_SOURCE_HTTP: 'источник ответил ошибкой',
  DOTA_SOURCE_BODY_LIMIT: 'ответ источника слишком большой',
  DOTA_SOURCE_SHAPE: 'источник прислал данные в неожиданном виде',
  DOTA_SOURCE_STORE: 'не удалось сохранить новые события',
  DOTA_PATCH_DETAIL_FETCH: 'разбор патча не загрузился',
  DOTA_PATCH_DETAIL_HTTP: 'разбор патча ответил ошибкой',
  DOTA_PATCH_DETAIL_JSON: 'разбор патча пришёл повреждённым',
  DOTA_PATCH_DETAIL_SHAPE: 'разбор патча в неожиданном виде',
  DOTA_PATCH_DETAIL_BODY_LIMIT: 'разбор патча слишком большой',
  DOTA_PATCH_NAME_MAPS_UNAVAILABLE: 'нет справочника имён героев и предметов'
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
      ? `Патч-ноты Dota ${incident.externalId}`
      : incident.sourceKey === 'steam_news'
        ? 'Steam News'
        : 'Патч-ноты Dota';
  const reason = SOURCE_REASONS[incident.code] ?? `код ${incident.code}`;
  const recovered = incident.resolvedAt !== null;
  return {
    html: recovered
      ? noticeHtml({
          tone: 'recovered',
          status: 'Источник Dota снова работает',
          subject: source,
          facts: [{ icon: '💬', text: `Был сбой: ${reason}` }]
        })
      : noticeHtml({
          tone: 'warning',
          status: 'Источник Dota не обновился',
          subject: source,
          facts: [{ icon: '💬', text: `Причина: ${reason}` }],
          note: 'Студия проверит его снова сама; новые события придут, когда источник ответит.'
        }),
    button: { text: DOTA_INCIDENT_BUTTON_TEXT, url: `${appOrigin}/sources` }
  };
}

// «Обновление Dota совпало с отслеживанием»: a watched hero or item appears in new patch notes.
export function formatDotaWatchlistAlert(alert: {
  entityType: 'hero' | 'item';
  entityName: string;
  title: string;
}): string {
  return `<b>Обновление Dota совпало с отслеживанием</b>\n${alert.entityType === 'hero' ? 'Герой' : 'Предмет'}: ${escapeHtml(alert.entityName)}\n${escapeHtml(alert.title)}`;
}
