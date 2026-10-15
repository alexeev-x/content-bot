import {
  CONTENT_ANALYTICS_RECENT_LIMIT,
  CONTENT_ANALYTICS_TOP_LIMIT,
  CONTENT_ITEM_SNAPSHOT_LIMIT
} from '@alexeev/contracts';
import type { CollectedItem, ContentPlatform } from './types';

const HOUR_MS = 60 * 60 * 1000;
/** Items younger than this get an hourly snapshot; older ones a daily one. */
export const EARLY_WINDOW_MS = 72 * HOUR_MS;
// Guards below one period, so a tick that runs a few minutes early still records its snapshot.
const HOURLY_GUARD_MS = 50 * 60 * 1000;
const DAILY_GUARD_MS = 23 * HOUR_MS;
/** Items older than this change little: one snapshot a week keeps the history bounded. */
const LATE_WINDOW_MS = 30 * 24 * HOUR_MS;
const WEEKLY_GUARD_MS = 7 * 24 * HOUR_MS - HOUR_MS;

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
  observedAt: number;
}

export interface SnapshotRow {
  observedAt: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
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
  readItem(id: string): Promise<{ item: ItemRow; snapshots: SnapshotRow[] } | null>;
  readReport(input: { publishedFrom: number; fromDay: string; limit: number }): Promise<{
    items: ItemRow[];
    followers: OverviewRows['followers'];
  }>;
}

const ITEM_COLUMNS =
  'id, platform, title, url, thumbnail_url, published_at, views, likes, comments, shares, observed_at';

interface RawItem {
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

function toItem(row: RawItem): ItemRow {
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
          shares: item.shares
        }))
      );
      const statements = [
        db
          .prepare(
            `INSERT INTO content_items (${ITEM_COLUMNS})
             SELECT j.value ->> 'id', ?2, j.value ->> 'title', j.value ->> 'url', j.value ->> 'thumb',
                    j.value ->> 'published', j.value ->> 'views', j.value ->> 'likes', j.value ->> 'comments',
                    j.value ->> 'shares', ?3
             FROM json_each(?1) AS j WHERE true
             ON CONFLICT (id) DO UPDATE SET
               title = excluded.title, url = excluded.url, thumbnail_url = excluded.thumbnail_url,
               published_at = excluded.published_at, views = excluded.views, likes = excluded.likes,
               comments = excluded.comments, shares = excluded.shares, observed_at = excluded.observed_at`
          )
          .bind(json, platform, now),
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
          .bind(json, now, EARLY_WINDOW_MS, HOURLY_GUARD_MS, DAILY_GUARD_MS, LATE_WINDOW_MS, WEEKLY_GUARD_MS),
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

    async readReport({ publishedFrom, fromDay, limit }) {
      const [items, followers] = await db.batch([
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
          .bind(fromDay)
      ]);
      return {
        items: ((items?.results ?? []) as RawItem[]).map(toItem),
        followers: (followers?.results ?? []) as OverviewRows['followers']
      };
    },

    async readItem(id) {
      const [item, snapshots] = await db.batch([
        db.prepare(`SELECT ${ITEM_COLUMNS} FROM content_items WHERE id = ?`).bind(id),
        // The newest snapshots, returned oldest first.
        db
          .prepare(
            `SELECT observedAt, views, likes, comments, shares FROM (
               SELECT observed_at AS observedAt, views, likes, comments, shares FROM content_item_snapshots
               WHERE item_id = ? ORDER BY observed_at DESC LIMIT ?
             ) ORDER BY observedAt`
          )
          .bind(id, CONTENT_ITEM_SNAPSHOT_LIMIT)
      ]);
      const row = (item?.results as RawItem[] | undefined)?.[0];
      if (row === undefined) return null;
      return { item: toItem(row), snapshots: (snapshots?.results ?? []) as SnapshotRow[] };
    }
  };
}
