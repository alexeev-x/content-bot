import type { ContentBaselineDto } from '@alexeev/contracts';
import type { ContentPlatform, VideoFormat } from './types';

// The numbers of the daily analytics table (stage P4 of docs/ALEXEEV_AI_DEVELOPMENT_AND_TEST_PLAN.md §4.1):
// deterministic, from stored snapshots only, for one fixed `asOf`. Nothing here is guessed: a value that cannot
// be computed is null (shown as «—»), never 0, and a growth is called «+24ч» only for a real 24 h ± 2 h pair.

const HOUR_MS = 60 * 60 * 1000;
/** «+24ч» needs two readings 24 h ± 2 h apart (plan §4.1). */
const DAY_PAIR_MS = 24 * HOUR_MS;
const DAY_PAIR_TOLERANCE_MS = 2 * HOUR_MS;
/** Outside the tolerance a growth is shown with its real length, within these bounds; else «н/д». */
const WINDOW_MIN_MS = 6 * HOUR_MS;
const WINDOW_MAX_MS = 48 * HOUR_MS;
/**
 * A reading is stale after this long: videos under 72 h are read about hourly, older ones daily
 * (d1-content-analytics-repository.ts), so each gets room for one missed collection.
 */
const STALE_YOUNG_MS = 3 * HOUR_MS;
const STALE_OLD_MS = 26 * HOUR_MS;
const YOUNG_MS = 72 * HOUR_MS;
/** A format comparison is evidence only from five comparable videos (architecture item 1). */
const STRONG_COMPARISON_ITEMS = 5;
const SHORT_TITLE_MAX = 12;

export interface DailySnapshot {
  observedAt: number;
  views: number | null;
}

export interface DailyItemInput {
  id: string;
  platform: ContentPlatform;
  title: string;
  url: string;
  publishedAt: number;
  format: VideoFormat;
  formatSource: 'script' | 'owner' | 'title';
  /** Successful readings only, any order. */
  snapshots: readonly DailySnapshot[];
  /** The item's own views at the checkpoint ages (hours), null where it has no reading for one. */
  checkpoints: Readonly<Record<number, number | null>>;
  /** The usual curve it is compared with: same platform and format when `format` is set, else the platform. */
  baseline: ContentBaselineDto;
}

export type DailyGrowth =
  /** A real pair 24 h ± 2 h apart. */
  | { kind: 'day'; views: number; hours: number; viewsPerHour: number }
  /** A pair of another length: shown as «+ за N ч». */
  | { kind: 'window'; views: number; hours: number; viewsPerHour: number }
  /** The counter went down (a recount or removed views): an anomaly, not a negative growth. */
  | { kind: 'anomaly'; views: null; hours: number; viewsPerHour: null; drop: number }
  | { kind: 'none'; views: null; hours: null; viewsPerHour: null };

export interface DailyComparison {
  /** The checkpoint age both values are read at. */
  ageHours: number;
  views: number;
  median: number;
  low: number;
  high: number;
  items: number;
  /** Rests on the platform curve, or on fewer than five comparable videos: a weak comparison. */
  weak: boolean;
}

export interface DailyRow {
  id: string;
  platform: ContentPlatform;
  title: string;
  shortTitle: string;
  url: string;
  format: VideoFormat;
  formatSource: DailyItemInput['formatSource'];
  publishedAt: number;
  ageHours: number;
  /** The latest successful reading at or before `asOf`; null with no reading at all. */
  observedAt: number | null;
  views: number | null;
  growth: DailyGrowth;
  comparison: DailyComparison | null;
  /** `stale`: the latest reading is older than one missed collection; `no_data`: nothing read yet. */
  status: 'ok' | 'stale' | 'no_data';
}

/** The table's short name: the title without the rubric the owner closes it with, cut at a word. */
export function shortTitleOf(title: string, max = SHORT_TITLE_MAX): string {
  const bare = title
    .replace(/#\S+/g, ' ')
    .replace(/(учу\s*фидить|учусь\s*играть)[\s\S]*$/i, ' ')
    .replace(/[|•—–\-:.,!?\s]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  const text = bare === '' ? title.trim() : bare;
  const letters = Array.from(text);
  if (letters.length <= max) return text;
  const cut = letters.slice(0, max).join('');
  const atWord = cut.lastIndexOf(' ');
  return `${(atWord >= 4 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
}

/** The growth to the latest reading from the one closest to a day before it (plan §4.1). */
export function growthOf(latest: DailySnapshot & { views: number }, earlier: readonly DailySnapshot[]): DailyGrowth {
  const target = latest.observedAt - DAY_PAIR_MS;
  const usable = earlier.filter(
    (row): row is DailySnapshot & { views: number } => row.views !== null && row.observedAt < latest.observedAt
  );
  const closest = (rows: typeof usable) =>
    rows.reduce<(typeof usable)[number] | null>(
      (best, row) =>
        best === null || Math.abs(row.observedAt - target) < Math.abs(best.observedAt - target) ? row : best,
      null
    );
  const day = closest(usable.filter((row) => Math.abs(row.observedAt - target) <= DAY_PAIR_TOLERANCE_MS));
  const pair =
    day ??
    closest(
      usable.filter(
        (row) =>
          latest.observedAt - row.observedAt >= WINDOW_MIN_MS && latest.observedAt - row.observedAt <= WINDOW_MAX_MS
      )
    );
  if (pair === null) return { kind: 'none', views: null, hours: null, viewsPerHour: null };
  const lengthMs = latest.observedAt - pair.observedAt;
  const hours = Math.round(lengthMs / HOUR_MS);
  const views = latest.views - pair.views;
  if (views < 0) return { kind: 'anomaly', views: null, hours, viewsPerHour: null, drop: -views };
  return {
    kind: day !== null ? 'day' : 'window',
    views,
    hours,
    viewsPerHour: Math.round(views / (lengthMs / HOUR_MS))
  };
}

/** The item against the usual curve at the latest checkpoint both have; null when there is none. */
export function comparisonOf(item: Pick<DailyItemInput, 'checkpoints' | 'baseline'>): DailyComparison | null {
  const points = [...item.baseline.points].sort((a, b) => b.ageHours - a.ageHours);
  for (const point of points) {
    const views = item.checkpoints[point.ageHours];
    if (views === null || views === undefined) continue;
    const byFormat = item.baseline.format !== null && item.baseline.format !== undefined;
    return {
      ageHours: point.ageHours,
      views,
      median: point.views,
      // Older cached curves carry no band: the median stands for both ends then.
      low: point.low ?? point.views,
      high: point.high ?? point.views,
      items: point.items,
      weak: !byFormat || point.items < STRONG_COMPARISON_ITEMS
    };
  }
  return null;
}

export function dailyRowOf(item: DailyItemInput, asOf: number): DailyRow {
  const readings = item.snapshots.filter((row) => row.observedAt <= asOf).sort((a, b) => a.observedAt - b.observedAt);
  const latest = readings.filter((row): row is DailySnapshot & { views: number } => row.views !== null).at(-1);
  const ageMs = Math.max(0, asOf - item.publishedAt);
  const base = {
    id: item.id,
    platform: item.platform,
    title: item.title,
    shortTitle: shortTitleOf(item.title),
    url: item.url,
    format: item.format,
    formatSource: item.formatSource,
    publishedAt: item.publishedAt,
    ageHours: Math.floor(ageMs / HOUR_MS),
    comparison: comparisonOf(item)
  };
  if (latest === undefined)
    return {
      ...base,
      observedAt: null,
      views: null,
      growth: { kind: 'none', views: null, hours: null, viewsPerHour: null },
      status: 'no_data'
    };
  const staleAfter = ageMs < YOUNG_MS ? STALE_YOUNG_MS : STALE_OLD_MS;
  return {
    ...base,
    observedAt: latest.observedAt,
    views: latest.views,
    growth: growthOf(latest, readings),
    status: asOf - latest.observedAt > staleAfter ? 'stale' : 'ok'
  };
}

/** The six latest published videos of one platform, newest first by their real publication time. */
export function dailyRowsOf(items: readonly DailyItemInput[], asOf: number, limit = 6): DailyRow[] {
  const seen = new Set<string>();
  return [...items]
    .filter((item) => item.publishedAt <= asOf)
    .sort((a, b) => b.publishedAt - a.publishedAt || (a.id < b.id ? 1 : -1))
    .filter((item) => !seen.has(`${item.platform}:${item.id}`) && seen.add(`${item.platform}:${item.id}`))
    .slice(0, limit)
    .map((item) => dailyRowOf(item, asOf));
}
