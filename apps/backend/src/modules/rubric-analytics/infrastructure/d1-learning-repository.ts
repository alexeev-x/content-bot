import type { LearningLogRow, LearningRepository } from '../application/ports';

// D1 for the learning (migration 0122): the singleton state and the log, one row per Monday, kind and subject.

interface LogDbRow {
  week_key: string;
  kind: 'rest' | 'hour';
  subject: string;
  from_value: number;
  to_value: number;
  applied: number;
  outcome: LearningLogRow['outcome'];
  reason: string;
  created_at: number;
}

export function createD1LearningRepository(db: D1Database): LearningRepository {
  return {
    async state() {
      const row = await db
        .prepare('SELECT started_at, apply_enabled FROM rubric_learning_state WHERE id = 1')
        .first<{ started_at: number | null; apply_enabled: number }>();
      return { startedAt: row?.started_at ?? null, applyEnabled: (row?.apply_enabled ?? 1) === 1 };
    },
    async start(at, now) {
      await db
        .prepare('UPDATE rubric_learning_state SET started_at = ?, updated_at = ? WHERE id = 1 AND started_at IS NULL')
        .bind(at, now)
        .run();
    },
    async setApply(enabled, now) {
      const result = await db
        .prepare(
          'UPDATE rubric_learning_state SET apply_enabled = ?, updated_at = ? WHERE id = 1 AND apply_enabled <> ?'
        )
        .bind(enabled ? 1 : 0, now, enabled ? 1 : 0)
        .run();
      return (result.meta.changes ?? 0) === 1;
    },
    async claim(row) {
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO rubric_learning_log (id, week_key, kind, subject, from_value, to_value, applied, outcome,
             reason, numbers_json, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, 'advised', ?, ?, ?)`
        )
        .bind(
          row.id,
          row.weekKey,
          row.kind,
          row.subject,
          row.from,
          row.to,
          row.reason,
          JSON.stringify(row.numbers),
          row.createdAt
        )
        .run();
      return (result.meta.changes ?? 0) === 1;
    },
    async settle(weekKey, kind, subject, outcome) {
      await db
        .prepare(
          `UPDATE rubric_learning_log SET outcome = ?, applied = ? WHERE week_key = ? AND kind = ? AND subject = ?
             AND outcome = 'advised'`
        )
        .bind(outcome, outcome === 'applied' ? 1 : 0, weekKey, kind, subject)
        .run();
    },
    async history(kind, limit) {
      const { results } = await db
        .prepare(
          `SELECT week_key, kind, subject, from_value, to_value, applied, outcome, reason, created_at
             FROM rubric_learning_log WHERE kind = ? ORDER BY created_at DESC LIMIT ?`
        )
        .bind(kind, limit)
        .all<LogDbRow>();
      return results.map((row) => ({
        weekKey: row.week_key,
        kind: row.kind,
        subject: row.subject,
        from: row.from_value,
        to: row.to_value,
        applied: row.applied === 1,
        outcome: row.outcome,
        reason: row.reason,
        createdAt: row.created_at
      }));
    },
    async firstScoredAt() {
      const row = await db
        .prepare('SELECT MIN(scored_at) AS first FROM rubric_post_scores')
        .first<{ first: number | null }>();
      return row?.first ?? null;
    }
  };
}
