import { describe, expect, it } from 'vitest';
import { type ForecastReading, forecastViews } from './forecast';
import { backtestForecasts, factAt } from './forecast-backtest';

// Forecast cases FC-01…FC-08, FC-13, FC-14 of the plan: a forecast that peeks into the future, invents a number
// from too little data or scores a miss as a success would make every accuracy claim worthless.

const H = 60 * 60 * 1000;
const PUBLISHED = Date.UTC(2026, 9, 1, 12, 0);

/** Hourly readings of a short video whose views slow down as 1/age: 2 000 views an hour at the age of one hour. */
function decaying(hours: number, from = 1): ForecastReading[] {
  return Array.from({ length: hours - from + 1 }, (_, index) => {
    const age = from + index;
    return { observedAt: PUBLISHED + age * H, views: Math.round(2000 * Math.log(age + 1)) + 100 };
  });
}

describe('forecastViews', () => {
  it('gives the same numbers for the same readings (FC-01) and one band per horizon from the origin', () => {
    const input = { readings: decaying(30), publishedAt: PUBLISHED, origin: PUBLISHED + 30 * H };
    const first = forecastViews(input);
    expect(forecastViews(input)).toEqual(first);
    expect(first.quality).toBe('ok');
    if (first.quality !== 'ok') return;
    expect(first.horizons.map((row) => [row.hours, row.at])).toEqual([
      [24, PUBLISHED + 54 * H],
      [72, PUBLISHED + 102 * H],
      [168, PUBLISHED + 198 * H]
    ]);
    for (const row of first.horizons) {
      expect(row.low).toBeLessThanOrEqual(row.expected);
      expect(row.high).toBeGreaterThan(row.expected);
      expect(row.low).toBeGreaterThanOrEqual(first.baseViews);
    }
  });

  it('declines with too few, stale or dropping readings instead of a confident number (FC-02, FC-03)', () => {
    const origin = PUBLISHED + 30 * H;
    expect(forecastViews({ readings: decaying(30).slice(-2), publishedAt: PUBLISHED, origin })).toMatchObject({
      quality: 'insufficient_data',
      reason: 'too_few_readings'
    });
    expect(forecastViews({ readings: decaying(20), publishedAt: PUBLISHED, origin })).toMatchObject({
      quality: 'insufficient_data',
      reason: 'stale'
    });
    const dropped = decaying(30).map((row, index) => (index === 25 ? { ...row, views: 10 } : row));
    expect(forecastViews({ readings: dropped, publishedAt: PUBLISHED, origin })).toMatchObject({
      quality: 'insufficient_data',
      reason: 'counter_drop'
    });
  });

  it('reads nothing after its origin: the future readings change nothing (FC-04)', () => {
    const origin = PUBLISHED + 30 * H;
    const known = decaying(30);
    const withFuture = [...known, ...decaying(200, 31).map((row) => ({ ...row, views: (row.views ?? 0) * 50 }))];
    expect(forecastViews({ readings: withFuture, publishedAt: PUBLISHED, origin })).toEqual(
      forecastViews({ readings: known, publishedAt: PUBLISHED, origin })
    );
  });

  it('keeps a burst inside a wide band and clamps an impossible jump (FC-08)', () => {
    const burst: ForecastReading[] = [
      { observedAt: PUBLISHED + 2 * H, views: 100 },
      { observedAt: PUBLISHED + 8 * H, views: 200 },
      { observedAt: PUBLISHED + 9 * H, views: 200_000 }
    ];
    const forecast = forecastViews({ readings: burst, publishedAt: PUBLISHED, origin: PUBLISHED + 9 * H });
    expect(forecast.quality).toBe('ok');
    if (forecast.quality !== 'ok') return;
    const week = forecast.horizons.find((row) => row.hours === 168)!;
    expect(week.high).toBeLessThanOrEqual(200_000 * 20);
    expect(week.high / week.low).toBeGreaterThan(2);
  });
});

describe('backtestForecasts', () => {
  it('scores only reached horizons with a fact near them (FC-05, FC-06)', () => {
    const readings = decaying(100);
    expect(factAt(readings, PUBLISHED + 100.5 * H, 24)).toBe(readings.at(-1)?.views);
    expect(factAt(readings, PUBLISHED + 110 * H, 24)).toBeNull();
    const report = backtestForecasts([{ id: 'youtube:a', platform: 'youtube', publishedAt: PUBLISHED, readings }], {
      until: PUBLISHED + 100 * H
    });
    // Origins at 24, 48, 72 h: 24-hour facts at 48, 72, 96 h; 72-hour facts only for the 24 h origin; no 7-day facts.
    const count = (horizon: number) =>
      report.cells
        .filter((cell) => cell.horizon === horizon)
        .reduce((sum, cell) => sum + cell.scored + cell.declined, 0);
    expect([count(24), count(72), count(168)]).toEqual([3, 1, 0]);
  });

  it('reports sizes, a fact under the band as a miss and the simple methods on the same origins (FC-13, FC-14)', () => {
    // A video that stops dead after a day: the forecast expects more, the fact is under the band.
    const stalled = [
      ...decaying(24),
      ...Array.from({ length: 80 }, (_, index) => ({
        observedAt: PUBLISHED + (25 + index) * H,
        views: decaying(24).at(-1)!.views
      }))
    ];
    const report = backtestForecasts(
      [
        { id: 'youtube:a', platform: 'youtube', publishedAt: PUBLISHED, readings: decaying(200) },
        { id: 'tiktok:b', platform: 'tiktok', publishedAt: PUBLISHED, readings: stalled }
      ],
      { until: PUBLISHED + 200 * H }
    );
    expect(report.method).toBe('decay-v1');
    const tiktokDay = report.cells.find(
      (cell) => cell.platform === 'tiktok' && cell.horizon === 24 && cell.age === '1–3 дня'
    );
    expect(tiktokDay?.below).toBeGreaterThan(0);
    expect(tiktokDay?.scored).toBe((tiktokDay?.inBand ?? 0) + (tiktokDay?.below ?? 0) + (tiktokDay?.above ?? 0));
    // On a 1/age curve the decay method beats «views go on at the current rate».
    const youtubeWeek = report.cells.filter((cell) => cell.platform === 'youtube' && cell.horizon === 168);
    for (const cell of youtubeWeek) {
      expect(cell.scored).toBeGreaterThan(0);
      expect(cell.mdape).not.toBeNull();
      expect(cell.mdape!).toBeLessThan(cell.linearMdape!);
    }
  });
});
