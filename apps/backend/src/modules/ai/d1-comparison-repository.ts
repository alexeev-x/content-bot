// The provider comparison (migration 0093, docs/ai/claude-provider.md §3): each row is one task written by two models.

export interface ComparisonRow {
  id: string;
  label: string;
  task: string;
  aModel: string;
  bModel: string;
  status: 'writing' | 'ready' | 'failed';
  aGenerationId: string | null;
  bGenerationId: string | null;
  choice: 'a' | 'b' | 'same' | null;
  note: string | null;
  createdAt: number;
}

export interface ComparisonRepository {
  create(
    rows: readonly { id: string; label: string; task: string; aModel: string; bModel: string; now: number }[]
  ): Promise<void>;
  find(id: string): Promise<ComparisonRow | null>;
  /** The latest rows, newest first (at most 30). */
  list(): Promise<ComparisonRow[]>;
  /** Both versions written (or one failed); only a row still writing changes. */
  finish(input: {
    id: string;
    status: 'ready' | 'failed';
    aGenerationId: string | null;
    bGenerationId: string | null;
  }): Promise<void>;
  /** The latest distinct tasks of automatic drafts (events and series posts), newest first. */
  automaticTasks(limit: number): Promise<string[]>;
  /** The owner's verdict; a later one replaces it. False when the row is not ready. */
  choose(input: { id: string; choice: 'a' | 'b' | 'same'; note: string | null; now: number }): Promise<boolean>;
}

interface Row {
  id: string;
  label: string;
  task: string;
  a_model: string;
  b_model: string;
  status: ComparisonRow['status'];
  a_generation_id: string | null;
  b_generation_id: string | null;
  choice: ComparisonRow['choice'];
  note: string | null;
  created_at: number;
}

const COLUMNS = 'id, label, task, a_model, b_model, status, a_generation_id, b_generation_id, choice, note, created_at';

const toRow = (row: Row): ComparisonRow => ({
  id: row.id,
  label: row.label,
  task: row.task,
  aModel: row.a_model,
  bModel: row.b_model,
  status: row.status,
  aGenerationId: row.a_generation_id,
  bGenerationId: row.b_generation_id,
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
              `INSERT INTO ai_comparisons (id, label, task, a_model, b_model, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
            )
            .bind(row.id, row.label.slice(0, 200), row.task.slice(0, 4000), row.aModel, row.bModel, row.now)
        )
      );
    },
    async find(id) {
      const row = await db.prepare(`SELECT ${COLUMNS} FROM ai_comparisons WHERE id = ?1`).bind(id).first<Row>();
      return row === null ? null : toRow(row);
    },
    async list() {
      const { results } = await db
        .prepare(`SELECT ${COLUMNS} FROM ai_comparisons ORDER BY created_at DESC, id LIMIT 30`)
        .all<Row>();
      return results.map(toRow);
    },
    async finish({ id, status, aGenerationId, bGenerationId }) {
      await db
        .prepare(
          `UPDATE ai_comparisons SET status = ?2, a_generation_id = ?3, b_generation_id = ?4
           WHERE id = ?1 AND status = 'writing'`
        )
        .bind(id, status, aGenerationId, bGenerationId)
        .run();
    },
    async automaticTasks(limit) {
      const { results } = await db
        .prepare(
          `SELECT task FROM ai_generations WHERE mode = 'automatic' AND kind = 'draft' AND source = 'bot'
           GROUP BY task ORDER BY MAX(created_at) DESC LIMIT ?1`
        )
        .bind(Math.min(limit, 20))
        .all<{ task: string }>();
      return results.map((row) => row.task);
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
