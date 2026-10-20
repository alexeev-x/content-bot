import {
  CHECKPOINT_HOURS,
  type CheckpointRow,
  checkpointSelect,
  ITEM_COLUMNS,
  type ItemRow,
  type RawItem,
  type SourceRow,
  toItem
} from './d1-content-analytics-repository';
import type { ContentPlatform } from './types';

/** A studio link, or a bot action the owner's tap performs (`callbackData`, see contamination-callback.ts). */
export type AlertButton = { text: string; linkPath: string } | { text: string; callbackData: string };

export type ContentAlertKind = 'item' | 'source' | 'digest';
export type ContentAlertStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'unknown';

/** An alert as raised: `id` is its dedup key (see migrations/0047_content_alerts.sql). */
export interface NewContentAlert {
  id: string;
  kind: ContentAlertKind;
  /** Plain text, kept for logs and the alerts raised before migration 0049. */
  title: string;
  body: string;
  /** The Telegram HTML that is sent; null only for alerts raised before migration 0049. */
  html: string | null;
  /** Buttons above the main one, each to one publication in the studio (at most six). */
  buttons: AlertButton[];
  /** Studio path the alert's button opens, e.g. `/analytics?id=…`. */
  linkPath: string;
}

export interface ContentAlert extends NewContentAlert {
  createdAt: number;
}

export interface ContentAlertRepository {
  /** The items published since `itemsFrom` (newest first, bounded) and every source's last outcome. */
  readRecent(input: { itemsFrom: number; limit: number }): Promise<{ items: ItemRow[]; sources: SourceRow[] }>;
  /** Checkpoint views of the items published since `publishedFrom` that have any. */
  readCheckpoints(publishedFrom: number): Promise<CheckpointRow[]>;
  readFollowers(fromDay: string): Promise<{ platform: ContentPlatform; day: string; followers: number }[]>;
  /** View snapshots of these items (at most 50) since `from`, oldest first. */
  readSnapshots(
    itemIds: readonly string[],
    from: number
  ): Promise<{ itemId: string; observedAt: number; views: number }[]>;
  /** Which of these ids (at most 90) are raised already. */
  existing(ids: readonly string[]): Promise<Set<string>>;
  /** Inserts the alerts not raised before; returns how many are new. */
  insert(alerts: readonly NewContentAlert[], now: number): Promise<number>;
  listPending(limit: number): Promise<ContentAlert[]>;
  /** pending → sending; true only for the caller that won. */
  claim(id: string, now: number): Promise<boolean>;
  finish(input: { id: string; now: number; status: 'sent' | 'failed' | 'unknown'; errorCode?: string }): Promise<void>;
  /** A send that started before `startedBefore` and never finished may have reached Telegram: `unknown`. */
  markStuckUnknown(input: { startedBefore: number; now: number }): Promise<number>;
}

interface RawAlert {
  id: string;
  kind: ContentAlertKind;
  title: string;
  body: string;
  html: string | null;
  buttons: string | null;
  link_path: string;
  created_at: number;
}

// Written by this module only; a row that does not parse loses its extra buttons, never the alert.
function parseButtons(raw: string | null): AlertButton[] {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((entry): entry is AlertButton => {
        if (typeof entry !== 'object' || entry === null) return false;
        const button = entry as Record<string, unknown>;
        return (
          typeof button['text'] === 'string' &&
          (typeof button['linkPath'] === 'string' || typeof button['callbackData'] === 'string')
        );
      })
      .slice(0, 6);
  } catch {
    return [];
  }
}

export function createD1ContentAlertRepository(db: D1Database): ContentAlertRepository {
  return {
    async readRecent({ itemsFrom, limit }) {
      const [items, sources] = await db.batch([
        db
          .prepare(
            `SELECT ${ITEM_COLUMNS} FROM content_items WHERE published_at >= ?
             ORDER BY published_at DESC, id DESC LIMIT ?`
          )
          .bind(itemsFrom, limit),
        db.prepare(
          `SELECT platform, next_run_at AS nextRunAt, last_success_at AS lastSuccessAt, last_error_at AS lastErrorAt,
                  last_error_code AS lastErrorCode
           FROM content_sources`
        )
      ]);
      return {
        items: ((items?.results ?? []) as RawItem[]).map(toItem),
        sources: (sources?.results ?? []) as SourceRow[]
      };
    },

    async readCheckpoints(publishedFrom) {
      const columns = CHECKPOINT_HOURS.map((hours) => `v${hours}h`);
      const rows = await db
        .prepare(
          `${checkpointSelect(columns)}
           WHERE published_at >= ?1 AND (${columns.map((column) => `${column} IS NOT NULL`).join(' OR ')})
           LIMIT 2000`
        )
        .bind(publishedFrom)
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

    async readFollowers(fromDay) {
      const rows = await db
        .prepare(
          `SELECT platform, day, followers FROM content_audience_days
           WHERE platform IN ('telegram', 'youtube', 'tiktok') AND day >= ? ORDER BY platform, day`
        )
        .bind(fromDay)
        .all<{ platform: ContentPlatform; day: string; followers: number }>();
      return rows.results;
    },

    async readSnapshots(itemIds, from) {
      if (itemIds.length === 0) return [];
      const rows = await db
        .prepare(
          `SELECT item_id AS itemId, observed_at AS observedAt, views FROM content_item_snapshots
           WHERE item_id IN (SELECT value FROM json_each(?1)) AND observed_at >= ?2 AND views IS NOT NULL
           ORDER BY item_id, observed_at LIMIT 2000`
        )
        .bind(JSON.stringify(itemIds.slice(0, 50)), from)
        .all<{ itemId: string; observedAt: number; views: number }>();
      return rows.results;
    },

    async existing(ids) {
      // Bounded below D1's 100 bound parameters; an id past the bound is deduped by INSERT OR IGNORE.
      const bounded = ids.slice(0, 90);
      if (bounded.length === 0) return new Set();
      const rows = await db
        .prepare(`SELECT id FROM content_alerts WHERE id IN (${bounded.map(() => '?').join(', ')})`)
        .bind(...bounded)
        .all<{ id: string }>();
      return new Set(rows.results.map((row) => row.id));
    },

    async insert(alerts, now) {
      if (alerts.length === 0) return 0;
      const results = await db.batch(
        alerts.map((alert) =>
          db
            .prepare(
              `INSERT OR IGNORE INTO content_alerts (id, kind, status, title, body, html, buttons, link_path, created_at, updated_at)
               VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              alert.id,
              alert.kind,
              alert.title,
              alert.body,
              alert.html,
              alert.buttons.length === 0 ? null : JSON.stringify(alert.buttons),
              alert.linkPath,
              now,
              now
            )
        )
      );
      return results.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0);
    },

    async listPending(limit) {
      const rows = await db
        .prepare(
          `SELECT id, kind, title, body, html, buttons, link_path, created_at FROM content_alerts
           WHERE status = 'pending' ORDER BY created_at, id LIMIT ?`
        )
        .bind(limit)
        .all<RawAlert>();
      return rows.results.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        html: row.html,
        buttons: parseButtons(row.buttons),
        linkPath: row.link_path,
        createdAt: row.created_at
      }));
    },

    async claim(id, now) {
      const result = await db
        .prepare(
          `UPDATE content_alerts SET status = 'sending', send_started_at = ?2, updated_at = ?2
           WHERE id = ?1 AND status = 'pending'`
        )
        .bind(id, now)
        .run();
      return result.meta.changes === 1;
    },

    async finish({ id, now, status, errorCode }) {
      await db
        .prepare(
          `UPDATE content_alerts SET status = ?2, error_code = ?3, updated_at = ?4
           WHERE id = ?1 AND status = 'sending'`
        )
        .bind(id, status, errorCode ?? null, now)
        .run();
    },

    async markStuckUnknown({ startedBefore, now }) {
      const result = await db
        .prepare(
          `UPDATE content_alerts SET status = 'unknown', error_code = 'WORKER_INTERRUPTED', updated_at = ?2
           WHERE status = 'sending' AND send_started_at < ?1`
        )
        .bind(startedBefore, now)
        .run();
      return result.meta.changes ?? 0;
    }
  };
}
