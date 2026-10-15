import type { ContentGoalDto } from '@alexeev/contracts';
import type { Clock } from '../../platform/clock';
import type { ContentAlertRepository, NewContentAlert } from './d1-content-alerts-repository';
import type { CheckpointRow, ItemRow, SourceRow } from './d1-content-analytics-repository';
import { type ContentGoalRepository, readContentGoals } from './goals';
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
/** Alerts inserted per tick; the rest still qualify on the next tick. Keeps the D1 budget fixed. */
export const NEW_ALERTS_PER_TICK = 3;

const PLATFORM_LABEL: Record<ContentPlatform, string> = { telegram: 'Telegram', youtube: 'YouTube', tiktok: 'TikTok' };

const exact = new Intl.NumberFormat('ru-RU');
const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });

function count(value: number): string {
  const whole = Math.round(value);
  return whole < 10_000 ? exact.format(whole) : compact.format(whole);
}

function multiple(value: number): string {
  return `${(Math.round(value * 10) / 10).toLocaleString('ru-RU')}×`;
}

function signed(value: number): string {
  return value > 0 ? `+${count(value)}` : value < 0 ? `−${count(-value)}` : '0';
}

function itemTitle(item: ItemRow, max: number): string {
  const title = item.title.trim() || (item.thumbnailUrl === null ? 'Без текста' : 'Фото или видео');
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
        const where = `«${itemTitle(item, 80)}» в ${PLATFORM_LABEL[item.platform]}`;
        const numbers = `${multiple(ratio)} обычного на ${hours} ч: ${count(views)} просмотров при обычных ${count(usual)}.`;
        if (ratio >= RISING)
          alerts.push({
            id: `item:${item.id}:rising`,
            kind: 'item',
            title: `Залетает: ${where}`,
            body: `${numbers}\nПовторите тему или первую фразу, пока интерес высокий.`,
            linkPath: itemLink(item)
          });
        else if (ratio <= BELOW)
          alerts.push({
            id: `item:${item.id}:below`,
            kind: 'item',
            title: `Идёт слабее обычного: ${where}`,
            body: `${numbers}\nПроверьте первую строку, обложку и время выхода.`,
            linkPath: itemLink(item)
          });
      }
      break;
    }
  }
  return alerts;
}

/** A source that worked before and now fails: after SOURCE_OUTAGE_MS, or at once when it needs a new sign-in. */
export function sourceAlerts(sources: readonly SourceRow[], now: number, timezone: string): NewContentAlert[] {
  const alerts: NewContentAlert[] = [];
  for (const source of sources) {
    if (source.lastSuccessAt === null || source.lastErrorAt === null || source.lastErrorAt <= source.lastSuccessAt)
      continue;
    const reconnect = source.lastErrorCode === 'TIKTOK_RECONNECT';
    if (!reconnect && now - source.lastSuccessAt < SOURCE_OUTAGE_MS) continue;
    const label = PLATFORM_LABEL[source.platform];
    alerts.push({
      id: `source:${source.platform}:${source.lastSuccessAt}`,
      kind: 'source',
      title: reconnect ? `${label}: нужно войти заново` : `Не собирается статистика ${label}`,
      body: reconnect
        ? `${label} отозвал доступ, статистика не обновляется. Войдите заново: Настройки → Аналитика.`
        : `Последний успешный сбор ${shortTime(source.lastSuccessAt, timezone)}, ошибка ${source.lastErrorCode ?? 'неизвестна'}. Графики не обновляются, сбор повторяется каждые 15 минут.`,
      linkPath: '/settings/analytics'
    });
  }
  return alerts;
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

/** The Monday digest of the week that ended at `weekEnd`. */
export function digestAlert(input: {
  items: readonly ItemRow[];
  checkpoints: readonly CheckpointRow[];
  followers: readonly { platform: ContentPlatform; day: string; followers: number }[];
  goals?: readonly ContentGoalDto[];
  weekEnd: number;
  now: number;
  timezone: string;
}): NewContentAlert {
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
    .filter((entry): entry is { item: ItemRow; ratio: number } => entry.ratio !== null);
  const best = [...ranked].sort((a, b) => b.ratio - a.ratio).slice(0, DIGEST_LIST);
  const worst = ranked
    .filter((entry) => !best.includes(entry))
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, DIGEST_LIST);
  const line = (entry: { item: ItemRow; ratio: number }, index: number) =>
    `${index + 1}. «${itemTitle(entry.item, 60)}», ${PLATFORM_LABEL[entry.item.platform]}: ${count(entry.item.views ?? 0)} (${multiple(entry.ratio)})`;

  const lines: string[] = [];
  if (week.length === 0) lines.push('За неделю публикаций не было.');
  else lines.push(`Публикаций: ${week.length}, на прошлой неделе ${before.length}.`);
  // Weeks compared at the same age: the median views at 24 h per platform (totals so far would always
  // favour the older week). Needs three measured publications in each week.
  const ageParts = CONTENT_PLATFORMS.flatMap((platform) => {
    const at = (list: readonly ItemRow[]) =>
      median(
        list
          .filter((item) => item.platform === platform)
          .map((item) => atAge.get(item.id) ?? null)
          .filter((value): value is number => value !== null)
      );
    const counted = (list: readonly ItemRow[]) =>
      list.filter((item) => item.platform === platform && (atAge.get(item.id) ?? null) !== null).length;
    if (counted(week) < 3) return [];
    const now24 = at(week);
    const before24 = counted(before) >= 3 ? at(before) : null;
    if (now24 === null) return [];
    const change = before24 === null || before24 === 0 ? null : Math.round(((now24 - before24) / before24) * 100);
    return [
      `${PLATFORM_LABEL[platform]} ${count(now24)}${change === null ? '' : ` (${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change)}%)`}`
    ];
  });
  if (ageParts.length > 0) lines.push(`Обычно за первые ${DIGEST_AGE_HOURS} ч: ${ageParts.join(' · ')}.`);
  // Daily follower counts are stored per UTC day: the last reading by the end of each Sunday.
  const endDay = new Date(weekEnd - 1).toISOString().slice(0, 10);
  const startDay = new Date(weekStart - 1).toISOString().slice(0, 10);
  const followerParts = CONTENT_PLATFORMS.flatMap((platform) => {
    const own = followers.filter((point) => point.platform === platform);
    const last = own.filter((point) => point.day <= endDay).at(-1);
    const base = own.filter((point) => point.day <= startDay).at(-1);
    if (last === undefined) return [];
    return [
      `${PLATFORM_LABEL[platform]} ${base === undefined || base === last ? '' : `${signed(last.followers - base.followers)} `}(${count(last.followers)})`
    ];
  });
  if (followerParts.length > 0) lines.push(`Подписчики: ${followerParts.join(' · ')}.`);
  for (const goal of goals) {
    const label = PLATFORM_LABEL[goal.platform];
    if (goal.reached) {
      lines.push(`Цель ${label}: ${count(goal.target)} достигнута.`);
      continue;
    }
    const parts = [`Цель ${label}: ${goal.followers === null ? '—' : count(goal.followers)} из ${count(goal.target)}`];
    if (goal.perWeek !== null) parts.push(`${signed(goal.perWeek)} в неделю`);
    if (goal.forecastDay !== null)
      parts.push(`при таком темпе к ${shortDay(Date.parse(`${goal.forecastDay}T12:00:00Z`), timezone)}`);
    else if (goal.perWeek !== null && goal.perWeek <= 0) parts.push('рост стоит');
    // A short month already ends with a dot («нояб.»).
    lines.push(`${parts.join(', ')}.`.replace(/\.\.$/, '.'));
  }
  if (best.length > 0) lines.push('', 'Лучшие к обычному своей платформы (старше 3 дней):', ...best.map(line));
  if (worst.length > 0) lines.push('', 'Слабее всего:', ...worst.map(line));

  return {
    id: `digest:${zonedDate(weekEnd, timezone)}`,
    kind: 'digest',
    title: `Итоги недели ${shortDay(weekStart, timezone)} — ${shortDay(weekEnd - 1, timezone)}`,
    body: lines.join('\n').slice(0, 3000),
    linkPath: '/analytics'
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
  const recent = await deps.repo.readRecent({ itemsFrom: now - ITEM_ALERT_WINDOW_MS, limit: 200 });
  const alerts = sourceAlerts(recent.sources, now, deps.timezone);
  if (recent.items.length > 0) {
    const checkpoints = await deps.repo.readCheckpoints(now - BASELINE_WINDOW_MS);
    alerts.push(...itemAlerts(recent.items, checkpoints));
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
    const from = Math.min(now - MEDIAN_WINDOW_MS, weekEnd - 15 * DAY_MS);
    const [history, checkpoints, followers, goals] = await Promise.all([
      deps.repo.readRecent({ itemsFrom: from, limit: DIGEST_ITEM_LIMIT }),
      deps.repo.readCheckpoints(weekEnd - 15 * DAY_MS),
      deps.repo.readFollowers(new Date(weekEnd - 15 * DAY_MS).toISOString().slice(0, 10)),
      readContentGoals({ repo: deps.goals, clock: deps.clock })
    ]);
    fresh.push(
      digestAlert({
        items: history.items,
        checkpoints,
        followers,
        goals: goals.goals,
        weekEnd,
        now,
        timezone: deps.timezone
      })
    );
  }
  return { raised: await deps.repo.insert(fresh.slice(0, NEW_ALERTS_PER_TICK), now) };
}
