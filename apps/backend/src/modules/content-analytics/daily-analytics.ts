import type { Clock } from '../../platform/clock';
import { type DailyRow, dailyRowsOf } from './daily-table';
import { type Forecast, forecastViews } from './forecast';
import type { ContentAnalyticsRepository } from './d1-content-analytics-repository';
import { BASELINE_WINDOW_MS, baselineFor, FORMAT_BASELINE_MIN_ITEMS, formatIndex } from './service';
import type { ItemFormats } from './types';

// The daily analytics table for both video platforms at one fixed `as_of` (plan P4, §4.1): the six latest
// published videos of each, their growth from stored readings and the comparison with the same rubric. The
// Telegram message and its schedule (P6) and forecasts (P5) are built on top of it; nothing here calls a model.

const HOUR_MS = 60 * 60 * 1000;
const DAILY_PLATFORMS = ['youtube', 'tiktok'] as const;
/** Readings this far back hold a «+24ч» pair and the widest window shown (48 h). */
const READINGS_BACK_MS = 50 * HOUR_MS;
const PER_PLATFORM = 6;

export interface DailyPlatform {
  platform: (typeof DAILY_PLATFORMS)[number];
  /** `error`: the last collection failed after the last success — the rows are older and say so. */
  state: 'ok' | 'error' | 'pending';
  lastSuccessAt: number | null;
  errorCode: string | null;
  /** Each row with its forecast from the same readings (plan P5): numbers or `insufficient_data`. */
  rows: (DailyRow & { forecast: Forecast })[];
}

export interface DailyAnalytics {
  asOf: number;
  /** Some platform has no fresh data: the report says so instead of showing zeros. */
  partial: boolean;
  platforms: DailyPlatform[];
}

export async function readDailyAnalytics(deps: {
  repo: ContentAnalyticsRepository;
  clock: Clock;
  formats?: ItemFormats;
}): Promise<DailyAnalytics> {
  const asOf = deps.clock.now();
  const latest = await Promise.all(
    DAILY_PLATFORMS.map((platform) => deps.repo.listItems({ platform, limit: PER_PLATFORM }))
  );
  const ids = latest.flat().map((item) => item.id);
  const [daily, checkpoints, formatOf] = await Promise.all([
    deps.repo.readDaily({ ids, from: asOf - READINGS_BACK_MS }),
    deps.repo.readCheckpoints({ publishedFrom: asOf - BASELINE_WINDOW_MS }),
    formatIndex(deps)
  ]);
  // Classified once: reading a rubric from a title is the costly part (10 ms of CPU per request on Free).
  const formatById = new Map(checkpoints.map((row) => [row.id, formatOf(row).format]));
  const platforms = DAILY_PLATFORMS.map((platform, index): DailyPlatform => {
    const source = daily.sources.find((row) => row.platform === platform);
    const lastSuccessAt = source?.lastSuccessAt ?? null;
    const failedLast = source?.lastErrorAt != null && source.lastErrorAt >= (lastSuccessAt ?? 0);
    const items = (latest[index] ?? []).map((item) => {
      const { format, source: formatSource } = formatOf(item);
      const ids = new Set(
        checkpoints.filter((row) => row.platform === platform && formatById.get(row.id) === format).map((row) => row.id)
      );
      const byFormat = baselineFor(checkpoints, platform, item.id, { ids, minItems: FORMAT_BASELINE_MIN_ITEMS });
      return {
        id: item.id,
        platform,
        title: item.title,
        url: item.url,
        publishedAt: item.publishedAt,
        format,
        formatSource,
        snapshots: daily.snapshots.filter((row) => row.itemId === item.id),
        checkpoints: checkpoints.find((row) => row.id === item.id)?.views ?? {},
        // Same platform and rubric when five videos allow it; else the platform curve, which marks it weak.
        baseline: byFormat.points.length > 0 ? { ...byFormat, format } : baselineFor(checkpoints, platform, item.id)
      };
    });
    return {
      platform,
      state: failedLast ? 'error' : lastSuccessAt === null ? 'pending' : 'ok',
      lastSuccessAt,
      errorCode: failedLast ? (source?.lastErrorCode ?? 'COLLECT_FAILED') : null,
      rows: dailyRowsOf(items, asOf, PER_PLATFORM).map((row) => {
        const item = items.find((each) => each.id === row.id)!;
        return {
          ...row,
          forecast: forecastViews({ readings: item.snapshots, publishedAt: item.publishedAt, origin: asOf })
        };
      })
    };
  });
  return {
    asOf,
    partial: platforms.some((platform) => platform.state !== 'ok' || platform.rows.some((row) => row.status !== 'ok')),
    platforms
  };
}
