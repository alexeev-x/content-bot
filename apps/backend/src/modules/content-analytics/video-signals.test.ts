import { describe, expect, it } from 'vitest';
import { type DailyGrowth, previousGrowthOf } from './daily-table';
import type { VideoFormat } from './types';
import { peersAt, reactionRates, videoTrend } from './video-signals';

// The status, rates and peers the daily report shows every morning (owner, 20.10.2026): a wrong word here would
// tell the owner a video is weak or slowing when it is not.

const HOUR = 60 * 60 * 1000;
const day = (views: number): DailyGrowth => ({ kind: 'day', views, hours: 24, viewsPerHour: Math.round(views / 24) });
const none: DailyGrowth = { kind: 'none', views: null, hours: null, viewsPerHour: null };
const strong = (views: number, median: number) => ({
  ageHours: 72,
  views,
  median,
  low: median,
  high: median,
  items: 5,
  weak: false
});

describe('video trend', () => {
  const base = { growth: day(100), previousGrowth: none, comparison: null };

  it('calls a video under two days new, and a strong comparison a fifth below the usual weak', () => {
    expect(videoTrend({ ...base, ageHours: 20, views: 7516 })).toBe('new');
    expect(videoTrend({ ...base, ageHours: 200, views: 7945, comparison: strong(5000, 8000) })).toBe('weak');
    // A weak comparison (few videos) never says «слабый».
    expect(videoTrend({ ...base, ageHours: 200, views: 7945, comparison: { ...strong(5000, 8000), weak: true } })).toBe(
      'slow'
    );
  });

  it('tells a long tail from slow growth after a week by its size', () => {
    expect(videoTrend({ ...base, ageHours: 300, views: 587_925 })).toBe('long_tail');
    expect(videoTrend({ ...base, ageHours: 400, views: 16_839 })).toBe('slow');
    // An old video still gaining fast grows, whatever its size (review 20.10.2026).
    expect(videoTrend({ ...base, ageHours: 400, views: 90_000, growth: day(20_000) })).toBe('growing');
    // A 12 h window is judged per day: +600 in 12 h is +1.2к a day, 2% of 60к.
    const window: DailyGrowth = { kind: 'window', views: 600, hours: 12, viewsPerHour: 50 };
    expect(videoTrend({ ...base, ageHours: 100, views: 60_000, growth: window })).toBe('growing');
  });

  it('says the growth slows when today is at most 60% of yesterday, else grows or grows slowly', () => {
    const young = { ageHours: 68, views: 9553, comparison: null };
    expect(videoTrend({ ...young, growth: day(690), previousGrowth: day(1347) })).toBe('slowing');
    expect(videoTrend({ ...young, growth: day(1300), previousGrowth: day(1347) })).toBe('growing');
    expect(videoTrend({ ...young, growth: day(100), previousGrowth: none })).toBe('slow');
    expect(videoTrend({ ...young, growth: none, previousGrowth: none })).toBe('unknown');
    expect(videoTrend({ ...young, views: null, growth: none, previousGrowth: none })).toBe('unknown');
  });
});

describe('reaction rates', () => {
  it('gives likes to one decimal and shares to two, null without a counter or views', () => {
    expect(reactionRates({ views: 587_925, likes: 62_143, shares: 29_716 })).toEqual({ likes: 10.6, shares: 5.05 });
    expect(reactionRates({ views: 9553, likes: 581, shares: null })).toEqual({ likes: 6.1, shares: null });
    expect(reactionRates({ views: 0, likes: 1, shares: 1 })).toEqual({ likes: null, shares: null });
  });
});

describe('previous growth', () => {
  it('is the day before the latest, and only from a real day pair', () => {
    const t = 100 * HOUR;
    const readings = [
      { observedAt: t - 48 * HOUR, views: 7516 },
      { observedAt: t - 24 * HOUR, views: 8863 },
      { observedAt: t, views: 9553 }
    ];
    expect(previousGrowthOf({ observedAt: t, views: 9553 }, readings)).toMatchObject({ kind: 'day', views: 1347 });
    expect(previousGrowthOf({ observedAt: t, views: 9553 }, readings.slice(1))).toEqual(none);
  });
});

describe('peers', () => {
  it('lists earlier videos of the same platform and rubric at that age, newest first, without contaminated ones', () => {
    const at24 = (
      id: string,
      publishedAt: number,
      views: number,
      contaminated = false,
      platform = 'tiktok' as const
    ) => ({
      id,
      platform,
      title: id,
      publishedAt,
      views: { 24: views } as Record<number, number | null>,
      contaminated
    });
    const rows = [
      at24('silencer', 1, 4751),
      at24('phoenix', 2, 9100),
      at24('distorted', 3, 50_000, true),
      at24('youtube-copy', 4, 900, false, 'youtube' as never),
      at24('bkb', 5, 400_000),
      at24('oracle', 6, 7516)
    ];
    const format = new Map<string, VideoFormat>([
      ['silencer', 'igrat'],
      ['phoenix', 'igrat'],
      ['distorted', 'igrat'],
      ['youtube-copy', 'igrat'],
      ['bkb', 'fidit'],
      ['oracle', 'igrat']
    ]);
    expect(
      peersAt(rows, { id: 'oracle', platform: 'tiktok', publishedAt: 6, ageHours: 24 }, (id) => format.get(id))
    ).toEqual([
      { title: 'phoenix', views: 9100 },
      { title: 'silencer', views: 4751 }
    ]);
  });
});
