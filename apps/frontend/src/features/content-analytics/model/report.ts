import type { ContentItemDto, ContentPlatform, ContentReportDto } from '@alexeev/contracts';
import { YOUNG_HOURS } from './status';

// Everything the analytics page compares is derived here from one report (this period and the
// previous one). Views are «as of now»: an older item had more time to collect them, so period
// comparisons favour the previous period slightly; the page says so next to the numbers.

export const PLATFORMS: readonly ContentPlatform[] = ['telegram', 'youtube', 'tiktok'];

/**
 * A publication younger than YOUNG_HOURS is still collecting most of its views, so medians, «×» and
 * ranks use only settled items; a young one is judged against the usual curve at its age (status.ts).
 * `at` is the report time.
 */
export function isSettled(item: ContentItemDto, at: number): boolean {
  return at - Date.parse(item.publishedAt) >= YOUNG_HOURS * 3_600_000;
}

export function settledItems(items: readonly ContentItemDto[], at: number): ContentItemDto[] {
  return items.filter((item) => isSettled(item, at));
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Linear-interpolated quantile (0..1); null for an empty list. */
export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

/** Relative change in percent, rounded; null when there is no base to compare with. */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export type PeriodStats = {
  items: number;
  views: number;
  medianViews: number | null;
  /** Likes/reactions + comments + shares per 100 views, one decimal. */
  engagement: number | null;
  likes: number;
  comments: number;
};

export function periodStats(items: readonly ContentItemDto[]): PeriodStats {
  const withViews = items.filter((item) => item.views !== null);
  const views = withViews.reduce((sum, item) => sum + (item.views ?? 0), 0);
  const likes = items.reduce((sum, item) => sum + (item.likes ?? 0), 0);
  const comments = items.reduce((sum, item) => sum + (item.comments ?? 0), 0);
  const shares = items.reduce((sum, item) => sum + (item.shares ?? 0), 0);
  return {
    items: items.length,
    views,
    medianViews: median(withViews.map((item) => item.views ?? 0)),
    engagement: views === 0 ? null : Math.round(((likes + comments + shares) / views) * 1000) / 10,
    likes,
    comments
  };
}

export type FollowersStats = {
  /** The last stored count. */
  now: number | null;
  /** Change since the first stored day of the period; null with fewer than two days. */
  change: number | null;
  points: { day: string; followers: number }[];
};

export function followersStats(report: ContentReportDto, platform: ContentPlatform): FollowersStats {
  const fromDay = report.from.slice(0, 10);
  const all = report.followers.find((series) => series.platform === platform)?.points ?? [];
  const points = all.filter((point) => point.day >= fromDay);
  // The day before the period, when stored, is the fairest base; else the first day inside it.
  const base = all.filter((point) => point.day < fromDay).at(-1) ?? points[0];
  const last = points.at(-1) ?? all.at(-1);
  return {
    now: last?.followers ?? null,
    change: base !== undefined && last !== undefined && base !== last ? last.followers - base.followers : null,
    points
  };
}

export type Split = { current: ContentItemDto[]; previous: ContentItemDto[] };

export function splitPeriods(report: ContentReportDto, platform: ContentPlatform | undefined): Split {
  const from = Date.parse(report.from);
  const items = platform === undefined ? report.items : report.items.filter((item) => item.platform === platform);
  return {
    current: items.filter((item) => Date.parse(item.publishedAt) >= from),
    previous: items.filter((item) => Date.parse(item.publishedAt) < from)
  };
}

/** Views against the platform's median in the period: 2.5 means «в 2,5 раза больше обычного». */
export function multipleOf(
  item: ContentItemDto,
  medians: Partial<Record<ContentPlatform, number | null>>,
  at: number
): number | null {
  const base = medians[item.platform];
  if (!isSettled(item, at) || item.views === null || base === null || base === undefined || base === 0) return null;
  return Math.round((item.views / base) * 10) / 10;
}

/** The median views of each platform's settled items. */
export function mediansByPlatform(
  items: readonly ContentItemDto[],
  at: number
): Partial<Record<ContentPlatform, number | null>> {
  const settled = settledItems(items, at);
  const result: Partial<Record<ContentPlatform, number | null>> = {};
  for (const platform of PLATFORMS) {
    result[platform] = median(
      settled.filter((item) => item.platform === platform && item.views !== null).map((item) => item.views ?? 0)
    );
  }
  return result;
}

type ZonedParts = { day: string; weekday: number; hour: number };

/** The owner-zone calendar day, weekday (0 = Monday) and hour of an instant. */
export function zonedParts(iso: string, timezone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: Math.max(0, weekdays.indexOf(get('weekday'))),
    hour: Number(get('hour'))
  };
}

/** Four-hour blocks of the day for the «best time» conclusion: 0–4, 4–8, … 20–24. */
export const HOUR_BLOCKS = [0, 4, 8, 12, 16, 20] as const;
/** Two-hour columns of the «Когда публиковать» grid. */
export const HEAT_BLOCKS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22] as const;

export type HeatCell = {
  weekday: number;
  block: number;
  items: number;
  medianViews: number | null;
  multiple: number | null;
};

/** When posting worked: the median views of the items published in each weekday × 2-hour column, against the overall median. */
export function postingHeatmap(items: readonly ContentItemDto[], timezone: string): HeatCell[] {
  const overall = median(items.filter((item) => item.views !== null).map((item) => item.views ?? 0));
  const buckets = new Map<string, number[]>();
  for (const item of items) {
    if (item.views === null) continue;
    const { weekday, hour } = zonedParts(item.publishedAt, timezone);
    const key = `${weekday}:${Math.floor(hour / 2)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), item.views]);
  }
  const cells: HeatCell[] = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    for (let block = 0; block < HEAT_BLOCKS.length; block += 1) {
      const views = buckets.get(`${weekday}:${block}`) ?? [];
      const cellMedian = median(views);
      cells.push({
        weekday,
        block,
        items: views.length,
        medianViews: cellMedian,
        multiple:
          cellMedian === null || overall === null || overall === 0 ? null : Math.round((cellMedian / overall) * 10) / 10
      });
    }
  }
  return cells;
}

/** The best hour block over all weekdays, needing at least `minItems` items in it to count. */
export function bestBlock(
  items: readonly ContentItemDto[],
  timezone: string,
  minItems = 3
): { block: number; medianViews: number; multiple: number; items: number } | null {
  const overall = median(items.filter((item) => item.views !== null).map((item) => item.views ?? 0));
  if (overall === null || overall === 0) return null;
  let best: { block: number; medianViews: number; multiple: number; items: number } | null = null;
  for (let block = 0; block < HOUR_BLOCKS.length; block += 1) {
    const views = items
      .filter((item) => item.views !== null && Math.floor(zonedParts(item.publishedAt, timezone).hour / 4) === block)
      .map((item) => item.views ?? 0);
    const value = median(views);
    if (views.length < minItems || value === null) continue;
    if (best === null || value > best.medianViews) {
      best = { block, medianViews: value, multiple: Math.round((value / overall) * 10) / 10, items: views.length };
    }
  }
  return best;
}

/** Running total of a daily series: the curve of a KPI tile rises instead of spiking on publishing days. */
export function cumulative(values: readonly number[]): number[] {
  let sum = 0;
  return values.map((value) => (sum += value));
}

/** Views of the items published on each owner-zone day of the period (missing days are 0). */
export function viewsByDay(
  items: readonly ContentItemDto[],
  from: string,
  to: string,
  timezone: string
): { day: string; views: number; items: number }[] {
  const days: { day: string; views: number; items: number }[] = [];
  const seen = new Set<string>();
  for (let at = Date.parse(from); at <= Date.parse(to); at += 86_400_000) {
    const { day } = zonedParts(new Date(at).toISOString(), timezone);
    if (!seen.has(day)) {
      seen.add(day);
      days.push({ day, views: 0, items: 0 });
    }
  }
  const index = new Map(days.map((entry, position) => [entry.day, position]));
  for (const item of items) {
    const position = index.get(zonedParts(item.publishedAt, timezone).day);
    if (position === undefined) continue;
    days[position]!.views += item.views ?? 0;
    days[position]!.items += 1;
  }
  return days;
}

/** Normalised start of a title, to find one video posted on several platforms. */
function titleKey(title: string): string {
  return title
    .toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .slice(0, 24);
}

/**
 * One video published on several platforms: items with the same start of the title published within
 * four days of each other, newest groups first. Telegram posts rarely repeat a title, videos usually do.
 */
export function crossPosted(items: readonly ContentItemDto[], limit = 5): ContentItemDto[][] {
  const groups: ContentItemDto[][] = [];
  const sorted = [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  for (const item of sorted) {
    const key = titleKey(item.title);
    if (key.length < 8) continue;
    const group = groups.find(
      (candidate) =>
        titleKey(candidate[0]!.title) === key &&
        !candidate.some((entry) => entry.platform === item.platform) &&
        Math.abs(Date.parse(candidate[0]!.publishedAt) - Date.parse(item.publishedAt)) <= 4 * 86_400_000
    );
    if (group) group.push(item);
    else groups.push([item]);
  }
  return groups.filter((group) => group.length >= 2).slice(0, limit);
}
