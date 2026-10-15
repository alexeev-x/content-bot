import {
  CONTENT_ANALYTICS_SERIES_DAYS,
  type ContentAnalyticsOverviewDto,
  type ContentItemDetailDto,
  type ContentItemDto,
  type ContentItemsQuery,
  CONTENT_REPORT_ITEM_LIMIT,
  type ContentReportDto,
  type ContentReportQuery,
  type ContentBaselineDto,
  type ContentPlatform,
  type ContentSourceDto
} from '@alexeev/contracts';
import { z } from 'zod';
import type { Clock } from '../../platform/clock';
import type { Logger } from '../../platform/logging/logger';
import { decodeKeysetCursor, encodeKeysetCursor } from '../../platform/pagination/keyset-cursor';
import { AppError } from '../../shared/app-error';
import type { ConfiguredSources } from './collectors';
import {
  CHECKPOINT_HOURS,
  type CheckpointRow,
  type ContentAnalyticsRepository,
  type ItemRow
} from './d1-content-analytics-repository';
import { CONTENT_PLATFORMS, ContentCollectError } from './types';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Cron collects each source about once an hour. */
export const COLLECT_INTERVAL_MS = 55 * MINUTE_MS;
/** A failed collection is retried this much sooner than the regular interval. */
const RETRY_AFTER_FAILURE_MS = 15 * MINUTE_MS;
/** The owner's «Обновить» collects a source again only when its last claim is at least this old. */
const MANUAL_MIN_GAP_MS = 5 * MINUTE_MS;
/** D1 statements of one source's collection: the claim, the 5-statement write, the TikTok connection read and token write. */
export const SOURCE_D1_STATEMENTS = 8;

export function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

// Collects every configured source whose claim this caller wins. Ticks may overlap: the claim is a
// conditional UPDATE, so a source is collected by one caller per interval. One failing source never
// stops the others; its stable code is stored for the owner.
export async function collectContentAnalytics(deps: {
  repo: ContentAnalyticsRepository;
  sources: ConfiguredSources;
  clock: Clock;
  logger: Logger;
  requestId: string;
  /**
   * The invocation's subrequest meter: each collection's outbound requests are charged to it, and a source
   * is collected only while its whole cost still fits, leaving `reserve` for the caller. A source left out
   * keeps its schedule and is collected by a later call.
   */
  budget?: { charge(count: number): void; remaining(): number };
  reserve?: number;
  /** The owner's manual refresh: ignores the schedule, at most once per MANUAL_MIN_GAP_MS per source. */
  manual?: boolean;
}): Promise<{ collected: number; failed: number; deferred: number }> {
  let collected = 0;
  let failed = 0;
  let deferred = 0;
  const manual = deps.manual === true;
  for (const collector of deps.sources.collectors) {
    if (collector.ready !== undefined && !(await collector.ready())) continue;
    if (deps.budget && deps.budget.remaining() < collector.requests + SOURCE_D1_STATEMENTS + (deps.reserve ?? 0)) {
      deferred += 1;
      continue;
    }
    const now = deps.clock.now();
    const won = await deps.repo.claim({
      platform: collector.platform,
      now,
      nextRunAt: now + COLLECT_INTERVAL_MS,
      manual,
      // Cron: any earlier claim (the schedule decides); manual: one older than the gap.
      claimedBefore: manual ? now - MANUAL_MIN_GAP_MS : now
    });
    if (!won) continue;
    const startedAt = deps.clock.now();
    const fail = async (code: string, level: 'warn' | 'error'): Promise<void> => {
      failed += 1;
      deps.logger[level]({
        requestId: deps.requestId,
        component: 'content-analytics',
        operation: `collect_${collector.platform}`,
        status: 'error',
        errorCode: code,
        durationMs: deps.clock.now() - startedAt
      });
      const failedAt = deps.clock.now();
      await deps.repo.recordFailure({
        platform: collector.platform,
        now: failedAt,
        code,
        nextRunAt: failedAt + RETRY_AFTER_FAILURE_MS
      });
    };

    deps.budget?.charge(collector.requests);
    let collection;
    try {
      collection = await collector.collect();
    } catch (error) {
      await fail(error instanceof ContentCollectError ? error.code : 'COLLECT_FAILED', 'warn');
      continue;
    }
    const finishedAt = deps.clock.now();
    try {
      await deps.repo.recordSuccess({
        platform: collector.platform,
        now: finishedAt,
        day: utcDay(finishedAt),
        followers: collection.followers,
        items: collection.items
      });
    } catch (error) {
      // Our own write failed, not the source: a distinct code, and the error name for the logs.
      await fail(`STORE_FAILED_${error instanceof Error ? error.name : 'UNKNOWN'}`.slice(0, 64), 'error');
      continue;
    }
    collected += 1;
    const event = {
      requestId: deps.requestId,
      component: 'content-analytics',
      operation: `collect_${collector.platform}`,
      durationMs: deps.clock.now() - startedAt
    };
    if (collection.warning === undefined) deps.logger.info({ ...event, status: 'ok' });
    else deps.logger.warn({ ...event, status: 'partial', errorCode: collection.warning });
  }
  return { collected, failed, deferred };
}

function toItemDto(row: ItemRow): ContentItemDto {
  return {
    id: row.id,
    platform: row.platform,
    title: row.title,
    url: row.url,
    thumbnailUrl: row.thumbnailUrl,
    publishedAt: new Date(row.publishedAt).toISOString(),
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    observedAt: new Date(row.observedAt).toISOString()
  };
}

export async function readContentAnalyticsOverview(deps: {
  repo: ContentAnalyticsRepository;
  sources: ConfiguredSources;
  clock: Clock;
}): Promise<ContentAnalyticsOverviewDto> {
  const now = deps.clock.now();
  const rows = await deps.repo.readOverview({
    weekFrom: now - 7 * DAY_MS,
    monthFrom: now - 30 * DAY_MS,
    seriesFromDay: utcDay(now - CONTENT_ANALYTICS_SERIES_DAYS * DAY_MS)
  });
  const weekAgoDay = utcDay(now - 7 * DAY_MS);
  const configured = new Set(deps.sources.collectors.map((collector) => collector.platform));

  const sources = CONTENT_PLATFORMS.map((platform): ContentSourceDto => {
    const source = rows.sources.find((row) => row.platform === platform);
    const points = rows.followers.filter((row) => row.platform === platform);
    const latest = points.at(-1);
    const baseline = points.filter((row) => row.day <= weekAgoDay).at(-1);
    const week = rows.week.find((row) => row.platform === platform);
    const connection = rows.connections.find((row) => row.platform === platform);
    const oauth = platform === 'tiktok' && deps.sources.tiktok !== null;
    const tiktokName = connection?.accountName ?? null;
    const known =
      platform === 'tiktok'
        ? connection === undefined
          ? undefined
          : {
              handle: tiktokName ?? 'TikTok',
              profileUrl: tiktokName === null ? 'https://www.tiktok.com' : `https://www.tiktok.com/@${tiktokName}`
            }
        : deps.sources.handles[platform];
    const lastSuccessAt = source?.lastSuccessAt ?? null;
    const failedLast =
      source?.lastErrorAt !== null && source?.lastErrorAt !== undefined && source.lastErrorAt >= (lastSuccessAt ?? 0);
    const state =
      !configured.has(platform) || (oauth && connection === undefined)
        ? 'not_configured'
        : failedLast
          ? 'error'
          : lastSuccessAt === null
            ? 'pending'
            : 'ok';
    return {
      platform,
      state,
      handle: known?.handle ?? null,
      profileUrl: known?.profileUrl ?? null,
      followers: latest?.followers ?? null,
      followersChange7d: latest !== undefined && baseline !== undefined ? latest.followers - baseline.followers : null,
      views7d: week?.views ?? null,
      items7d: week?.items ?? 0,
      lastSyncedAt: lastSuccessAt === null ? null : new Date(lastSuccessAt).toISOString(),
      errorCode: failedLast ? (source?.lastErrorCode ?? 'COLLECT_FAILED') : null,
      connection: !oauth ? 'none' : connection === undefined ? 'available' : 'connected'
    };
  });

  return {
    observedAt: new Date(now).toISOString(),
    sources,
    followers: CONTENT_PLATFORMS.map((platform) => ({
      platform,
      points: rows.followers
        .filter((row) => row.platform === platform)
        .map((row) => ({ day: row.day, followers: row.followers }))
    })).filter((series) => series.points.length > 0),
    recent: rows.recent.map(toItemDto),
    top: rows.top.map(toItemDto)
  };
}

const cursorSchema = z.tuple([z.number().int().nonnegative(), z.string().min(3).max(160)]);

export async function listContentItems(
  repo: ContentAnalyticsRepository,
  query: ContentItemsQuery
): Promise<{ items: ContentItemDto[]; nextCursor: string | null }> {
  const after = query.cursor === undefined ? undefined : decodeKeysetCursor(query.cursor, cursorSchema);
  if (after === null) throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
  const rows = await repo.listItems({ platform: query.platform, after, limit: query.limit + 1 });
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map(toItemDto),
    nextCursor: rows.length > query.limit && last !== undefined ? encodeKeysetCursor([last.publishedAt, last.id]) : null
  };
}

export async function readContentItem(
  deps: { repo: ContentAnalyticsRepository; clock: Clock },
  id: string
): Promise<ContentItemDetailDto> {
  const found = await deps.repo.readItem(id);
  if (found === null) throw new AppError('NOT_FOUND', 'Content item not found');
  const checkpoints = await deps.repo.readCheckpoints({
    publishedFrom: deps.clock.now() - BASELINE_WINDOW_MS,
    platform: found.item.platform
  });
  return {
    baseline: baselineFor(checkpoints, found.item.platform, found.item.id),
    item: toItemDto(found.item),
    snapshots: found.snapshots.map((snapshot) => ({
      ...snapshot,
      observedAt: new Date(snapshot.observedAt).toISOString()
    }))
  };
}

export async function readContentReport(
  deps: { repo: ContentAnalyticsRepository; clock: Clock },
  query: ContentReportQuery
): Promise<ContentReportDto> {
  const now = deps.clock.now();
  const from = now - query.days * DAY_MS;
  const previousFrom = from - query.days * DAY_MS;
  const [rows, checkpoints] = await Promise.all([
    deps.repo.readReport({
      publishedFrom: previousFrom,
      fromDay: utcDay(previousFrom),
      limit: CONTENT_REPORT_ITEM_LIMIT + 1
    }),
    deps.repo.readCheckpoints({ publishedFrom: now - BASELINE_WINDOW_MS })
  ]);
  return {
    from: new Date(from).toISOString(),
    to: new Date(now).toISOString(),
    previousFrom: new Date(previousFrom).toISOString(),
    items: rows.items.slice(0, CONTENT_REPORT_ITEM_LIMIT).map(toItemDto),
    truncated: rows.items.length > CONTENT_REPORT_ITEM_LIMIT,
    followers: CONTENT_PLATFORMS.map((platform) => ({
      platform,
      points: rows.followers
        .filter((row) => row.platform === platform)
        .map((row) => ({ day: row.day, followers: row.followers }))
    })).filter((series) => series.points.length > 0),
    baselines: CONTENT_PLATFORMS.map((platform) => baselineFor(checkpoints, platform)),
    growth: rows.growth,
    tracked: checkpoints.map((row) => row.id)
  };
}

/** Items tracked from birth over the last 90 days make the usual curve. */
const BASELINE_WINDOW_MS = 90 * DAY_MS;
const BASELINE_MIN_ITEMS = 3;

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

/** Linear-interpolated quantile (0..1) of a non-empty list, rounded. */
function quantileOf(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return Math.round(sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower));
}

export function baselineFor(
  rows: readonly CheckpointRow[],
  platform: ContentPlatform,
  excludeId?: string
): ContentBaselineDto {
  const own = rows.filter((row) => row.platform === platform && row.id !== excludeId);
  const points: ContentBaselineDto['points'] = [];
  for (const hours of CHECKPOINT_HOURS) {
    const values = own.map((row) => row.views[hours]).filter((value): value is number => value !== null);
    if (values.length >= BASELINE_MIN_ITEMS)
      points.push({
        ageHours: hours,
        views: medianOf(values),
        items: values.length,
        low: quantileOf(values, 0.25),
        high: quantileOf(values, 0.75)
      });
  }
  return { platform, points };
}
