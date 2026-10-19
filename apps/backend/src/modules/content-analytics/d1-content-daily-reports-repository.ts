// The daily reports with their stored numbers and the AI review (migration 0077). The report row is the day's
// claim: one insert wins, whatever the Cron overlap; the review job and the fallback finish it once.

export type DailyReportStatus = 'waiting' | 'reviewed' | 'unreviewed';

export interface DailyReportRow {
  id: string;
  asOf: number;
  timezone: string;
  /** JSON written by `raiseDailyReport`: the table, its forecasts and the accuracy shown. */
  data: string;
  status: DailyReportStatus;
  review: string | null;
  reviewError: string | null;
  model: string | null;
  /** The ai_usage row of the review (migration 0080). */
  usageId: string | null;
  createdAt: number;
}

export interface ContentDailyReportRepository {
  /** Stores today's numbers once; false when the report of that id exists already. */
  claim(input: { id: string; asOf: number; timezone: string; data: string; now: number }): Promise<boolean>;
  find(id: string): Promise<DailyReportRow | null>;
  /** Ends a waiting report once, with or without the review; false when it was ended before. */
  finish(input: {
    id: string;
    status: 'reviewed' | 'unreviewed';
    review: string | null;
    reviewError: string | null;
    model: string | null;
    usageId?: string | null;
    now: number;
  }): Promise<boolean>;
  /** Reports still waiting for their review since before `before`, oldest first. */
  listWaiting(before: number, limit: number): Promise<DailyReportRow[]>;
  /** Released reports newest first, after the keyset `after` (as_of, id), at most `limit` (≤ 50). */
  listReleased(input: { after: { asOf: number; id: string } | null; limit: number }): Promise<DailyReportRow[]>;
}

const COLUMNS =
  'id, as_of AS asOf, timezone, data, status, review, review_error AS reviewError, model, usage_id AS usageId, created_at AS createdAt';

export function createD1ContentDailyReportRepository(db: D1Database): ContentDailyReportRepository {
  return {
    async claim({ id, asOf, timezone, data, now }) {
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO content_daily_reports (id, as_of, timezone, data, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?5)`
        )
        .bind(id, asOf, timezone, data, now)
        .run();
      return result.meta.changes === 1;
    },

    async find(id) {
      return db.prepare(`SELECT ${COLUMNS} FROM content_daily_reports WHERE id = ?`).bind(id).first<DailyReportRow>();
    },

    async finish({ id, status, review, reviewError, model, usageId, now }) {
      const result = await db
        .prepare(
          `UPDATE content_daily_reports
           SET status = ?2, review = ?3, review_error = ?4, model = ?5, updated_at = ?6, usage_id = ?7
           WHERE id = ?1 AND status = 'waiting'`
        )
        .bind(id, status, review, reviewError, model, now, usageId ?? null)
        .run();
      return result.meta.changes === 1;
    },

    async listReleased({ after, limit }) {
      const rows = await db
        .prepare(
          `SELECT ${COLUMNS} FROM content_daily_reports
           WHERE status <> 'waiting' AND (?1 IS NULL OR as_of < ?1 OR (as_of = ?1 AND id < ?2))
           ORDER BY as_of DESC, id DESC LIMIT ?3`
        )
        .bind(after?.asOf ?? null, after?.id ?? '', Math.min(limit, 50))
        .all<DailyReportRow>();
      return rows.results;
    },

    async listWaiting(before, limit) {
      const rows = await db
        .prepare(
          `SELECT ${COLUMNS} FROM content_daily_reports WHERE status = 'waiting' AND created_at < ?
           ORDER BY created_at LIMIT ?`
        )
        .bind(before, Math.min(limit, 5))
        .all<DailyReportRow>();
      return rows.results;
    }
  };
}
