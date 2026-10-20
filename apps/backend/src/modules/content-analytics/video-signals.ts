import type { DailyComparison, DailyGrowth } from './daily-table';
import type { ContentPlatform, VideoFormat } from './types';

// What the reports say about each video beyond its views (owner, 20.10.2026: «как в отчётах ChatGPT» — a status per
// video, likes and shares as a share of views, peers of the same rubric at the same age, the channel's strongest
// videos as references). Code decides all of it; the AI review only explains.

const HOUR_MS = 60 * 60 * 1000;
/** Under two days a video is still new: its curve says little yet. */
const NEW_HOURS = 48;
/** From a week a video lives on its tail. */
const TAIL_HOURS = 7 * 24;
/** A tail of this many views is a long tail; smaller old videos only grow slowly. */
const LONG_TAIL_VIEWS = 100_000;
/** The day's growth at or below this share of the day before: the growth is slowing. */
const SLOWING = 0.6;
/** A young video gaining this share of its views in a day still grows. */
const GROWING_DAY_SHARE = 0.02;
/** Below the usual for its age by a fifth, on a comparison strong enough to say so. */
const WEAK_RATIO = 0.8;
const PEERS_MAX = 3;
export const REFERENCES_PER_PLATFORM = 4;

export type VideoTrend = 'new' | 'growing' | 'slowing' | 'long_tail' | 'slow' | 'weak' | 'unknown';

/** The status word of the message table: six letters at most, so a phone line still fits. */
export const TREND_WORD: Record<VideoTrend, string> = {
  new: 'новый',
  growing: 'растёт',
  slowing: 'тормоз',
  long_tail: 'хвост',
  slow: 'медл.',
  weak: 'слабый',
  unknown: '—'
};

/** The status in full, as the review's facts say it. */
export const TREND_TEXT: Record<VideoTrend, string> = {
  new: 'новый ролик',
  growing: 'растёт',
  slowing: 'рост замедляется',
  long_tail: 'длинный хвост',
  slow: 'медленный рост',
  weak: 'слабый результат для рубрики',
  unknown: 'статус н/д'
};

/** Likes and shares as per cent of views from one reading of the counters; null where a counter is missing. */
export function reactionRates(counters: { views: number | null; likes: number | null; shares: number | null }): {
  likes: number | null;
  shares: number | null;
} {
  const { views } = counters;
  const rate = (value: number | null, digits: number) =>
    views === null || views <= 0 || value === null ? null : Number(((value / views) * 100).toFixed(digits));
  return { likes: rate(counters.likes, 1), shares: rate(counters.shares, 2) };
}

/**
 * The video's status from its age, growth and comparison. The order matters: a strong comparison below the usual
 * says «слабый» whatever the age; a video still gaining fast grows at any age; a week-old one is otherwise a tail; a
 * younger one slows down when today's growth fell well below yesterday's.
 */
export function videoTrend(input: {
  ageHours: number;
  views: number | null;
  growth: DailyGrowth;
  previousGrowth: DailyGrowth;
  comparison: DailyComparison | null;
}): VideoTrend {
  if (input.views === null) return 'unknown';
  if (input.ageHours < NEW_HOURS) return 'new';
  const { comparison } = input;
  if (comparison !== null && !comparison.weak && comparison.median > 0) {
    if (comparison.views / comparison.median <= WEAK_RATIO) return 'weak';
  }
  // Per day, so a 6–48 h window is not judged as a whole day (review 20.10.2026).
  const perDay = (growth: DailyGrowth) =>
    growth.kind === 'day' ? growth.views : growth.kind === 'window' ? growth.viewsPerHour * 24 : null;
  const today = perDay(input.growth);
  const growing = today !== null && today >= input.views * GROWING_DAY_SHARE;
  if (input.ageHours >= TAIL_HOURS) {
    if (growing) return 'growing';
    return input.views >= LONG_TAIL_VIEWS ? 'long_tail' : 'slow';
  }
  if (today === null) return 'unknown';
  const before = perDay(input.previousGrowth);
  if (before !== null && before > 0 && today <= before * SLOWING) return 'slowing';
  return growing ? 'growing' : 'slow';
}

export interface Peer {
  title: string;
  views: number;
}

/**
 * The same platform's and rubric's earlier videos at the checkpoint `ageHours` (owner's example: «Оракл против
 * Сайленсера на близком возрасте»), newest first; contaminated ones are left out.
 */
export function peersAt(
  checkpoints: readonly {
    id: string;
    platform: ContentPlatform;
    title: string;
    publishedAt: number;
    views: Readonly<Record<number, number | null>>;
    contaminated: boolean;
  }[],
  input: { id: string; platform: ContentPlatform; publishedAt: number; ageHours: number },
  formatOf: (id: string) => VideoFormat | undefined
): Peer[] {
  const format = formatOf(input.id);
  return checkpoints
    .filter(
      (row) =>
        row.id !== input.id &&
        row.platform === input.platform &&
        !row.contaminated &&
        row.publishedAt < input.publishedAt &&
        formatOf(row.id) === format &&
        typeof row.views[input.ageHours] === 'number'
    )
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, PEERS_MAX)
    .map((row) => ({ title: row.title, views: row.views[input.ageHours] as number }));
}

export interface Reference {
  platform: 'youtube' | 'tiktok';
  title: string;
  url: string;
  format: VideoFormat;
  views: number;
  ageDays: number;
  likesRate: number | null;
  sharesRate: number | null;
}

/** The channel's strongest videos per platform, the yardstick the review may cite even when they are not shown. */
export function referencesOf(
  top: readonly {
    id: string;
    platform: ContentPlatform;
    title: string;
    url: string;
    publishedAt: number;
    views: number | null;
    likes: number | null;
    shares: number | null;
  }[],
  formatOf: (item: { id: string; title: string }) => VideoFormat,
  asOf: number
): Reference[] {
  return top.flatMap((item) => {
    if (item.views === null || (item.platform !== 'youtube' && item.platform !== 'tiktok')) return [];
    const rates = reactionRates(item);
    return [
      {
        platform: item.platform,
        title: item.title,
        url: item.url,
        format: formatOf(item),
        views: item.views,
        ageDays: Math.max(0, Math.floor((asOf - item.publishedAt) / (24 * HOUR_MS))),
        likesRate: rates.likes,
        sharesRate: rates.shares
      }
    ];
  });
}
