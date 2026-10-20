import { OPEN_LESSONS_MAX } from './d1-style-lessons-repository';
import type { WriterFormat } from './writer-types';

// The analyst's hypotheses H1, H2… (migration 0086; owner 20.10.2026): raised by the daily review, reviewed every
// Monday. Every change is conditional, so a repeated or overlapping job changes nothing twice.

export type HypothesisStatus = 'open' | 'supported' | 'refuted';
export type HypothesisKind = 'writing' | 'topic';
export type HypothesisConfidence = 'low' | 'medium';

export interface HypothesisRow {
  id: string;
  code: number;
  text: string;
  scope: WriterFormat;
  kind: HypothesisKind;
  status: HypothesisStatus;
  confidence: HypothesisConfidence;
  note: string | null;
  lessonId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Open hypotheses at most: the daily review raises no new one past it until Monday's review settles some. */
export const OPEN_HYPOTHESES_MAX = 12;
/** The hypotheses one Monday review weighs (open and supported, oldest first): one batch of updates. */
export const ACTIVE_HYPOTHESES_MAX = 16;

export interface HypothesesRepository {
  /**
   * Open hypotheses first, then supported ones, the longest unchanged first, at most `limit` (≤ ACTIVE_HYPOTHESES_MAX):
   * supported ones never crowd out the open ones (review 20.10.2026).
   */
  active(limit: number): Promise<HypothesisRow[]>;
  /** The studio's list: newest change first, at most `limit` (≤ 100). */
  recent(limit: number): Promise<HypothesisRow[]>;
  /** A new open hypothesis with the next code; null at OPEN_HYPOTHESES_MAX or when the same text exists (the caller
   * compares case-insensitively: SQLite's lower() leaves Cyrillic as it is). */
  create(input: {
    id: string;
    text: string;
    scope: WriterFormat;
    kind: HypothesisKind;
    confidence: HypothesisConfidence;
    sourceRef: string;
    now: number;
  }): Promise<number | null>;
  /** The Monday verdicts, in one batch; a refuted hypothesis is final. */
  review(
    updates: readonly {
      id: string;
      status: HypothesisStatus;
      confidence: HypothesisConfidence;
      note: string;
      sourceRef: string;
      now: number;
    }[]
  ): Promise<void>;
  /**
   * A supported writing hypothesis put to the owner as an asked style lesson (origin `analytics`), in one batch with
   * its link; false when it was put before or the open lessons are at their cap.
   */
  askAsLesson(input: { hypothesisId: string; lessonId: string; now: number }): Promise<boolean>;
}

const COLUMNS = `id, code, text, scope, kind, status, confidence, note, lesson_id AS lessonId, created_at AS createdAt,
  updated_at AS updatedAt`;

export function createD1HypothesesRepository(db: D1Database): HypothesesRepository {
  return {
    async active(limit) {
      const rows = await db
        .prepare(
          `SELECT ${COLUMNS} FROM ai_hypotheses WHERE status IN ('open', 'supported')
           ORDER BY status = 'supported', updated_at, code LIMIT ?`
        )
        .bind(Math.min(limit, ACTIVE_HYPOTHESES_MAX))
        .all<HypothesisRow>();
      return rows.results;
    },

    async recent(limit) {
      const rows = await db
        .prepare(`SELECT ${COLUMNS} FROM ai_hypotheses ORDER BY updated_at DESC, code DESC LIMIT ?`)
        .bind(Math.min(limit, 100))
        .all<HypothesisRow>();
      return rows.results;
    },

    async create({ id, text, scope, kind, confidence, sourceRef, now }) {
      try {
        const row = await db
          .prepare(
            `INSERT INTO ai_hypotheses (id, code, text, scope, kind, status, confidence, source_ref, created_at, updated_at)
             SELECT ?1, coalesce((SELECT max(code) FROM ai_hypotheses), 0) + 1, ?2, ?3, ?4, 'open', ?5, ?6, ?7, ?7
             WHERE (SELECT count(*) FROM ai_hypotheses WHERE status = 'open') < ?8
               AND NOT EXISTS (SELECT 1 FROM ai_hypotheses WHERE text = ?2)
             RETURNING code`
          )
          .bind(id, text, scope, kind, confidence, sourceRef, now, OPEN_HYPOTHESES_MAX)
          .first<{ code: number }>();
        return row?.code ?? null;
      } catch (error) {
        // Two runs took the same next code at once: the other one's hypothesis stands.
        if (error instanceof Error && /UNIQUE/i.test(error.message)) return null;
        throw error;
      }
    },

    async review(updates) {
      if (updates.length === 0) return;
      await db.batch(
        updates.slice(0, ACTIVE_HYPOTHESES_MAX).map((update) =>
          db
            .prepare(
              `UPDATE ai_hypotheses SET status = ?2, confidence = ?3, note = ?4, source_ref = ?5, updated_at = ?6
               WHERE id = ?1 AND status IN ('open', 'supported')`
            )
            .bind(update.id, update.status, update.confidence, update.note, update.sourceRef, update.now)
        )
      );
    },

    async askAsLesson({ hypothesisId, lessonId, now }) {
      const [inserted] = await db.batch([
        db
          .prepare(
            `INSERT INTO ai_style_lessons (id, text, scope, status, from_remark, origin, created_at, updated_at)
             SELECT ?1, h.text, h.scope, 'asked', 0, 'analytics', ?3, ?3 FROM ai_hypotheses h
             WHERE h.id = ?2 AND h.status = 'supported' AND h.kind = 'writing' AND h.lesson_id IS NULL
               AND (SELECT count(*) FROM ai_style_lessons WHERE status IN ('seen', 'asked')) < ?4`
          )
          .bind(lessonId, hypothesisId, now, OPEN_LESSONS_MAX),
        db
          .prepare(
            `UPDATE ai_hypotheses SET lesson_id = ?2, updated_at = ?3
             WHERE id = ?1 AND lesson_id IS NULL AND EXISTS (SELECT 1 FROM ai_style_lessons WHERE id = ?2)`
          )
          .bind(hypothesisId, lessonId, now)
      ]);
      return (inserted?.meta.changes ?? 0) === 1;
    }
  };
}
