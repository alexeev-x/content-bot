import type { ForecastHorizon } from './forecast';

// The daily report's forecasts and their scores (migration 0076). D1 holds them; the report text never does.

export interface NewForecastRow {
  reportId: string;
  itemId: string;
  method: string;
  origin: number;
  hours: ForecastHorizon;
  targetAt: number;
  expected: number;
  low: number;
  high: number;
}

export interface DueForecast {
  id: string;
  itemId: string;
  hours: ForecastHorizon;
  targetAt: number;
  low: number;
  high: number;
}

export interface StoredForecast {
  itemId: string;
  method: string;
  origin: number;
  hours: ForecastHorizon;
  targetAt: number;
  expected: number;
  low: number;
  high: number;
  fact: number | null;
  outcome: ForecastOutcome | null;
}

export type ForecastOutcome = 'in_band' | 'below' | 'above' | 'no_fact';

export interface ContentForecastRepository {
  /** Stores a report's forecasts once; a repeated report id adds nothing. */
  insert(rows: readonly NewForecastRow[], now: number): Promise<void>;
  /** Unscored forecasts whose horizon passed before `before`, oldest first, at most `limit`. */
  listDue(before: number, limit: number): Promise<DueForecast[]>;
  /** Scores each forecast once: a second scorer of the same forecast changes nothing. */
  score(rows: readonly { id: string; fact: number | null; outcome: ForecastOutcome }[], now: number): Promise<void>;
  /** One report's forecasts (at most 36), by video then horizon. */
  ofReport(reportId: string): Promise<StoredForecast[]>;
  /** Forecasts scored since `since` with a fact: how many, and how many had it inside their band. */
  accuracy(since: number): Promise<{ scored: number; inBand: number }>;
  /**
   * Scores since `since` counted per horizon and outcome; the unscored ones past their horizon at `now`; the earliest
   * horizon still ahead.
   */
  scoreboard(
    since: number,
    now: number
  ): Promise<{ counts: ForecastCount[]; waiting: number; nextTargetAt: number | null }>;
}

export interface ForecastCount {
  hours: ForecastHorizon;
  outcome: ForecastOutcome;
  count: number;
}

/** At most this many rows per statement: 12 videos × 3 horizons. */
const INSERT_LIMIT = 36;

export function createD1ContentForecastRepository(db: D1Database): ContentForecastRepository {
  return {
    async insert(rows, now) {
      const bounded = rows.slice(0, INSERT_LIMIT);
      if (bounded.length === 0) return;
      // One statement for all rows: the Cron tick's budget counts every statement of a batch.
      await db
        .prepare(
          `INSERT OR IGNORE INTO content_forecasts
             (id, report_id, item_id, method, origin, horizon_hours, target_at, expected, low, high, created_at)
           SELECT (value ->> 'reportId') || '|' || (value ->> 'itemId') || '|' || (value ->> 'hours'),
                  value ->> 'reportId', value ->> 'itemId', value ->> 'method', value ->> 'origin', value ->> 'hours',
                  value ->> 'targetAt', value ->> 'expected', value ->> 'low', value ->> 'high', ?2
           FROM json_each(?1)`
        )
        .bind(JSON.stringify(bounded), now)
        .run();
    },

    async listDue(before, limit) {
      const rows = await db
        .prepare(
          `SELECT id, item_id AS itemId, horizon_hours AS hours, target_at AS targetAt, low, high
           FROM content_forecasts WHERE scored_at IS NULL AND target_at <= ? ORDER BY target_at LIMIT ?`
        )
        .bind(before, Math.min(limit, INSERT_LIMIT))
        .all<DueForecast>();
      return rows.results;
    },

    async score(rows, now) {
      const bounded = rows.slice(0, INSERT_LIMIT);
      if (bounded.length === 0) return;
      // One statement; `scored_at IS NULL` keeps a second scorer from changing a scored row.
      await db
        .prepare(
          `UPDATE content_forecasts
           SET fact = (SELECT value ->> 'fact' FROM json_each(?1) WHERE value ->> 'id' = content_forecasts.id),
               outcome = (SELECT value ->> 'outcome' FROM json_each(?1) WHERE value ->> 'id' = content_forecasts.id),
               scored_at = ?2
           WHERE scored_at IS NULL AND id IN (SELECT value ->> 'id' FROM json_each(?1))`
        )
        .bind(JSON.stringify(bounded), now)
        .run();
    },

    async ofReport(reportId) {
      const rows = await db
        .prepare(
          `SELECT item_id AS itemId, method, origin, horizon_hours AS hours, target_at AS targetAt, expected, low, high,
                  fact, outcome
           FROM content_forecasts WHERE report_id = ? ORDER BY item_id, horizon_hours LIMIT ${INSERT_LIMIT}`
        )
        .bind(reportId)
        .all<StoredForecast>();
      return rows.results;
    },

    async accuracy(since) {
      const row = await db
        .prepare(
          `SELECT COUNT(*) AS scored, COALESCE(SUM(outcome = 'in_band'), 0) AS inBand FROM content_forecasts
           WHERE scored_at >= ? AND outcome IN ('in_band', 'below', 'above')`
        )
        .bind(since)
        .first<{ scored: number; inBand: number }>();
      return { scored: row?.scored ?? 0, inBand: row?.inBand ?? 0 };
    },

    async scoreboard(since, now) {
      const [counts, waiting, next] = await db.batch([
        db
          .prepare(
            `SELECT horizon_hours AS hours, outcome, COUNT(*) AS count FROM content_forecasts
             WHERE scored_at >= ? AND outcome IS NOT NULL GROUP BY horizon_hours, outcome`
          )
          .bind(since),
        db.prepare('SELECT COUNT(*) AS n FROM content_forecasts WHERE scored_at IS NULL AND target_at <= ?').bind(now),
        db
          .prepare('SELECT MIN(target_at) AS at FROM content_forecasts WHERE scored_at IS NULL AND target_at > ?')
          .bind(now)
      ]);
      return {
        counts: (counts?.results ?? []) as ForecastCount[],
        waiting: ((waiting?.results[0] ?? { n: 0 }) as { n: number }).n,
        nextTargetAt: ((next?.results[0] ?? { at: null }) as { at: number | null }).at
      };
    }
  };
}
