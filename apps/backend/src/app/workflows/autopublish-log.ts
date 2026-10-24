import {
  type AutopublishActivityItemDto,
  type AutopublishHeldReason,
  type AutopublishSource,
  autopublishHeldReasonSchema
} from '@alexeev/contracts';
import type { Logger } from '../../platform/logging/logger';

// What the automatic publishing did (migration 0111; owner, 24.10.2026): one row per outcome, shown in the studio's
// «Автопубликация». Written after the outcome is decided and never in its way: a failed write is only logged.

const KEPT_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SHOWN = 50;

export interface AutopublishEntry {
  source: AutopublishSource;
  title: string;
  outcome: 'published' | 'held';
  reason?: AutopublishHeldReason;
  postId?: string | null;
}

export interface AutopublishLogStore {
  insert(entry: AutopublishEntry, id: string, now: number): Promise<void>;
  /** The last 24 hours, newest first. */
  list(now: number): Promise<AutopublishActivityItemDto[]>;
}

/** Records an outcome; never throws. */
export async function recordAutopublish(
  container: { autopublishLog: AutopublishLogStore; clock: { now(): number }; newId: () => string; logger: Logger },
  entry: AutopublishEntry
): Promise<void> {
  try {
    await container.autopublishLog.insert(entry, container.newId(), container.clock.now());
  } catch (error) {
    container.logger.warn({
      component: 'autopublish',
      operation: 'log',
      errorCode: error instanceof Error ? error.name : 'unknown'
    });
  }
}

export function createD1AutopublishLog(db: D1Database): AutopublishLogStore {
  return {
    async insert(entry, id, now) {
      await db.batch([
        db
          .prepare(
            `INSERT INTO autopublish_log (id, at, source, title, outcome, reason, post_id)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
          )
          .bind(
            id,
            now,
            entry.source,
            entry.title.slice(0, 300),
            entry.outcome,
            entry.outcome === 'held' ? (entry.reason ?? 'failed') : null,
            entry.postId ?? null
          ),
        db.prepare('DELETE FROM autopublish_log WHERE at < ?1').bind(now - KEPT_MS)
      ]);
    },
    async list(now) {
      const rows = await db
        .prepare(
          `SELECT id, at, source, title, outcome, reason, post_id FROM autopublish_log
       WHERE at >= ?1 ORDER BY at DESC, id LIMIT ?2`
        )
        .bind(now - DAY_MS, SHOWN)
        .all<{
          id: string;
          at: number;
          source: AutopublishSource;
          title: string;
          outcome: 'published' | 'held';
          reason: string | null;
          post_id: string | null;
        }>();
      return rows.results.map((row) => ({
        id: row.id,
        at: new Date(row.at).toISOString(),
        source: row.source,
        title: row.title,
        outcome: row.outcome,
        reason:
          row.outcome === 'published' ? null : (autopublishHeldReasonSchema.safeParse(row.reason).data ?? 'failed'),
        postId: row.post_id
      }));
    }
  };
}
