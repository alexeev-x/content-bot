import type { ContentGoalDto } from '@alexeev/contracts';
import type { Clock } from '../../platform/clock';
import type { AlertButton, ContentAlertRepository, NewContentAlert } from './d1-content-alerts-repository';
import type { CheckpointRow, ItemRow, SourceRow } from './d1-content-analytics-repository';
import { type ContentGoalRepository, readContentGoals } from './goals';
import { type AlertContamination, contaminationCallbackData } from './contamination-callback';
import { baselineFor } from './service';
import { CONTENT_PLATFORMS, type ContentPlatform } from './types';

// Bot alerts raised from the collected counters (docs/PLAN.md, stage B item 2). Every rule reads what the
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
/** The digest goes out on Monday from this owner-zone hour. */
const DIGEST_HOUR = 10;
/** Medians for the digest: settled items of the last 30 days. */
const MEDIAN_WINDOW_MS = 30 * DAY_MS;
const SETTLED_MS = 72 * HOUR_MS;
const DIGEST_ITEM_LIMIT = 1000;
const DIGEST_LIST = 3;
/** The digest compares weeks at this age, so a week's last posts are not judged on a few hours. */
const DIGEST_AGE_HOURS = 24;
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

export function signed(value: number): string {
  return value > 0 ? `+${count(value)}` : value < 0 ? `−${count(-value)}` : '0';
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

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Hour, minute and weekday (0 = Monday) of an instant in the owner's zone. */
function zoned(at: number, timezone: string): { weekday: number; hour: number; minute: number; second: number } {
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

function zonedDate(at: number, timezone: string): string {
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

function bar(fraction: number): string {
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
function zonedMidnight(at: number, timezone: string): number {
  const parts = zoned(at, timezone);
  return at - ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000 - (at % 1000);
}

/** The owner-zone Monday 00:00 of the current week, when it is Monday after DIGEST_HOUR; else null. */
export function digestWeekEnd(now: number, timezone: string): number | null {
  const parts = zoned(now, timezone);
  if (parts.weekday !== 0 || parts.hour < DIGEST_HOUR) return null;
  return zonedMidnight(now, timezone);
}

interface DigestEntry {
  item: ItemRow;
  ratio: number;
}

/** What a weekly digest says, before it is worded; the bot message and the preview variants share it. */
interface DigestData {
  weekStart: number;
  weekEnd: number;
  published: number;
  publishedBefore: number;
  /** Median views at DIGEST_AGE_HOURS per platform with three measured publications; change in % or null. */
  atAge: { platform: ContentPlatform; views: number; change: number | null }[];
  /** The last follower count by the end of Sunday and its change over the week (null without a base). */
  followers: { platform: ContentPlatform; followers: number; change: number | null }[];
  goals: readonly ContentGoalDto[];
  best: DigestEntry[];
  worst: DigestEntry[];
}

interface DigestInput {
  items: readonly ItemRow[];
  checkpoints: readonly CheckpointRow[];
  followers: readonly { platform: ContentPlatform; day: string; followers: number }[];
  goals?: readonly ContentGoalDto[];
  weekEnd: number;
  now: number;
  timezone: string;
}

/** The numbers of the week that ended at `weekEnd`. */
function digestData(input: DigestInput): DigestData {
  const { items, checkpoints, followers, goals = [], weekEnd, now, timezone } = input;
  // Noon a week back is always inside the previous Monday, whatever a DST change did to the week.
  const weekStart = zonedMidnight(weekEnd - 7 * DAY_MS + 12 * HOUR_MS, timezone);
  const previousStart = zonedMidnight(weekStart - 7 * DAY_MS + 12 * HOUR_MS, timezone);
  const week = items.filter((item) => item.publishedAt >= weekStart && item.publishedAt < weekEnd);
  const before = items.filter((item) => item.publishedAt >= previousStart && item.publishedAt < weekStart);
  const atAge = new Map(checkpoints.map((row) => [row.id, row.views[DIGEST_AGE_HOURS]]));

  const medians = new Map<ContentPlatform, number | null>(
    CONTENT_PLATFORMS.map((platform) => [
      platform,
      median(
        items
          .filter(
            (item) =>
              item.platform === platform &&
              item.views !== null &&
              item.publishedAt >= now - MEDIAN_WINDOW_MS &&
              now - item.publishedAt >= SETTLED_MS
          )
          .map((item) => item.views ?? 0)
      )
    ])
  );
  // Only settled publications are ranked: the newest ones have collected a fraction of their views.
  const ranked = week
    .filter((item) => now - item.publishedAt >= SETTLED_MS)
    .map((item) => {
      const usual = medians.get(item.platform) ?? null;
      return { item, ratio: item.views === null || usual === null || usual === 0 ? null : item.views / usual };
    })
    .filter((entry): entry is DigestEntry => entry.ratio !== null);
  const best = [...ranked].sort((a, b) => b.ratio - a.ratio).slice(0, DIGEST_LIST);
  const worst = ranked
    .filter((entry) => !best.includes(entry))
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, DIGEST_LIST);

  // Weeks compared at the same age: the median views at 24 h per platform (totals so far would always
  // favour the older week). Needs three measured publications in each week.
  const ageRows = CONTENT_PLATFORMS.flatMap((platform) => {
    const measured = (list: readonly ItemRow[]) =>
      list
        .filter((item) => item.platform === platform)
        .map((item) => atAge.get(item.id) ?? null)
        .filter((value): value is number => value !== null);
    const now24 = measured(week);
    if (now24.length < 3) return [];
    const views = median(now24);
    const earlier = measured(before);
    const before24 = earlier.length >= 3 ? median(earlier) : null;
    if (views === null) return [];
    const change = before24 === null || before24 === 0 ? null : Math.round(((views - before24) / before24) * 100);
    return [{ platform, views, change }];
  });
  // Daily follower counts are stored per UTC day: the last reading by the end of each Sunday.
  const endDay = new Date(weekEnd - 1).toISOString().slice(0, 10);
  const startDay = new Date(weekStart - 1).toISOString().slice(0, 10);
  const followerRows = CONTENT_PLATFORMS.flatMap((platform) => {
    const own = followers.filter((point) => point.platform === platform);
    const last = own.filter((point) => point.day <= endDay).at(-1);
    const base = own.filter((point) => point.day <= startDay).at(-1);
    if (last === undefined) return [];
    const change = base === undefined || base === last ? null : last.followers - base.followers;
    return [{ platform, followers: last.followers, change }];
  });
  return {
    weekStart,
    weekEnd,
    published: week.length,
    publishedBefore: before.length,
    atAge: ageRows,
    followers: followerRows,
    goals,
    best,
    worst
  };
}

function digestTitle(data: DigestData, timezone: string): string {
  return `Итоги недели ${shortDay(data.weekStart, timezone)} — ${shortDay(data.weekEnd - 1, timezone)}`;
}

function goalLine(goal: ContentGoalDto, timezone: string): string {
  const label = PLATFORM_LABEL[goal.platform];
  if (goal.reached) return `🎯 <b>Цель ${label}</b>: ${count(goal.target)} — достигнута 🎉`;
  const followers = goal.followers ?? 0;
  const pace = [
    goal.perWeek === null ? null : `${signed(goal.perWeek)} в неделю`,
    goal.forecastDay !== null
      ? `→ к ${forecastDay(goal.forecastDay, timezone)}`
      : goal.perWeek !== null && goal.perWeek <= 0
        ? 'рост стоит'
        : null
  ].filter((part) => part !== null);
  return `🎯 <b>Цель ${label}</b>: ${count(followers)} из ${count(goal.target)}\n<code>${bar(followers / goal.target)}</code> ${Math.floor((followers / goal.target) * 100)}%${pace.length > 0 ? ` · ${pace.join(' ')}` : ''}`;
}

/**
 * The style the owner chose on 15.10.2026: platform by name and the publication with its views, no
 * ratios; each publication has its own button (digestButtons) with the same number.
 */
function digestHtml(data: DigestData, timezone: string): string {
  const blocks = [
    `📊 <b>${esc(digestTitle(data, timezone))}</b>\n${
      data.published === 0
        ? 'За неделю публикаций не было.'
        : `Публикаций: <b>${data.published}</b> (неделей раньше ${data.publishedBefore})`
    }`
  ];
  if (data.followers.length > 0)
    blocks.push(
      `<b>Подписчики</b>\n${data.followers
        .map(
          (row) =>
            `${PLATFORM_LABEL[row.platform]}: <b>${count(row.followers)}</b>${row.change === null ? '' : ` (${signed(row.change)} за неделю)`}`
        )
        .join('\n')}`
    );
  blocks.push(...data.goals.map((goal) => goalLine(goal, timezone)));
  const numbered = (entries: readonly DigestEntry[], from: number) =>
    entries
      .map(
        (entry, index) =>
          `${from + index}. <b>${PLATFORM_LABEL[entry.item.platform]}</b> — «${esc(itemTitle(entry.item, 60))}», ${count(entry.item.views ?? 0)} просмотров`
      )
      .join('\n');
  if (data.best.length > 0) blocks.push(`🔥 <b>Залетели</b>\n${numbered(data.best, 1)}`);
  if (data.worst.length > 0) blocks.push(`🧊 <b>Не зашли</b>\n${numbered(data.worst, data.best.length + 1)}`);
  if (data.best.length + data.worst.length > 0) blocks.push('<i>Каждый ролик открывается кнопкой ниже.</i>');
  return blocks.join('\n\n');
}

/** «1. TikTok · Пудж через мид…»: numbered as in the text, at most six. */
function digestButtons(data: DigestData): AlertButton[] {
  return [...data.best, ...data.worst].map((entry, index) => ({
    text: `${index + 1}. ${PLATFORM_LABEL[entry.item.platform]} · ${itemTitle(entry.item, 28)}`,
    linkPath: itemLink(entry.item)
  }));
}

/** The Monday digest of the week that ended at `weekEnd`. */
export function digestAlert(input: DigestInput): NewContentAlert {
  const { timezone } = input;
  const data = digestData(input);
  const line = (entry: DigestEntry, index: number) =>
    `${index + 1}. «${itemTitle(entry.item, 60)}», ${PLATFORM_LABEL[entry.item.platform]}: ${count(entry.item.views ?? 0)} (${multiple(entry.ratio)})`;

  const lines: string[] = [];
  if (data.published === 0) lines.push('За неделю публикаций не было.');
  else lines.push(`Публикаций: ${data.published}, на прошлой неделе ${data.publishedBefore}.`);
  const ageParts = data.atAge.map(
    ({ platform, views, change }) =>
      `${PLATFORM_LABEL[platform]} ${count(views)}${change === null ? '' : ` (${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change)}%)`}`
  );
  if (ageParts.length > 0) lines.push(`Обычно за первые ${DIGEST_AGE_HOURS} ч: ${ageParts.join(' · ')}.`);
  const followerParts = data.followers.map(
    ({ platform, followers, change }) =>
      `${PLATFORM_LABEL[platform]} ${change === null ? '' : `${signed(change)} `}(${count(followers)})`
  );
  if (followerParts.length > 0) lines.push(`Подписчики: ${followerParts.join(' · ')}.`);
  for (const goal of data.goals) {
    const label = PLATFORM_LABEL[goal.platform];
    if (goal.reached) {
      lines.push(`Цель ${label}: ${count(goal.target)} достигнута.`);
      continue;
    }
    const parts = [`Цель ${label}: ${goal.followers === null ? '—' : count(goal.followers)} из ${count(goal.target)}`];
    if (goal.perWeek !== null) parts.push(`${signed(goal.perWeek)} в неделю`);
    if (goal.forecastDay !== null) parts.push(`при таком темпе к ${forecastDay(goal.forecastDay, timezone)}`);
    else if (goal.perWeek !== null && goal.perWeek <= 0) parts.push('рост стоит');
    // A short month already ends with a dot («нояб.»).
    lines.push(`${parts.join(', ')}.`.replace(/\.\.$/, '.'));
  }
  if (data.best.length > 0)
    lines.push('', 'Лучшие к обычному своей платформы (старше 3 дней):', ...data.best.map(line));
  if (data.worst.length > 0) lines.push('', 'Слабее всего:', ...data.worst.map(line));

  return {
    id: `digest:${zonedDate(input.weekEnd, timezone)}`,
    kind: 'digest',
    title: digestTitle(data, timezone),
    body: lines.join('\n').slice(0, 3000),
    html: digestHtml(data, timezone),
    buttons: digestButtons(data),
    linkPath: '/analytics'
  };
}

export function forecastDay(day: string, timezone: string): string {
  return shortDay(Date.parse(`${day}T12:00:00Z`), timezone);
}

/** Everything a digest of the week that ended at `weekEnd` reads: four bounded reads. */
async function loadDigestInput(deps: {
  repo: ContentAlertRepository;
  goals: ContentGoalRepository;
  clock: Clock;
  timezone: string;
  weekEnd: number;
}): Promise<DigestInput> {
  const { weekEnd } = deps;
  const now = deps.clock.now();
  const from = Math.min(now - MEDIAN_WINDOW_MS, weekEnd - 15 * DAY_MS);
  const [history, checkpoints, followers, goals] = await Promise.all([
    deps.repo.readRecent({ itemsFrom: from, limit: DIGEST_ITEM_LIMIT }),
    deps.repo.readCheckpoints(weekEnd - 15 * DAY_MS),
    deps.repo.readFollowers(new Date(weekEnd - 15 * DAY_MS).toISOString().slice(0, 10)),
    readContentGoals({ repo: deps.goals, clock: deps.clock })
  ]);
  return {
    items: history.items,
    checkpoints,
    followers,
    goals: goals.goals,
    weekEnd,
    now,
    timezone: deps.timezone
  };
}

/**
 * Raises the alerts due now: item alerts for publications of the last 26 hours, source outages and, on
 * Monday, the weekly digest. Bounded: at most ten reads and NEW_ALERTS_PER_TICK inserts.
 */
export async function raiseContentAlerts(deps: {
  repo: ContentAlertRepository;
  goals: ContentGoalRepository;
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
  const weekEnd = digestWeekEnd(now, deps.timezone);
  const digestId = weekEnd === null ? null : `digest:${zonedDate(weekEnd, deps.timezone)}`;
  // One read tells which alerts are raised already, so a qualifying item does not cost an insert per tick.
  const known = await deps.repo.existing([
    ...alerts.map((alert) => alert.id),
    ...(digestId === null ? [] : [digestId])
  ]);
  const fresh = alerts.filter((alert) => !known.has(alert.id));
  if (weekEnd !== null && digestId !== null && !known.has(digestId) && fresh.length < NEW_ALERTS_PER_TICK) {
    fresh.push(digestAlert(await loadDigestInput({ ...deps, weekEnd })));
  }
  return { raised: await deps.repo.insert(fresh.slice(0, NEW_ALERTS_PER_TICK), now) };
}
