import { describe, expect, it } from 'vitest';
import { type DailyItemInput, dailyRowOf, dailyRowsOf, growthOf, shortTitleOf } from './daily-table';

// Historical fixtures for the daily table (plan P4): a wrong «+24ч», a hidden counter drop or a 0 for a missing
// value would mislead every forecast and hypothesis built on top of it.

const H = 60 * 60 * 1000;
const AS_OF = Date.UTC(2026, 9, 18, 9, 0);

function item(over: Partial<DailyItemInput> = {}): DailyItemInput {
  return {
    id: 'youtube:a',
    platform: 'youtube',
    title: 'БКБ покупают только нубы | Учу фидить в доту',
    url: 'https://youtube.com/shorts/a',
    publishedAt: AS_OF - 50 * H,
    format: 'fidit',
    formatSource: 'title',
    snapshots: [],
    checkpoints: {},
    baseline: { platform: 'youtube', format: 'fidit', points: [] },
    ...over
  };
}

const at = (hoursBeforeAsOf: number, views: number | null) => ({ observedAt: AS_OF - hoursBeforeAsOf * H, views });

describe('daily table growth', () => {
  it('calls a growth «+24ч» only for a pair 24 h ± 2 h apart, the one closest to a day', () => {
    const growth = growthOf({ observedAt: AS_OF, views: 12_000 }, [at(25.5, 8_000), at(23, 9_000), at(12, 10_000)]);
    expect(growth).toEqual({ kind: 'day', views: 3_000, hours: 23, viewsPerHour: 130 });
  });

  it('shows another length as it is, and nothing for a pair shorter than 6 h or longer than 48 h', () => {
    expect(growthOf({ observedAt: AS_OF, views: 5_000 }, [at(20, 4_000)])).toEqual({
      kind: 'window',
      views: 1_000,
      hours: 20,
      viewsPerHour: 50
    });
    expect(growthOf({ observedAt: AS_OF, views: 5_000 }, [at(3, 4_000), at(60, 1_000)]).kind).toBe('none');
  });

  it('flags a counter that went down as an anomaly, never a negative growth', () => {
    expect(growthOf({ observedAt: AS_OF, views: 9_500 }, [at(24, 10_000)])).toEqual({
      kind: 'anomaly',
      views: null,
      hours: 24,
      viewsPerHour: null,
      drop: 500
    });
  });

  it('skips readings without views', () => {
    expect(growthOf({ observedAt: AS_OF, views: 300 }, [at(24, null), at(30, 100)])).toMatchObject({
      kind: 'window',
      hours: 30
    });
  });
});

describe('daily table rows', () => {
  it('reads one fixed as_of: a reading after it does not count', () => {
    const row = dailyRowOf(
      item({ snapshots: [at(24, 1_000), at(0, 1_500), { observedAt: AS_OF + H, views: 9_999 }] }),
      AS_OF
    );
    expect(row).toMatchObject({ views: 1_500, observedAt: AS_OF, growth: { kind: 'day', views: 500 }, status: 'ok' });
  });

  it('gives null, never 0, without a reading, and marks an old reading stale by the video age', () => {
    expect(dailyRowOf(item(), AS_OF)).toMatchObject({ views: null, observedAt: null, status: 'no_data' });
    // Under 72 h a video is read about hourly: a 4-hour-old reading is stale.
    expect(dailyRowOf(item({ snapshots: [at(4, 100)] }), AS_OF).status).toBe('stale');
    // Older videos are read daily: 20 hours is on time.
    expect(dailyRowOf(item({ publishedAt: AS_OF - 10 * 24 * H, snapshots: [at(20, 100)] }), AS_OF).status).toBe('ok');
  });

  it('takes the six latest by publication time, not by views; fewer stay fewer; the future and duplicates are out', () => {
    const items = Array.from({ length: 8 }, (_, index) =>
      item({ id: `youtube:${index}`, publishedAt: AS_OF - (index + 1) * 24 * H, snapshots: [at(1, 100 * (8 - index))] })
    );
    const rows = dailyRowsOf([...items, items[0]!, item({ id: 'youtube:future', publishedAt: AS_OF + H })], AS_OF);
    expect(rows.map((row) => row.id)).toEqual([
      'youtube:0',
      'youtube:1',
      'youtube:2',
      'youtube:3',
      'youtube:4',
      'youtube:5'
    ]);
    expect(dailyRowsOf(items.slice(0, 2), AS_OF)).toHaveLength(2);
  });

  it('compares at the latest checkpoint both have; weak below five videos or on the platform curve', () => {
    const point = (ageHours: number, items: number) => ({ ageHours, views: 1_000, items, low: 800, high: 1_300 });
    const strong = dailyRowOf(
      item({
        checkpoints: { 24: 1_200, 48: null },
        baseline: { platform: 'youtube', format: 'fidit', points: [point(24, 5), point(48, 6)] }
      }),
      AS_OF
    );
    expect(strong.comparison).toEqual({
      ageHours: 24,
      views: 1_200,
      median: 1_000,
      low: 800,
      high: 1_300,
      items: 5,
      weak: false
    });
    const few = dailyRowOf(
      item({ checkpoints: { 24: 1_200 }, baseline: { platform: 'youtube', format: 'fidit', points: [point(24, 4)] } }),
      AS_OF
    );
    expect(few.comparison?.weak).toBe(true);
    const platformCurve = dailyRowOf(
      item({ checkpoints: { 24: 1_200 }, baseline: { platform: 'youtube', points: [point(24, 9)] } }),
      AS_OF
    );
    expect(platformCurve.comparison?.weak).toBe(true);
    expect(dailyRowOf(item(), AS_OF).comparison).toBeNull();
  });

  it('keeps the short title without the rubric the owner closes it with', () => {
    expect(shortTitleOf('БКБ | Учу фидить в доту')).toBe('БКБ');
    expect(shortTitleOf('Джакиро — Учусь играть в доту. Часть 15')).toBe('Джакиро');
    expect(shortTitleOf('Как люди получают трёхсотый уровень?')).toBe('Как люди…');
  });
});
