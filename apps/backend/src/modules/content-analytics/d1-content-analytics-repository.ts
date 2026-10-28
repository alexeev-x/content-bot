import {
  type ContentContaminationReason,
  CONTENT_ANALYTICS_RECENT_LIMIT,
  CONTENT_ANALYTICS_TOP_LIMIT,
  CONTENT_ITEM_SNAPSHOT_LIMIT
} from '@alexeev/contracts';
import type { CollectedItem, ContentPlatform, VideoFormat } from './types';

const HOUR_MS = 60 * 60 * 1000;
/** Items younger than this get an hourly snapshot; older ones one every 3 hours. */
export const EARLY_WINDOW_MS = 72 * HOUR_MS;
// Guards below one period, so a tick that runs a few minutes early still records its snapshot.
const HOURLY_GUARD_MS = 50 * 60 * 1000;
// Every 3 hours, not daily (owner, 22.10.2026): a daily snapshot fell at the hour of the video's publication, so the
// morning report's «+сут» of a video published later in the day was a day old.
const MID_GUARD_MS = 3 * HOUR_MS - 10 * 60 * 1000;
/** Items older than this change little: one snapshot a week keeps the history bounded. */
const LATE_WINDOW_MS = 30 * 24 * HOUR_MS;
const WEEKLY_GUARD_MS = 7 * 24 * HOUR_MS - HOUR_MS;
/** Up to 24 videos read every 3 hours (the youngest hourly) over two days, with room: the daily table's bound. */
const DAILY_SNAPSHOT_LIMIT = 800;
/** Ages (hours) at which an item's views are kept for «at the same age» comparisons. */
export const CHECKPOINT_HOURS = [1, 3, 6, 12, 24, 48, 72] as const;
// A checkpoint is taken by the first collection within 90 minutes after it; later readings (a backfill,
// a long outage) leave it empty rather than record a value from a different age.
const CHECKPOINT_WINDOW_MS = 90 * 60 * 1000;
/** The age past which a post gets no more checkpoints: the last one (72 hours) plus its window. */
const CHECKPOINT_AGE_MS = 73 * HOUR_MS + CHECKPOINT_WINDOW_MS;
/**
 * Posts younger than this are rewritten on every read, changed or not: the checkpoints need `observed_at = now`, and
 * the TikTok «gone» and «stalled» checks (alerts.ts, a week back) read `observed_at` as the last time a post was seen.
 */
export const ALWAYS_READ_MS = 7 * 24 * HOUR_MS;
const CHECKPOINT_SET = CHECKPOINT_HOURS.map(
  (hours) =>
    `v${hours}h = COALESCE(v${hours}h, CASE WHEN ?1 - published_at >= ${hours * HOUR_MS} AND ?1 - published_at < ${hours * HOUR_MS + CHECKPOINT_WINDOW_MS} THEN views END)`
).join(',\n               ');

export interface SourceRow {
  platform: ContentPlatform;
  nextRunAt: number;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastErrorCode: string | null;
}

export interface ItemRow {
  id: string;
  platform: ContentPlatform;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  publishedAt: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  /** When the item's numbers last changed; a post young enough for checkpoints, its last read. */
  observedAt: number;
}

export interface SnapshotRow {
  observedAt: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

export interface CheckpointRow {
  id: string;
  platform: ContentPlatform;
  /** The video's rubric is read from it (`titleFormat`). */
  title: string;
  publishedAt: number;
  /** Views by checkpoint hour; null where the item has no reading for it. */
  views: Record<(typeof CHECKPOINT_HOURS)[number], number | null>;
  /** The owner confirmed its numbers are distorted, so no usual curve counts it. */
  contaminated: boolean;
}

/** A checkpoint read's columns; `contaminated` comes from the owner's confirmations (migration 0066). */
export function checkpointSelect(columns: readonly string[]): string {
  return `SELECT id, platform, title, published_at, ${columns.join(', ')},
    EXISTS (SELECT 1 FROM content_item_contamination c WHERE c.item_id = content_items.id) AS contaminated
    FROM content_items`;
}

export interface Contamination {
  reason: ContentContaminationReason;
  setAt: number;
}

export interface OverviewRows {
  sources: SourceRow[];
  followers: { platform: ContentPlatform; day: string; followers: number }[];
  week: { platform: ContentPlatform; items: number; views: number | null }[];
  recent: ItemRow[];
  top: ItemRow[];
  /** Connected OAuth accounts (TikTok) with their public name. */
  connections: { platform: ContentPlatform; accountName: string | null }[];
}

export interface ContentAnalyticsRepository {
  /**
   * Claims a source; true only for the caller that won. Cron needs `next_run_at <= now`; a manual claim
   * ignores the schedule but needs the previous claim to be older than `claimedBefore`.
   */
  claim(input: {
    platform: ContentPlatform;
    now: number;
    nextRunAt: number;
    manual: boolean;
    claimedBefore: number;
  }): Promise<boolean>;
  recordSuccess(input: {
    platform: ContentPlatform;
    now: number;
    day: string;
    followers: number | null;
    items: CollectedItem[];
  }): Promise<void>;
  recordFailure(input: { platform: ContentPlatform; now: number; code: string; nextRunAt: number }): Promise<void>;
  readOverview(input: { weekFrom: number; monthFrom: number; seriesFromDay: string }): Promise<OverviewRows>;
  listItems(input: {
    platform?: ContentPlatform | undefined;
    after?: readonly [number, string] | undefined;
    limit: number;
  }): Promise<ItemRow[]>;
  /**
   * The most viewed YouTube and TikTok videos, `limit` of each, in one round trip (the reports' references); a video
   * the owner marked distorted is never a yardstick.
   */
  topVideos(limit: number): Promise<ItemRow[]>;
  /** The ids among `ids` whose numbers the owner marked distorted (at most 100 ids), in one query. */
  contaminatedAmong(ids: readonly string[]): Promise<Set<string>>;
  /** The item, its newest snapshots, the owner's format mark and contamination, in one round trip. */
  readItem(id: string): Promise<{
    item: ItemRow;
    snapshots: SnapshotRow[];
    ownerFormat: VideoFormat | null;
    contamination: Contamination | null;
  } | null>;
  /** Ids of YouTube/TikTok videos published in [from, to], newest first. */
  videoIdsPublished(input: { from: number; to: number; limit: number }): Promise<string[]>;
  /** Items the owner marked with `format`, at most 500. */
  itemsMarked(format: VideoFormat): Promise<string[]>;
  /** Sets (or with null clears) the owner's mark of an existing item. */
  markFormat(input: { id: string; format: VideoFormat | null; now: number }): Promise<void>;
  /** Sets (or with null clears) the owner's contamination confirmation of an existing item. */
  markContamination(input: { id: string; reason: ContentContaminationReason | null; now: number }): Promise<void>;
  /**
   * The daily table's inputs (plan P4) in one round trip: the sources' state and the views of `ids` read since
   * `from` (bounded: at most 800 rows in all, newest kept).
   */
  readDaily(input: { ids: readonly string[]; from: number }): Promise<{
    sources: SourceRow[];
    snapshots: { itemId: string; observedAt: number; views: number | null }[];
  }>;
  /** Checkpoint views of the items published since `publishedFrom` that have any. */
  readCheckpoints(input: { publishedFrom: number; platform?: ContentPlatform }): Promise<CheckpointRow[]>;
  readReport(input: { publishedFrom: number; fromDay: string; limit: number }): Promise<{
    items: ItemRow[];
    followers: OverviewRows['followers'];
    growth: { platform: ContentPlatform; day: string; views: number }[];
  }>;
  /** The sources' collection and contamination version and the stored report of `days`, in one round trip. */
  readReportCache(days: number): Promise<{ version: string; cached: CachedReport | null }>;
  storeReportCache(input: { days: number } & CachedReport): Promise<void>;
}

export interface CachedReport {
  version: string;
  builtAt: number;
  report: string;
}

export const ITEM_COLUMNS =
  'id, platform, title, url, thumbnail_url, published_at, views, likes, comments, shares, observed_at';

export interface RawItem {
  id: string;
  platform: ContentPlatform;
  title: string;
  url: string;
  thumbnail_url: string | null;
  published_at: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  observed_at: number;
}

export function toItem(row: RawItem): ItemRow {
  return {
    id: row.id,
    platform: row.platform,
    title: row.title,
    url: row.url,
    thumbnailUrl: row.thumbnail_url,
    publishedAt: row.published_at,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    observedAt: row.observed_at
  };
}

export function createD1ContentAnalyticsRepository(db: D1Database): ContentAnalyticsRepository {
  return {
    async claim({ platform, now, nextRunAt, manual, claimedBefore }) {
      const result = await db
        .prepare(
          `UPDATE content_sources SET next_run_at = ?1, claimed_at = ?2
           WHERE platform = ?3 AND claimed_at <= ?4 AND (?5 = 1 OR next_run_at <= ?2)`
        )
        .bind(nextRunAt, now, platform, claimedBefore, manual ? 1 : 0)
        .run();
      return result.meta.changes === 1;
    },

    async recordSuccess({ platform, now, day, followers, items }) {
      // One JSON parameter per statement: D1 allows 100 bound values, and a source reports up to 200 items
      // (about 70–150 KB of JSON, well under D1's 2 MB value limit).
      const json = JSON.stringify(
        items.map((item) => ({
          id: `${platform}:${item.externalId}`,
          title: item.title,
          url: item.url,
          thumb: item.thumbnailUrl,
          published: item.publishedAt,
          views: item.views,
          likes: item.likes,
          comments: item.comments,
          shares: item.shares,
          tags: item.tags === undefined ? null : item.tags.slice(0, 10)
        }))
      );
      const statements = [
        db
          .prepare(
            `INSERT INTO content_items (${ITEM_COLUMNS}, tags)
             SELECT j.value ->> 'id', ?2, j.value ->> 'title', j.value ->> 'url', j.value ->> 'thumb',
                    j.value ->> 'published', j.value ->> 'views', j.value ->> 'likes', j.value ->> 'comments',
                    j.value ->> 'shares', ?3, j.value ->> 'tags'
             FROM json_each(?1) AS j WHERE true
             ON CONFLICT (id) DO UPDATE SET
               title = excluded.title, url = excluded.url, thumbnail_url = excluded.thumbnail_url,
               published_at = excluded.published_at, views = excluded.views, likes = excluded.likes,
               comments = excluded.comments, shares = excluded.shares, observed_at = excluded.observed_at,
               tags = excluded.tags
             -- Only a changed item is rewritten (owner, 28.10.2026: every run rewrote all ~200 items, 31 000 of
             -- production's 41 000 D1 rows written a day). A post younger than a week is always rewritten: the
             -- checkpoint below and the TikTok watch need observed_at = now.
             WHERE content_items.views IS NOT excluded.views OR content_items.likes IS NOT excluded.likes
               OR content_items.comments IS NOT excluded.comments OR content_items.shares IS NOT excluded.shares
               OR content_items.title IS NOT excluded.title OR content_items.url IS NOT excluded.url
               OR content_items.thumbnail_url IS NOT excluded.thumbnail_url
               OR content_items.published_at IS NOT excluded.published_at OR content_items.tags IS NOT excluded.tags
               OR excluded.published_at > ?3 - ?4`
          )
          .bind(json, platform, now, ALWAYS_READ_MS),
        db
          .prepare(
            `INSERT OR IGNORE INTO content_item_snapshots (item_id, observed_at, views, likes, comments, shares)
             SELECT j.value ->> 'id', ?2, j.value ->> 'views', j.value ->> 'likes', j.value ->> 'comments',
                    j.value ->> 'shares'
             FROM json_each(?1) AS j
             WHERE NOT EXISTS (
               SELECT 1 FROM content_item_snapshots AS s
               WHERE s.item_id = j.value ->> 'id'
                 AND s.observed_at > ?2 - CASE WHEN j.value ->> 'published' > ?2 - ?3 THEN ?4
                                                WHEN j.value ->> 'published' > ?2 - ?6 THEN ?5 ELSE ?7 END
             )`
          )
          .bind(json, now, EARLY_WINDOW_MS, HOURLY_GUARD_MS, MID_GUARD_MS, LATE_WINDOW_MS, WEEKLY_GUARD_MS),
        // After the upsert, so `views` is this collection's reading; `observed_at = now` keeps it to the items
        // this run actually read (a post missing from the source keeps its old, frozen count out).
        db
          .prepare(
            `UPDATE content_items SET ${CHECKPOINT_SET}
             WHERE platform = ?2 AND published_at > ?1 - ?3 AND observed_at = ?1`
          )
          .bind(now, platform, CHECKPOINT_AGE_MS),
        db
          .prepare(
            'UPDATE content_sources SET last_success_at = ?, last_error_at = NULL, last_error_code = NULL WHERE platform = ?'
          )
          .bind(now, platform)
      ];
      if (followers !== null) {
        statements.push(
          db
            .prepare(
              `INSERT INTO content_audience_days (platform, day, followers, observed_at) VALUES (?, ?, ?, ?)
               ON CONFLICT (platform, day) DO UPDATE SET followers = excluded.followers, observed_at = excluded.observed_at`
            )
            .bind(platform, day, followers, now)
        );
      }
      await db.batch(statements);
    },

    async recordFailure({ platform, now, code, nextRunAt }) {
      // Never later than the claim's own next run: a failure retries sooner, not later.
      await db
        .prepare(
          `UPDATE content_sources SET last_error_at = ?, last_error_code = ?, next_run_at = MIN(next_run_at, ?)
           WHERE platform = ?`
        )
        .bind(now, code.slice(0, 64), nextRunAt, platform)
        .run();
    },

    async readOverview({ weekFrom, monthFrom, seriesFromDay }) {
      const [sources, followers, week, recent, top, connections] = await db.batch([
        db.prepare(
          `SELECT platform, next_run_at AS nextRunAt, last_success_at AS lastSuccessAt, last_error_at AS lastErrorAt,
                  last_error_code AS lastErrorCode
           FROM content_sources`
        ),
        db
          .prepare(
            `SELECT platform, day, followers FROM content_audience_days
             WHERE platform IN ('telegram', 'youtube', 'tiktok') AND day >= ? ORDER BY platform, day`
          )
          .bind(seriesFromDay),
        db
          .prepare(
            `SELECT platform, COUNT(*) AS items, SUM(views) AS views FROM content_items
             WHERE published_at >= ? GROUP BY platform`
          )
          .bind(weekFrom),
        db
          .prepare(`SELECT ${ITEM_COLUMNS} FROM content_items ORDER BY published_at DESC, id DESC LIMIT ?`)
          .bind(CONTENT_ANALYTICS_RECENT_LIMIT),
        db
          .prepare(
            `SELECT ${ITEM_COLUMNS} FROM content_items
             WHERE published_at >= ? AND views IS NOT NULL ORDER BY views DESC, id DESC LIMIT ?`
          )
          .bind(monthFrom, CONTENT_ANALYTICS_TOP_LIMIT),
        db.prepare('SELECT platform, account_name AS accountName FROM content_connections')
      ]);
      return {
        sources: (sources?.results ?? []) as SourceRow[],
        followers: (followers?.results ?? []) as OverviewRows['followers'],
        week: (week?.results ?? []) as OverviewRows['week'],
        recent: ((recent?.results ?? []) as RawItem[]).map(toItem),
        top: ((top?.results ?? []) as RawItem[]).map(toItem),
        connections: (connections?.results ?? []) as OverviewRows['connections']
      };
    },

    async listItems({ platform, after, limit }) {
      const where: string[] = [];
      const values: (string | number)[] = [];
      if (platform !== undefined) {
        where.push('platform = ?');
        values.push(platform);
      }
      if (after !== undefined) {
        where.push('(published_at < ? OR (published_at = ? AND id < ?))');
        values.push(after[0], after[0], after[1]);
      }
      const rows = await db
        .prepare(
          `SELECT ${ITEM_COLUMNS} FROM content_items ${where.length === 0 ? '' : `WHERE ${where.join(' AND ')}`}
           ORDER BY published_at DESC, id DESC LIMIT ?`
        )
        .bind(...values, limit)
        .all<RawItem>();
      return rows.results.map(toItem);
    },

    async topVideos(limit) {
      const top = (platform: ContentPlatform) =>
        db
          .prepare(
            `SELECT ${ITEM_COLUMNS} FROM content_items WHERE platform = ? AND views IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM content_item_contamination c WHERE c.item_id = content_items.id)
             ORDER BY views DESC LIMIT ?`
          )
          .bind(platform, Math.min(limit, 10));
      const results = await db.batch<RawItem>([top('youtube'), top('tiktok')]);
      return results.flatMap((result) => result.results.map(toItem));
    },

    async readDaily({ ids, from }) {
      const [sources, snapshots] = await db.batch([
        db.prepare(
          `SELECT platform, next_run_at AS nextRunAt, last_success_at AS lastSuccessAt, last_error_at AS lastErrorAt,
                  last_error_code AS lastErrorCode
           FROM content_sources`
        ),
        db
          .prepare(
            `SELECT item_id AS itemId, observed_at AS observedAt, views FROM content_item_snapshots
             WHERE item_id IN (SELECT value FROM json_each(?1)) AND observed_at >= ?2
             ORDER BY observed_at DESC LIMIT ${DAILY_SNAPSHOT_LIMIT}`
          )
          .bind(JSON.stringify(ids.slice(0, 30)), from)
      ]);
      return {
        sources: (sources?.results ?? []) as SourceRow[],
        snapshots: (snapshots?.results ?? []) as { itemId: string; observedAt: number; views: number | null }[]
      };
    },

    async readCheckpoints({ publishedFrom, platform }) {
      const columns = CHECKPOINT_HOURS.map((hours) => `v${hours}h`);
      const rows = await db
        .prepare(
          `${checkpointSelect(columns)}
           WHERE published_at >= ?1 AND (?2 IS NULL OR platform = ?2)
             AND (${columns.map((column) => `${column} IS NOT NULL`).join(' OR ')})
           LIMIT 2000`
        )
        .bind(publishedFrom, platform ?? null)
        .all<Record<string, number | string | null>>();
      return rows.results.map((row) => ({
        id: String(row['id']),
        platform: row['platform'] as ContentPlatform,
        title: String(row['title'] ?? ''),
        publishedAt: Number(row['published_at'] ?? 0),
        views: Object.fromEntries(
          CHECKPOINT_HOURS.map((hours) => [hours, (row[`v${hours}h`] as number | null) ?? null])
        ) as CheckpointRow['views'],
        contaminated: row['contaminated'] === 1
      }));
    },

    async readReport({ publishedFrom, fromDay, limit }) {
      const [items, followers, growth] = await db.batch([
        db
          .prepare(
            `SELECT ${ITEM_COLUMNS} FROM content_items WHERE published_at >= ?
             ORDER BY published_at DESC, id DESC LIMIT ?`
          )
          .bind(publishedFrom, limit),
        db
          .prepare(
            `SELECT platform, day, followers FROM content_audience_days
             WHERE platform IN ('telegram', 'youtube', 'tiktok') AND day >= ? ORDER BY platform, day`
          )
          .bind(fromDay),
        // One day before the window is read too, so the first day has a previous reading to subtract. The
        // index is pinned: without table statistics SQLite would scan every snapshot ever stored.
        db
          .prepare(
            `WITH daily AS (
               SELECT s.item_id, i.platform, date(i.published_at / 1000, 'unixepoch') AS published_day,
                      date(s.observed_at / 1000, 'unixepoch') AS day, MAX(s.views) AS views
               FROM content_item_snapshots AS s INDEXED BY content_item_snapshots_observed_idx
               JOIN content_items AS i ON i.id = s.item_id
               WHERE s.observed_at >= ?1 AND s.views IS NOT NULL
               GROUP BY s.item_id, day
             ), deltas AS (
               SELECT platform, day,
                      CASE
                        WHEN LAG(day) OVER w IS NULL THEN CASE WHEN published_day = day THEN views END
                        -- Only consecutive days: an old item read weekly would put a week of views on one day.
                        WHEN julianday(day) - julianday(LAG(day) OVER w) = 1 THEN views - LAG(views) OVER w
                      END AS delta
               FROM daily
               WINDOW w AS (PARTITION BY item_id ORDER BY day)
             )
             SELECT platform, day, SUM(MAX(delta, 0)) AS views FROM deltas
             WHERE delta IS NOT NULL AND day >= ?2
             GROUP BY platform, day ORDER BY day LIMIT 600`
          )
          .bind(publishedFrom - 24 * HOUR_MS, fromDay)
      ]);
      return {
        items: ((items?.results ?? []) as RawItem[]).map(toItem),
        followers: (followers?.results ?? []) as OverviewRows['followers'],
        growth: (growth?.results ?? []) as { platform: ContentPlatform; day: string; views: number }[]
      };
    },

    async readReportCache(days) {
      const [version, cached] = await db.batch([
        db.prepare(
          // The set of contaminated items shapes the curves, so it is part of the version; a count or a time
          // would repeat after a mark is cleared. Marks are rare owner confirmations, so the list stays short.
          `SELECT IFNULL(group_concat(platform || ':' || IFNULL(last_success_at, ''), ','), '') || '|' || IFNULL(
               (SELECT group_concat(item_id, ',') FROM (SELECT item_id FROM content_item_contamination ORDER BY item_id)),
               ''
             ) AS version
           FROM (SELECT platform, last_success_at FROM content_sources ORDER BY platform)`
        ),
        db.prepare('SELECT version, built_at AS builtAt, report FROM content_report_cache WHERE days = ?').bind(days)
      ]);
      return {
        version: (version?.results as { version: string | null }[] | undefined)?.[0]?.version ?? '',
        cached: (cached?.results as CachedReport[] | undefined)?.[0] ?? null
      };
    },

    async storeReportCache({ days, version, builtAt, report }) {
      await db
        .prepare(
          `INSERT INTO content_report_cache (days, version, built_at, report) VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT (days) DO UPDATE SET version = excluded.version, built_at = excluded.built_at,
             report = excluded.report`
        )
        .bind(days, version, builtAt, report)
        .run();
    },

    async contaminatedAmong(ids) {
      if (ids.length === 0) return new Set();
      const rows = await db
        .prepare(
          `SELECT item_id AS id FROM content_item_contamination
           WHERE item_id IN (SELECT value FROM json_each(?1)) LIMIT 100`
        )
        .bind(JSON.stringify(ids.slice(0, 100)))
        .all<{ id: string }>();
      return new Set(rows.results.map((row) => row.id));
    },

    async readItem(id) {
      const [item, snapshots, mark, contamination] = await db.batch([
        db.prepare(`SELECT ${ITEM_COLUMNS} FROM content_items WHERE id = ?`).bind(id),

        // The newest snapshots, returned oldest first.
        db
          .prepare(
            `SELECT observedAt, views, likes, comments, shares FROM (
               SELECT observed_at AS observedAt, views, likes, comments, shares FROM content_item_snapshots
               WHERE item_id = ? ORDER BY observed_at DESC LIMIT ?
             ) ORDER BY observedAt`
          )
          .bind(id, CONTENT_ITEM_SNAPSHOT_LIMIT),
        db.prepare('SELECT format FROM content_item_formats WHERE item_id = ?').bind(id),
        db.prepare('SELECT reason, set_at AS setAt FROM content_item_contamination WHERE item_id = ?').bind(id)
      ]);
      const row = (item?.results as RawItem[] | undefined)?.[0];
      if (row === undefined) return null;
      return {
        item: toItem(row),
        snapshots: (snapshots?.results ?? []) as SnapshotRow[],
        ownerFormat: (mark?.results as { format: VideoFormat }[] | undefined)?.[0]?.format ?? null,
        contamination: (contamination?.results as Contamination[] | undefined)?.[0] ?? null
      };
    },

    async videoIdsPublished({ from, to, limit }) {
      const rows = await db
        .prepare(
          `SELECT id FROM content_items WHERE platform IN ('youtube', 'tiktok') AND published_at >= ?1 AND published_at <= ?2
           ORDER BY published_at DESC, id DESC LIMIT ?3`
        )
        .bind(from, to, limit)
        .all<{ id: string }>();
      return rows.results.map((row) => row.id);
    },

    async itemsMarked(format) {
      const rows = await db
        .prepare('SELECT item_id AS id FROM content_item_formats WHERE format = ? LIMIT 500')
        .bind(format)
        .all<{ id: string }>();
      return rows.results.map((row) => row.id);
    },

    async markFormat({ id, format, now }) {
      await db
        .prepare(
          format === null
            ? 'DELETE FROM content_item_formats WHERE item_id = ?1'
            : `INSERT INTO content_item_formats (item_id, format, set_at) VALUES (?1, ?2, ?3)
               ON CONFLICT (item_id) DO UPDATE SET format = excluded.format, set_at = excluded.set_at`
        )
        .bind(...(format === null ? [id] : [id, format, now]))
        .run();
    },

    async markContamination({ id, reason, now }) {
      await db
        .prepare(
          reason === null
            ? 'DELETE FROM content_item_contamination WHERE item_id = ?1'
            : `INSERT INTO content_item_contamination (item_id, reason, set_at) VALUES (?1, ?2, ?3)
               ON CONFLICT (item_id) DO UPDATE SET reason = excluded.reason, set_at = excluded.set_at`
        )
        .bind(...(reason === null ? [id] : [id, reason, now]))
        .run();
    }
  };
}
