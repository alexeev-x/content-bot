// The provider comparison (migrations 0093–0096, docs/ai/claude-provider.md §3): each row is one task of the test set
// written by two models, in the writer format and mode of the task.

export type ComparisonFormat = 'fidit' | 'igrat' | 'standalone' | 'telegram';

export interface ComparisonTask {
  task: string;
  format: ComparisonFormat;
  mode: 'direct' | 'automatic';
}

/** One side's measurements: why it failed, what it cost and how long it took (shown after the reveal). */
export interface ComparisonSide {
  generationId: string | null;
  error: string | null;
  costMicro: number | null;
  ms: number | null;
}

export interface ComparisonRow extends ComparisonTask {
  id: string;
  code: string | null;
  position: number;
  afterId: string | null;
  label: string;
  aModel: string;
  bModel: string;
  status: 'writing' | 'ready' | 'failed';
  /** Why a failed pair was not written; null for older rows. */
  failure: 'budget' | 'error' | null;
  aGenerationId: string | null;
  bGenerationId: string | null;
  a: Omit<ComparisonSide, 'generationId'>;
  b: Omit<ComparisonSide, 'generationId'>;
  choice: 'a' | 'b' | 'same' | null;
  note: string | null;
  createdAt: number;
}

export interface ComparisonRepository {
  create(
    rows: readonly (ComparisonTask & {
      id: string;
      code: string;
      position: number;
      afterId: string | null;
      label: string;
      aModel: string;
      bModel: string;
      now: number;
    })[]
  ): Promise<void>;
  find(id: string): Promise<ComparisonRow | null>;
  /** The test set in its order (at most 30 rows). */
  list(): Promise<ComparisonRow[]>;
  /** The follow-up post written after this row, if any. */
  followUp(id: string): Promise<ComparisonRow | null>;
  /** Both versions written (or not); only a row still writing changes. */
  finish(input: {
    id: string;
    status: 'ready' | 'failed';
    failure: 'budget' | 'error' | null;
    a: ComparisonSide;
    b: ComparisonSide;
  }): Promise<void>;
  /** Removes every pair (owner, 21.10.2026: start the comparison over); a pair still writing finishes into nothing. */
  clear(): Promise<void>;
  /** The owner's verdict; a later one replaces it. False when the row is not ready. */
  choose(input: { id: string; choice: 'a' | 'b' | 'same'; note: string | null; now: number }): Promise<boolean>;
}

interface Row {
  id: string;
  code: string | null;
  position: number;
  after_id: string | null;
  label: string;
  task: string;
  format: ComparisonFormat;
  mode: 'direct' | 'automatic';
  a_model: string;
  b_model: string;
  status: ComparisonRow['status'];
  failure: ComparisonRow['failure'];
  a_generation_id: string | null;
  b_generation_id: string | null;
  a_error: string | null;
  b_error: string | null;
  a_cost_micro: number | null;
  b_cost_micro: number | null;
  a_ms: number | null;
  b_ms: number | null;
  choice: ComparisonRow['choice'];
  note: string | null;
  created_at: number;
}

const COLUMNS = `id, code, position, after_id, label, task, format, mode, a_model, b_model, status, failure,
  a_generation_id, b_generation_id, a_error, b_error, a_cost_micro, b_cost_micro, a_ms, b_ms, choice, note, created_at`;

const toRow = (row: Row): ComparisonRow => ({
  id: row.id,
  code: row.code,
  position: row.position,
  afterId: row.after_id,
  label: row.label,
  task: row.task,
  format: row.format,
  mode: row.mode,
  aModel: row.a_model,
  bModel: row.b_model,
  status: row.status,
  failure: row.failure,
  aGenerationId: row.a_generation_id,
  bGenerationId: row.b_generation_id,
  a: { error: row.a_error, costMicro: row.a_cost_micro, ms: row.a_ms },
  b: { error: row.b_error, costMicro: row.b_cost_micro, ms: row.b_ms },
  choice: row.choice,
  note: row.note,
  createdAt: row.created_at
});

export function createD1ComparisonRepository(db: D1Database): ComparisonRepository {
  return {
    async create(rows) {
      if (rows.length === 0) return;
      await db.batch(
        rows.map((row) =>
          db
            .prepare(
              `INSERT INTO ai_comparisons (id, code, position, after_id, label, task, format, mode, a_model, b_model,
                 created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
            )
            .bind(
              row.id,
              row.code,
              row.position,
              row.afterId,
              row.label.slice(0, 200),
              row.task.slice(0, 4000),
              row.format,
              row.mode,
              row.aModel,
              row.bModel,
              row.now
            )
        )
      );
    },
    async find(id) {
      const row = await db.prepare(`SELECT ${COLUMNS} FROM ai_comparisons WHERE id = ?1`).bind(id).first<Row>();
      return row === null ? null : toRow(row);
    },
    async list() {
      const { results } = await db
        .prepare(`SELECT ${COLUMNS} FROM ai_comparisons ORDER BY created_at DESC, position, id LIMIT 30`)
        .all<Row>();
      return results.map(toRow);
    },
    async followUp(id) {
      const row = await db
        .prepare(`SELECT ${COLUMNS} FROM ai_comparisons WHERE after_id = ?1 LIMIT 1`)
        .bind(id)
        .first<Row>();
      return row === null ? null : toRow(row);
    },
    async finish({ id, status, failure, a, b }) {
      await db
        .prepare(
          `UPDATE ai_comparisons SET status = ?2, failure = ?3, a_generation_id = ?4, b_generation_id = ?5,
             a_error = ?6, b_error = ?7, a_cost_micro = ?8, b_cost_micro = ?9, a_ms = ?10, b_ms = ?11
           WHERE id = ?1 AND status = 'writing'`
        )
        .bind(
          id,
          status,
          failure,
          a.generationId,
          b.generationId,
          a.error?.slice(0, 200) ?? null,
          b.error?.slice(0, 200) ?? null,
          a.costMicro,
          b.costMicro,
          a.ms,
          b.ms
        )
        .run();
    },
    async clear() {
      await db.prepare('DELETE FROM ai_comparisons').run();
    },
    async choose({ id, choice, note, now }) {
      const result = await db
        .prepare(`UPDATE ai_comparisons SET choice = ?2, note = ?3, chosen_at = ?4 WHERE id = ?1 AND status = 'ready'`)
        .bind(id, choice, note, now)
        .run();
      return result.meta.changes === 1;
    }
  };
}
