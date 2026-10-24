import type { Clock } from '../../platform/clock';
import type { AlertButton, ContentAlertRepository, NewContentAlert } from './d1-content-alerts-repository';
import type { CheckpointRow, ItemRow, SourceRow } from './d1-content-analytics-repository';
import { type AlertContamination, contaminationCallbackData } from './contamination-callback';
import { baselineFor } from './service';
import type { ContentPlatform } from './types';

// Bot alerts raised from the collected counters. Every rule reads what the
// analytics page already computes; the dedup key in the alert id keeps overlapping ticks from raising
// one alert twice.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Checkpoints that may raise an item alert; the latest one recorded decides. */
const ALERT_CHECKPOINTS = [24, 6, 3] as const;
/** The 24 h checkpoint is recorded by 25.5 h; older items no longer raise alerts. */
const ITEM_ALERT_WINDOW_MS = 26 * HOUR_MS;
const RISING = 1.5;
const BELOW = 0.7;
/** A usual value this small is noise (a few views either way doubles it). */
const MIN_USUAL_VIEWS = 20;
/** Usual curves come from items tracked from birth over this window, as on the page. */
const BASELINE_WINDOW_MS = 90 * DAY_MS;
/** A source that worked before and has failed this long raises an alert (Cron retries every 15 minutes). */
const SOURCE_OUTAGE_MS = 3 * HOUR_MS;
/** TikTok videos are watched for a freeze or a disappearance this long after publishing. */
const WATCH_WINDOW_MS = 7 * DAY_MS;
/** Snapshots are hourly for 72 hours, then daily: the freeze window follows them. */
const HOURLY_SNAPSHOTS_MS = 72 * HOUR_MS;
const STALL_MIN_VIEWS = 300;
/** The window before the freeze must have grown at least this much: a quiet video is not «stopped». */
const STALL_MIN_PRIOR_GAIN = 100;
/** The item must have been seen by a collection this recently, or «no growth» only means «no data». */
const FRESH_OBSERVATION_MS = 90 * 60 * 1000;
/** Alerts inserted per tick; the rest still qualify on the next tick. Keeps the D1 budget fixed. */
export const NEW_ALERTS_PER_TICK = 3;

const PLATFORM_LABEL: Record<ContentPlatform, string> = {
  telegram: 'Telegram',
  youtube: 'YouTube',
  tiktok: 'TikTok'
};

const exact = new Intl.NumberFormat('ru-RU');
const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });

export function count(value: number): string {
  const whole = Math.round(value);
  return whole < 10_000 ? exact.format(whole) : compact.format(whole);
}

function multiple(value: number): string {
  return `${(Math.round(value * 10) / 10).toLocaleString('ru-RU')}×`;
}

function itemTitle(item: ItemRow, max: number): string {
  // Hashtags are for the platforms' search, not for reading the title in an alert.
  const words = item.title
    .replace(/(^|\s)#[^\s#]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const title = words || (item.thumbnailUrl === null ? 'Без текста' : 'Фото или видео');
  // By code point, so an emoji is never cut in half.
  const chars = Array.from(title);
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`
    : title;
}

function itemLink(item: ItemRow): string {
  return `/analytics?id=${encodeURIComponent(item.id)}`;
}

/** Hour, minute and weekday (0 = Monday) of an instant in the owner's zone. */
export function zoned(at: number, timezone: string): { weekday: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(at));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    weekday: Math.max(0, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'))),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second'))
  };
}

export function zonedDate(at: number, timezone: string): string {
  // en-CA gives YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(at));
}

function shortDay(at: number, timezone: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, day: 'numeric', month: 'short' }).format(new Date(at));
}

function shortTime(at: number, timezone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(at));
}

/** Telegram HTML needs these three escaped. */
function esc(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function bar(fraction: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(fraction * 10)));
  return `${'▓'.repeat(filled)}${'░'.repeat(10 - filled)}`;
}

interface ItemAlertFacts {
  item: ItemRow;
  direction: 'rising' | 'below';
  hours: number;
  views: number;
  usual: number;
}

function itemAlertText({ item, direction, hours, views, usual }: ItemAlertFacts): {
  title: string;
  body: string;
} {
  const where = `«${itemTitle(item, 80)}» в ${PLATFORM_LABEL[item.platform]}`;
  const numbers = `${multiple(views / usual)} обычного на ${hours} ч: ${count(views)} просмотров при обычных ${count(usual)}.`;
  return direction === 'rising'
    ? { title: `Залетает: ${where}`, body: `${numbers}\nПовторите тему или первую фразу, пока интерес высокий.` }
    : { title: `Идёт слабее обычного: ${where}`, body: `${numbers}\nПроверьте первую строку, обложку и время выхода.` };
}

/** «🚀 Залетает · TikTok»: the card style the owner chose on 15.10.2026. */
function itemAlertHtml({ item, direction, hours, views, usual }: ItemAlertFacts): string {
  const rising = direction === 'rising';
  return [
    `${rising ? '🚀' : '🐢'} <b>${rising ? 'Залетает' : 'Идёт слабее обычного'}</b> · ${PLATFORM_LABEL[item.platform]}`,
    `«${esc(itemTitle(item, 80))}»`,
    '',
    // The owner reads a ratio below 1 as noise (15.10.2026): a weak item shows only its numbers.
    ...(rising ? [`<b>${multiple(views / usual)}</b> обычного за ${hours} ч`] : []),
    `<blockquote>👀 ${count(views)} просмотров\n📈 обычно ${count(usual)}</blockquote>`,
    `💡 <i>${rising ? 'Повторите тему или первую фразу, пока интерес высокий.' : 'Проверьте первую строку, обложку и время выхода.'}</i>`
  ].join('\n');
}

/** A young item against its platform's usual curve at the latest recorded alert checkpoint. */
export function itemAlerts(items: readonly ItemRow[], checkpoints: readonly CheckpointRow[]): NewContentAlert[] {
  const byId = new Map(checkpoints.map((row) => [row.id, row]));
  const alerts: NewContentAlert[] = [];
  for (const item of items) {
    const own = byId.get(item.id);
    if (own === undefined) continue;
    const usualCurve = baselineFor(checkpoints, item.platform, item.id).points;
    for (const hours of ALERT_CHECKPOINTS) {
      const views = own.views[hours];
      if (views === null) continue;
      const usual = usualCurve.find((point) => point.ageHours === hours)?.views ?? null;
      // The latest recorded checkpoint decides, even when it has nothing to compare with yet.
      if (usual !== null && usual >= MIN_USUAL_VIEWS) {
        const ratio = views / usual;
        const direction = ratio >= RISING ? 'rising' : ratio <= BELOW ? 'below' : null;
        if (direction !== null)
          alerts.push({
            id: `item:${item.id}:${direction}`,
            kind: 'item',
            ...itemAlertText({ item, direction, hours, views, usual }),
            html: itemAlertHtml({ item, direction, hours, views, usual }),
            buttons: [],
            linkPath: itemLink(item)
          });
      }
      break;
    }
  }
  return alerts;
}

interface SourceAlertFacts {
  platform: ContentPlatform;
  lastSuccessAt: number;
  lastErrorCode: string | null;
}

function sourceAlertText(source: SourceAlertFacts, timezone: string): { title: string; body: string } {
  const label = PLATFORM_LABEL[source.platform];
  return source.lastErrorCode === 'TIKTOK_RECONNECT'
    ? {
        title: `${label}: нужно войти заново`,
        body: `${label} отозвал доступ, статистика не обновляется. Войдите заново: Настройки → Аналитика.`
      }
    : {
        title: `Не собирается статистика ${label}`,
        body: `Последний успешный сбор ${shortTime(source.lastSuccessAt, timezone)}, ошибка ${source.lastErrorCode ?? 'неизвестна'}. Графики не обновляются, сбор повторяется каждые 15 минут.`
      };
}

/** The card style the owner chose on 15.10.2026; the button opens Настройки → Аналитика to refresh. */
function sourceAlertHtml(source: SourceAlertFacts, timezone: string): string {
  const label = PLATFORM_LABEL[source.platform];
  return source.lastErrorCode === 'TIKTOK_RECONNECT'
    ? `🔑 <b>${label}: нужно войти заново</b>\n\n${label} отозвал доступ — статистика не обновляется.\n👉 <i>Настройки → Аналитика</i>`
    : `⚠️ <b>${label}: сбор статистики остановлен</b>\n<blockquote>Последний успешный сбор: ${esc(shortTime(source.lastSuccessAt, timezone))}\nОшибка: <code>${esc(source.lastErrorCode ?? 'неизвестна')}</code></blockquote>\nГрафики не обновляются, повторяем каждые 15 минут.`;
}

/** A source that worked before and now fails: after SOURCE_OUTAGE_MS, or at once when it needs a new sign-in. */
export function sourceAlerts(sources: readonly SourceRow[], now: number, timezone: string): NewContentAlert[] {
  const alerts: NewContentAlert[] = [];
  for (const source of sources) {
    if (source.lastSuccessAt === null || source.lastErrorAt === null || source.lastErrorAt <= source.lastSuccessAt)
      continue;
    const reconnect = source.lastErrorCode === 'TIKTOK_RECONNECT';
    if (!reconnect && now - source.lastSuccessAt < SOURCE_OUTAGE_MS) continue;
    const facts = {
      platform: source.platform,
      lastSuccessAt: source.lastSuccessAt,
      lastErrorCode: source.lastErrorCode
    };
    alerts.push({
      id: `source:${source.platform}:${source.lastSuccessAt}`,
      kind: 'source',
      ...sourceAlertText(facts, timezone),
      html: sourceAlertHtml(facts, timezone),
      buttons: [],
      linkPath: '/settings/analytics'
    });
  }
  return alerts;
}

function attr(value: string): string {
  return esc(value).replaceAll('"', '&quot;');
}

/**
 * TikTok videos of the last week that stopped dead or vanished (owner, 15.10.2026: a blocked video needs an
 * appeal quickly). Stopped: the window before grew by STALL_MIN_PRIOR_GAIN or more and the last window (6 h
 * while snapshots are hourly, then 24 h) added nothing. Vanished: TikTok's latest successful collection did
 * not return it. Each raises one alert per video.
 */
export function tiktokWatchAlerts(
  items: readonly ItemRow[],
  snapshots: readonly { itemId: string; observedAt: number; views: number }[],
  sources: readonly SourceRow[],
  now: number
): NewContentAlert[] {
  const tiktok = sources.find((source) => source.platform === 'tiktok');
  const lastSuccess = tiktok?.lastSuccessAt ?? null;
  const alerts: NewContentAlert[] = [];
  for (const item of items) {
    if (item.platform !== 'tiktok' || now - item.publishedAt > WATCH_WINDOW_MS) continue;
    const title = `«${esc(itemTitle(item, 80))}»`;
    const link = /^https:\/\/(www\.)?tiktok\.com\//.test(item.url)
      ? `\n👉 <a href="${attr(item.url)}">Открыть в TikTok</a>`
      : '';
    // A video TikTok stopped returning, while the collection itself works and the video is past its first hour.
    if (
      lastSuccess !== null &&
      now - lastSuccess < FRESH_OBSERVATION_MS &&
      item.observedAt < lastSuccess - 30 * 60 * 1000 &&
      now - item.publishedAt > HOUR_MS
    ) {
      alerts.push({
        id: `item:${item.id}:gone`,
        kind: 'item',
        title: `Ролик пропал из TikTok: «${itemTitle(item, 80)}»`,
        body: 'TikTok перестал его возвращать: удалён, скрыт или на проверке. Проверьте уведомления TikTok и при блокировке подайте апелляцию.',
        html: `🚫 <b>Ролик пропал из TikTok</b>\n${title}\n\nTikTok перестал его отдавать: удалён, скрыт или на проверке.\n💡 <i>Проверь уведомления в TikTok и, если это блокировка, подай апелляцию.</i>${link}`,
        buttons: confirmButton('Удаление подтвердилось', 'removed', item.id),
        linkPath: itemLink(item)
      });
      continue;
    }
    if ((item.views ?? 0) < STALL_MIN_VIEWS || now - item.observedAt > FRESH_OBSERVATION_MS) continue;
    const window = now - item.publishedAt < HOURLY_SNAPSHOTS_MS ? 6 * HOUR_MS : 24 * HOUR_MS;
    if (now - item.publishedAt < 2 * window) continue;
    const own = snapshots.filter((row) => row.itemId === item.id);
    const at = (moment: number) => own.filter((row) => row.observedAt <= moment).at(-1)?.views ?? null;
    const before = at(item.observedAt - window);
    const earlier = at(item.observedAt - 2 * window);
    const views = item.views ?? 0;
    if (before === null || earlier === null) continue;
    if (before - earlier < STALL_MIN_PRIOR_GAIN || views - before > 0) continue;
    const hours = window / HOUR_MS;
    alerts.push({
      id: `item:${item.id}:stalled`,
      kind: 'item',
      title: `Ролик перестал набирать: «${itemTitle(item, 80)}»`,
      body: `За последние ${hours} ч ни одного просмотра, до этого +${count(before - earlier)}. Похоже на блокировку или ограничение показа: проверьте TikTok и подайте апелляцию.`,
      html: [
        `⛔ <b>Ролик перестал набирать</b> · TikTok`,
        title,
        '',
        `<blockquote>👀 ${count(views)} просмотров\n📈 за ${hours} ч до этого: +${count(before - earlier)}\n⏸ за последние ${hours} ч: +0</blockquote>`,
        `💡 <i>Похоже на блокировку или ограничение показа. Проверь уведомления в TikTok и подай апелляцию.</i>${link}`
      ].join('\n'),
      buttons: confirmButton('Ограничение подтвердилось', 'restricted', item.id),
      linkPath: itemLink(item)
    });
  }
  return alerts;
}

/**
 * The owner's confirmation under a freeze or disappearance alert: only the tap marks the video contaminated, so
 * it leaves the usual curves (docs/ai/architecture.md item 12); the alert itself proves nothing.
 */
function confirmButton(text: string, reason: AlertContamination, itemId: string): AlertButton[] {
  const callbackData = contaminationCallbackData(reason, itemId);
  return callbackData === null ? [] : [{ text, callbackData }];
}

/** The owner-zone 00:00 of the day `at` falls on (correct across a DST change of that zone). */
export function zonedMidnight(at: number, timezone: string): number {
  const parts = zoned(at, timezone);
  return at - ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000 - (at % 1000);
}

export function forecastDay(day: string, timezone: string): string {
  return shortDay(Date.parse(`${day}T12:00:00Z`), timezone);
}

/**
 * Raises the alerts due now: item alerts for publications of the last 26 hours and source outages (the Monday
 * report is weekly-report.ts). Bounded: at most ten reads and NEW_ALERTS_PER_TICK inserts.
 */
export async function raiseContentAlerts(deps: {
  repo: ContentAlertRepository;
  clock: Clock;
  timezone: string;
}): Promise<{ raised: number }> {
  const now = deps.clock.now();
  // A week back: the TikTok watch needs it; the curve alerts only look at the last 26 hours of it.
  const recent = await deps.repo.readRecent({ itemsFrom: now - WATCH_WINDOW_MS, limit: 200 });
  const alerts = sourceAlerts(recent.sources, now, deps.timezone);
  const young = recent.items.filter((item) => item.publishedAt >= now - ITEM_ALERT_WINDOW_MS);
  if (young.length > 0) {
    const checkpoints = await deps.repo.readCheckpoints(now - BASELINE_WINDOW_MS);
    alerts.push(...itemAlerts(young, checkpoints));
  }
  const watched = recent.items.filter((item) => item.platform === 'tiktok');
  if (watched.length > 0) {
    const snapshots = await deps.repo.readSnapshots(
      watched.map((item) => item.id),
      now - 2 * 24 * HOUR_MS - 2 * HOUR_MS
    );
    alerts.push(...tiktokWatchAlerts(watched, snapshots, recent.sources, now));
  }
  // One read tells which alerts are raised already, so a qualifying item does not cost an insert per tick.
  const known = await deps.repo.existing(alerts.map((alert) => alert.id));
  const fresh = alerts.filter((alert) => !known.has(alert.id));
  return { raised: await deps.repo.insert(fresh.slice(0, NEW_ALERTS_PER_TICK), now) };
}
