import {
  FORECAST_HORIZONS_HOURS,
  FORECAST_METHOD,
  type ForecastHorizon,
  type ForecastReading,
  forecastViews,
  naiveForecasts
} from './forecast';
import type { ContentPlatform } from './types';

// Rolling-origin backtest of the forecast (plan §5): at each historical origin `t` a forecast is made from the
// readings up to `t` only and compared with the reading at `t + horizon`. A horizon not reached yet, or with no
// reading near it, is not scored (FC-06): a current value never stands in for a missing fact.

const HOUR_MS = 60 * 60 * 1000;
/** How far the reading that stands for the fact may be from the horizon; daily readings drift by hours. */
const FACT_TOLERANCE_MS: Record<ForecastHorizon, number> = { 24: 2 * HOUR_MS, 72: 6 * HOUR_MS, 168: 6 * HOUR_MS };
const AGE_BUCKETS = [
  { name: 'до 1 дня', upTo: 24 },
  { name: '1–3 дня', upTo: 72 },
  { name: 'старше 3 дней', upTo: Number.POSITIVE_INFINITY }
] as const;

export interface BacktestItem {
  id: string;
  platform: ContentPlatform;
  publishedAt: number;
  readings: readonly ForecastReading[];
}

export interface BacktestCell {
  platform: ContentPlatform;
  horizon: ForecastHorizon;
  age: (typeof AGE_BUCKETS)[number]['name'];
  /** Scored forecasts, and the origins where the method declined (insufficient data). */
  scored: number;
  declined: number;
  /** The fact inside the band, under it, over it (FC-14: a fact under the band is a miss, never a success). */
  inBand: number;
  below: number;
  above: number;
  /** Median absolute percentage error of the expected value, and of the simple methods on the same origins. */
  mdape: number | null;
  flatMdape: number | null;
  linearMdape: number | null;
}

export interface BacktestReport {
  method: string;
  cells: BacktestCell[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return Math.round(value * 1000) / 1000;
}

/** The reading that stands for the fact at `target`: the closest one within the horizon's tolerance. */
export function factAt(readings: readonly ForecastReading[], target: number, horizon: ForecastHorizon): number | null {
  let best: { observedAt: number; views: number } | null = null;
  for (const row of readings) {
    if (row.views === null || Math.abs(row.observedAt - target) > FACT_TOLERANCE_MS[horizon]) continue;
    if (best === null || Math.abs(row.observedAt - target) < Math.abs(best.observedAt - target))
      best = { observedAt: row.observedAt, views: row.views };
  }
  return best?.views ?? null;
}

/** Origins every `stepHours` of each item's age from its first day, up to `until`. */
export function backtestForecasts(
  items: readonly BacktestItem[],
  options: { until: number; stepHours?: number }
): BacktestReport {
  const step = (options.stepHours ?? 24) * HOUR_MS;
  const errors = new Map<string, { cell: BacktestCell; own: number[]; flat: number[]; linear: number[] }>();
  const cellOf = (platform: ContentPlatform, horizon: ForecastHorizon, ageHours: number) => {
    const age = AGE_BUCKETS.find((bucket) => ageHours < bucket.upTo)!.name;
    const key = `${platform}|${horizon}|${age}`;
    let entry = errors.get(key);
    if (entry === undefined) {
      entry = {
        cell: {
          platform,
          horizon,
          age,
          scored: 0,
          declined: 0,
          inBand: 0,
          below: 0,
          above: 0,
          mdape: null,
          flatMdape: null,
          linearMdape: null
        },
        own: [],
        flat: [],
        linear: []
      };
      errors.set(key, entry);
    }
    return entry;
  };
  for (const item of items) {
    for (let origin = item.publishedAt + step; origin <= options.until; origin += step) {
      const ageHours = (origin - item.publishedAt) / HOUR_MS;
      const forecast = forecastViews({ readings: item.readings, publishedAt: item.publishedAt, origin });
      for (const hours of FORECAST_HORIZONS_HOURS) {
        const target = origin + hours * HOUR_MS;
        if (target > options.until) continue;
        const fact = factAt(item.readings, target, hours);
        if (fact === null) continue;
        const entry = cellOf(item.platform, hours, ageHours);
        if (forecast.quality !== 'ok') {
          entry.cell.declined += 1;
          continue;
        }
        const point = forecast.horizons.find((row) => row.hours === hours)!;
        entry.cell.scored += 1;
        if (fact < point.low) entry.cell.below += 1;
        else if (fact > point.high) entry.cell.above += 1;
        else entry.cell.inBand += 1;
        if (fact <= 0) continue;
        entry.own.push(Math.abs(point.expected - fact) / fact);
        const naive = naiveForecasts(item.readings, origin, hours);
        if (naive !== null) {
          entry.flat.push(Math.abs(naive.flat - fact) / fact);
          entry.linear.push(Math.abs(naive.linear - fact) / fact);
        }
      }
    }
  }
  return {
    method: FORECAST_METHOD,
    cells: [...errors.values()].map(({ cell, own, flat, linear }) => ({
      ...cell,
      mdape: median(own),
      flatMdape: median(flat),
      linearMdape: median(linear)
    }))
  };
}
