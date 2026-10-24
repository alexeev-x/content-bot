import type { Clock } from '../../platform/clock';
import { type DailyRow, dailyRowsOf, growthOf } from './daily-table';
import { type Forecast, forecastViews } from './forecast';
import type { ContentAlertRepository } from './d1-content-alerts-repository';
import type { ContentAnalyticsRepository, ItemRow } from './d1-content-analytics-repository';
import { BASELINE_WINDOW_MS, baselineFor, FORMAT_BASELINE_MIN_ITEMS, formatIndex } from './service';
import type { ItemFormats } from './types';
import {
  type Peer,
  peersAt,
  reactionRates,
  type Reference,
  referencesOf,
  REFERENCES_PER_PLATFORM,
  type VideoTrend,
  videoTrend
} from './video-signals';

// The daily analytics table for both video platforms at one fixed `as_of` (plan P4, §4.1): the six latest
// published videos of each, their growth from stored readings and the comparison with the same rubric. The
// Telegram message and its schedule (P6) and forecasts (P5) are built on top of it; nothing here calls a model.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DAILY_PLATFORMS = ['youtube', 'tiktok'] as const;
/** Readings this far back hold a «+24ч» pair and the widest window shown (48 h). */
const READINGS_BACK_MS = 50 * HOUR_MS;
/**
 * The report shows every video of the last 30 days (owner, 22.10.2026: ChatGPT's report listed all 16, ours only
 * the six latest), and the older ones' week in one line.
 */
const MONTH_MS = 30 * DAY_MS;
const LISTED_PER_PLATFORM = 24;
const ROWS_MAX = 12;
const OLDER_MAX = 12;
/**
 * An older video is read weekly: its week is the reading nearest 7 days back, 3–14 days apart (the weekly snapshot
 * before the latest reading can be that close or that far), scaled to 7 days.
 */
const WEEK_MS = 7 * DAY_MS;
const WEEK_MIN_MS = 3 * DAY_MS;
const WEEK_MAX_MS = 14 * DAY_MS;
/** Telegram posts whose growth makes the channel's day: the last week's. */
const TELEGRAM_POSTS_BACK_MS = 7 * DAY_MS;
const TELEGRAM_POSTS_MAX = 30;

/** A video older than 30 days: its views and its last week's growth, null when no reading a week back. */
export interface OlderVideo {
  id: string;
  platform: (typeof DAILY_PLATFORMS)[number];
  title: string;
  url: string;
  views: number | null;
  weekViews: number | null;
}

/** The channel's day: its posts of the last 24 hours and the views all its recent posts gained. */
export interface TelegramDay {
  posts: { title: string; url: string; publishedAt: number; views: number | null; reactions: number | null }[];
  dayViews: number | null;
}

export interface FollowerCount {
  platform: 'telegram' | 'youtube' | 'tiktok';
  count: number;
  /** Against the reading of the day before; null without one. */
  change: number | null;
}

export interface DailyPlatform {
  platform: (typeof DAILY_PLATFORMS)[number];
  /** `error`: the last collection failed after the last success — the rows are older and say so. */
  state: 'ok' | 'error' | 'pending';
  lastSuccessAt: number | null;
  errorCode: string | null;
  /** Each row with its forecast from the same readings (plan P5): numbers or `insufficient_data`. */
  rows: (DailyRow & { forecast: Forecast } & DailySignals)[];
  /** The platform's most viewed videos, the review's yardstick (owner, 20.10.2026); absent in older reports. */
  references?: Reference[];
}

/** What a row says beyond its views (owner, 20.10.2026); absent in reports stored before then. */
export interface DailySignals {
  trend?: VideoTrend;
  /** Likes and shares as per cent of views, from the item's latest counters. */
  likesRate?: number | null;
  sharesRate?: number | null;
  /** Earlier videos of the same platform and rubric at the row's comparison age. */
  peers?: { ageHours: number; videos: Peer[] } | null;
}

export interface DailyAnalytics {
  asOf: number;
  /** Some platform has no fresh data: the report says so instead of showing zeros. */
  partial: boolean;
  platforms: DailyPlatform[];
  /**
   * The layout of 22.10.2026 (owner): the rows are every video of the last 30 days, with the older ones' week, the
   * channel's day and the followers. Absent in reports stored before, which keep their six-row tables.
   */
  layout?: 2;
  older?: OlderVideo[];
  telegram?: TelegramDay;
  followers?: FollowerCount[];
}

type Reading = { itemId: string; observedAt: number; views: number };

/** The week of an older video: from the reading nearest 7 days before its latest, scaled to 7 days. */
export function weekViewsOf(
  latest: { views: number | null; observedAt: number },
  readings: readonly Reading[]
): number | null {
  if (latest.views === null) return null;
  const target = latest.observedAt - WEEK_MS;
  const before = readings
    .filter(
      (row) => latest.observedAt - row.observedAt >= WEEK_MIN_MS && latest.observedAt - row.observedAt <= WEEK_MAX_MS
    )
    .sort((a, b) => Math.abs(a.observedAt - target) - Math.abs(b.observedAt - target))[0];
  if (before === undefined || latest.views < before.views) return null;
  return Math.round(((latest.views - before.views) * WEEK_MS) / (latest.observedAt - before.observedAt));
}

/** Each platform's latest follower count and its change from the day before. */
export function followerCounts(
  rows: readonly { platform: FollowerCount['platform']; day: string; followers: number }[]
): FollowerCount[] {
  return (['telegram', 'tiktok', 'youtube'] as const).flatMap((platform) => {
    const days = rows.filter((row) => row.platform === platform).sort((a, b) => a.day.localeCompare(b.day));
    const last = days.at(-1);
    const previous = days.at(-2);
    if (last === undefined) return [];
    const consecutive = previous !== undefined && Date.parse(last.day) - Date.parse(previous.day) === DAY_MS;
    return [{ platform, count: last.followers, change: consecutive ? last.followers - previous.followers : null }];
  });
}

export async function readDailyAnalytics(deps: {
  repo: ContentAnalyticsRepository;
  clock: Clock;
  formats?: ItemFormats;
  /** The older videos' week, the channel and the followers; without it the report shows the videos alone. */
  alerts?: Pick<ContentAlertRepository, 'readSnapshots' | 'readFollowers'>;
}): Promise<DailyAnalytics> {
  const asOf = deps.clock.now();
  const listed = await Promise.all(
    DAILY_PLATFORMS.map((platform) => deps.repo.listItems({ platform, limit: LISTED_PER_PLATFORM }))
  );
  const latest = listed.map((items) => items.filter((item) => item.publishedAt > asOf - MONTH_MS).slice(0, ROWS_MAX));
  const olderItems = listed
    .flatMap((items) => items.filter((item) => item.publishedAt <= asOf - MONTH_MS))
    .slice(0, OLDER_MAX * 2);
  const ids = latest.flat().map((item) => item.id);
  const [daily, checkpoints, formatOf, top] = await Promise.all([
    deps.repo.readDaily({ ids, from: asOf - READINGS_BACK_MS }),
    deps.repo.readCheckpoints({ publishedFrom: asOf - BASELINE_WINDOW_MS }),
    formatIndex(deps),
    deps.repo.topVideos(REFERENCES_PER_PLATFORM)
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
      rows: dailyRowsOf(items, asOf, ROWS_MAX).map((row) => {
        const item = items.find((each) => each.id === row.id)!;
        const counters = (latest[index] ?? []).find((each) => each.id === row.id);
        const rates = counters === undefined ? { likes: null, shares: null } : reactionRates(counters);
        const peerAge = row.comparison?.ageHours ?? null;
        return {
          ...row,
          forecast: forecastViews({ readings: item.snapshots, publishedAt: item.publishedAt, origin: asOf }),
          trend: videoTrend({
            ageHours: row.ageHours,
            views: row.views,
            growth: row.growth,
            previousGrowth: row.previousGrowth ?? { kind: 'none', views: null, hours: null, viewsPerHour: null },
            comparison: row.comparison
          }),
          likesRate: rates.likes,
          sharesRate: rates.shares,
          peers:
            peerAge === null
              ? null
              : {
                  ageHours: peerAge,
                  videos: peersAt(checkpoints, { ...row, ageHours: peerAge }, (id) => formatById.get(id))
                }
        };
      }),
      references: referencesOf(
        top.filter((item) => item.platform === platform),
        (item) => formatById.get(item.id) ?? formatOf(item).format,
        asOf
      )
    };
  });
  const extra = deps.alerts === undefined ? {} : await readExtras(deps.alerts, deps.repo, olderItems, asOf);
  return {
    asOf,
    partial: platforms.some((platform) => platform.state !== 'ok' || platform.rows.some((row) => row.status !== 'ok')),
    platforms,
    layout: 2,
    ...extra
  };
}

/** The older videos' week, the channel's day and the followers: three reads besides the videos' own. */
async function readExtras(
  alerts: Pick<ContentAlertRepository, 'readSnapshots' | 'readFollowers'>,
  repo: ContentAnalyticsRepository,
  olderItems: readonly ItemRow[],
  asOf: number
): Promise<Pick<DailyAnalytics, 'older' | 'telegram' | 'followers'>> {
  const posts = (await repo.listItems({ platform: 'telegram', limit: TELEGRAM_POSTS_MAX })).filter(
    (item) => item.publishedAt > asOf - TELEGRAM_POSTS_BACK_MS && item.publishedAt <= asOf
  );
  const [olderReadings, postReadings, followers] = await Promise.all([
    alerts.readSnapshots(
      olderItems.map((item) => item.id),
      asOf - WEEK_MAX_MS
    ),
    alerts.readSnapshots(
      posts.map((item) => item.id),
      asOf - READINGS_BACK_MS
    ),
    alerts.readFollowers(new Date(asOf - 3 * DAY_MS).toISOString().slice(0, 10))
  ]);
  const older = olderItems.flatMap((item): OlderVideo[] =>
    item.platform === 'telegram'
      ? []
      : [
          {
            id: item.id,
            platform: item.platform,
            title: item.title,
            url: item.url,
            views: item.views,
            weekViews: weekViewsOf(
              item,
              olderReadings.filter((row) => row.itemId === item.id && row.observedAt <= asOf)
            )
          }
        ]
  );
  // The channel's day: a post of the last 24 hours brings all its views, an older one its 24-hour growth.
  let dayViews: number | null = null;
  for (const post of posts) {
    const readings = postReadings.filter((row) => row.itemId === post.id && row.observedAt <= asOf);
    const last = readings.at(-1);
    if (last === undefined) continue;
    const gained = post.publishedAt > asOf - DAY_MS ? last.views : dayGrowthViews(last, readings);
    if (gained !== null) dayViews = (dayViews ?? 0) + gained;
  }
  return {
    older,
    telegram: {
      posts: posts
        .filter((post) => post.publishedAt > asOf - DAY_MS)
        .map((post) => ({
          title: post.title,
          url: post.url,
          publishedAt: post.publishedAt,
          views: postReadings.filter((row) => row.itemId === post.id && row.observedAt <= asOf).at(-1)?.views ?? null,
          reactions: post.likes
        })),
      dayViews
    },
    followers: followerCounts(followers.filter((row) => row.day <= new Date(asOf).toISOString().slice(0, 10)))
  };
}

/** A real 24-hour pair's growth, else null. */
function dayGrowthViews(last: Reading, readings: readonly Reading[]): number | null {
  const growth = growthOf(last, readings);
  return growth.kind === 'day' ? growth.views : null;
}
