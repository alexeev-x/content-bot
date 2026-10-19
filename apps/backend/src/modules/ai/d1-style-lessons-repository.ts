import { RULES_IN_USE_MAX, RULES_IN_USE_SQL } from './d1-rules-repository';
import type { WriterFormat } from './writer-types';

// What the owner's edits and remarks teach the writer (AI plan P7c, migration 0084). Every edit is claimed once;
// every state change is conditional, so overlapping runs and repeated taps change nothing twice.

export type LessonStatus = 'seen' | 'asked' | 'accepted' | 'rejected' | 'expired';

export interface LessonRow {
  id: string;
  text: string;
  scope: WriterFormat;
  status: LessonStatus;
  fromRemark: boolean;
  ruleId: string | null;
  /** Distinct drafts it was read off. */
  drafts: number;
  createdAt: number;
}

/** One edit or remark not read yet. */
export interface StyleSource {
  key: string;
  generationId: string;
  format: WriterFormat;
  /** The AI's text the owner changed or judged. */
  draft: string;
  /** The owner's own version; null for a remark on the AI's text. */
  final: string | null;
  /** The owner's words from «Что не так?» and the reason button, for a remark. */
  remark: { note: string; kind: string } | null;
  createdAt: number;
}

/** An approval counts as an edit from this share of changed words (smaller edits teach false lessons, CIPHER). */
export const LESSON_EDIT_MIN = 0.15;
/** Lessons waiting at most: the oldest one with a single draft behind it gives way to a new one. */
export const OPEN_LESSONS_MAX = 40;
/** A question left unanswered this long expires: it stops holding a place and is not asked again. */
const ASKED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A text the owner marked «Не учиться на этом» (migration 0071) teaches no lesson either. */
const EXCLUDED = (revision: string) =>
  `EXISTS (SELECT 1 FROM ai_learning_exclusions x WHERE x.source = 'revision' AND x.source_id = ${revision})`;
/** A claim older than this was left by a run that died (a consumer has 15 minutes): the edit is read again. */
const CLAIM_STALE_MS = 30 * 60 * 1000;
/** A source counts as read unless only an abandoned claim stands for it (`param` binds the stale cut-off). */
const taken = (param: string) => `(s.outcome <> 'claimed' OR s.created_at >= ${param})`;

export interface StyleLessonsRepository {
  /** Edits and remarks since `since` not read yet, oldest first, at most `limit` (≤ 10). */
  unread(since: number, limit: number, now: number): Promise<StyleSource[]>;
  /** Claims a source once, or again when its claim was abandoned; false when another run has it. */
  claim(source: Pick<StyleSource, 'key' | 'generationId'>, now: number): Promise<boolean>;
  /** Gives a source back after a failed model call, so a later run reads it. */
  release(key: string): Promise<void>;
  /** The source taught nothing (a fact fix, a typo). */
  markNone(key: string): Promise<void>;
  /** A new lesson read off the source; false when OPEN_LESSONS_MAX are open. */
  addLesson(input: {
    id: string;
    text: string;
    scope: WriterFormat;
    fromRemark: boolean;
    key: string;
    now: number;
  }): Promise<boolean>;
  /** The source shows a lesson already known (not a turned-down one). */
  addEvidence(input: { lessonId: string; key: string; fromRemark: boolean; now: number }): Promise<void>;
  /** Lessons of these scopes for the model to match against, with the turned-down ones (never proposed again). */
  known(scope: WriterFormat): Promise<LessonRow[]>;
  /** Seen lessons with two drafts behind them or the owner's own words: the questions to ask, at most `limit`. */
  toAsk(limit: number): Promise<LessonRow[]>;
  /** seen → asked, once. */
  markAsked(id: string, now: number): Promise<boolean>;
  find(id: string): Promise<LessonRow | null>;
  /**
   * asked → accepted together with its active owner rule, in one batch (review 19.10.2026: nothing half-made if
   * the Worker dies). `full` when the 15 rules in use leave no room; `stale` when it was answered before.
   */
  accept(input: { id: string; ruleId: string; now: number }): Promise<'accepted' | 'full' | 'stale'>;
  /** asked → rejected, once. */
  reject(input: { id: string; now: number }): Promise<boolean>;
  /** Drops seen lessons with a single draft older than `before` that nothing confirmed; expires month-old questions. */
  forgetStale(before: number, now: number): Promise<number>;
}

const COLUMNS = `l.id, l.text, l.scope, l.status, l.from_remark AS fromRemark, l.rule_id AS ruleId, l.created_at AS createdAt,
  (SELECT count(DISTINCT s.generation_id) FROM ai_style_sources s WHERE s.lesson_id = l.id) AS drafts`;

type RawLesson = Omit<LessonRow, 'fromRemark'> & { fromRemark: number };
const toRow = (row: RawLesson): LessonRow => ({ ...row, fromRemark: row.fromRemark === 1 });

export function createD1StyleLessonsRepository(db: D1Database): StyleLessonsRepository {
  return {
    async unread(since, limit, now) {
      const capped = Math.min(limit, 10);
      const staleBefore = now - CLAIM_STALE_MS;
      const [edits, remarks] = await db.batch([
        db
          .prepare(
            `SELECT 'revision:' || a.id AS key, a.generation_id AS generationId, g.format, a.text AS final,
                    (SELECT d.text FROM ai_text_revisions d WHERE d.generation_id = a.generation_id
                       AND d.provenance = 'AI_DRAFT' ORDER BY d.created_at DESC LIMIT 1) AS draft,
                    a.created_at AS createdAt
             FROM ai_text_revisions a JOIN ai_generations g ON g.id = a.generation_id
             WHERE a.provenance IN ('OWNER_APPROVED', 'OWNER_PREAPPROVED') AND a.edit_ratio >= ?2 AND a.created_at >= ?1
               AND NOT EXISTS (SELECT 1 FROM ai_style_sources s WHERE s.source_key = 'revision:' || a.id AND ${taken('?4')})
             AND NOT ${EXCLUDED('a.id')}
             ORDER BY a.created_at LIMIT ?3`
          )
          .bind(since, LESSON_EDIT_MIN, capped, staleBefore),
        db
          .prepare(
            `SELECT 'feedback:' || f.id AS key, f.generation_id AS generationId, g.format, f.note, f.kind,
                    coalesce(r.text, (SELECT d.text FROM ai_text_revisions d WHERE d.generation_id = f.generation_id
                       AND d.provenance = 'AI_DRAFT' ORDER BY d.created_at DESC LIMIT 1)) AS draft,
                    f.created_at AS createdAt
             FROM ai_feedback f JOIN ai_generations g ON g.id = f.generation_id
             LEFT JOIN ai_text_revisions r ON r.id = f.revision_id
             WHERE f.note IS NOT NULL AND f.created_at >= ?1
               AND NOT EXISTS (SELECT 1 FROM ai_style_sources s WHERE s.source_key = 'feedback:' || f.id AND ${taken('?3')})
             AND (f.revision_id IS NULL OR NOT ${EXCLUDED('f.revision_id')})
             ORDER BY f.created_at LIMIT ?2`
          )
          .bind(since, capped, staleBefore)
      ]);
      type Edit = {
        key: string;
        generationId: string;
        format: WriterFormat;
        final: string;
        draft: string | null;
        createdAt: number;
      };
      type Remark = Omit<Edit, 'final'> & { note: string; kind: string };
      const sources: StyleSource[] = [
        ...((edits?.results ?? []) as Edit[])
          .filter((row) => row.draft !== null)
          .map((row) => ({ ...row, draft: row.draft ?? '', remark: null })),
        ...((remarks?.results ?? []) as Remark[])
          .filter((row) => row.draft !== null)
          .map((row) => ({
            key: row.key,
            generationId: row.generationId,
            format: row.format,
            draft: row.draft ?? '',
            final: null,
            remark: { note: row.note, kind: row.kind },
            createdAt: row.createdAt
          }))
      ];
      return sources.sort((a, b) => a.createdAt - b.createdAt).slice(0, capped);
    },

    async claim({ key, generationId }, now) {
      const result = await db
        .prepare(
          `INSERT INTO ai_style_sources (source_key, generation_id, outcome, created_at)
           VALUES (?1, ?2, 'claimed', ?3)
           ON CONFLICT (source_key) DO UPDATE SET created_at = excluded.created_at
           WHERE ai_style_sources.outcome = 'claimed' AND ai_style_sources.created_at < ?4`
        )
        .bind(key, generationId, now, now - CLAIM_STALE_MS)
        .run();
      return result.meta.changes === 1;
    },

    async release(key) {
      await db.prepare(`DELETE FROM ai_style_sources WHERE source_key = ? AND outcome = 'claimed'`).bind(key).run();
    },

    async markNone(key) {
      await db.prepare(`UPDATE ai_style_sources SET outcome = 'none' WHERE source_key = ?`).bind(key).run();
    },

    async addLesson({ id, text, scope, fromRemark, key, now }) {
      // At the cap the oldest single-draft guess gives way (review 19.10.2026: learning never stops).
      const evict = await db
        .prepare(
          `SELECT l.id FROM ai_style_lessons l
           WHERE (SELECT count(*) FROM ai_style_lessons WHERE status IN ('seen', 'asked')) >= ?1
             AND l.status = 'seen' AND l.from_remark = 0
             AND (SELECT count(DISTINCT s.generation_id) FROM ai_style_sources s WHERE s.lesson_id = l.id) < 2
           ORDER BY l.updated_at LIMIT 1`
        )
        .bind(OPEN_LESSONS_MAX)
        .first<{ id: string }>();
      if (evict !== null)
        await db.batch([
          db
            .prepare(`UPDATE ai_style_sources SET lesson_id = NULL, outcome = 'none' WHERE lesson_id = ?`)
            .bind(evict.id),
          db.prepare(`DELETE FROM ai_style_lessons WHERE id = ? AND status = 'seen'`).bind(evict.id)
        ]);
      const [inserted] = await db.batch([
        db
          .prepare(
            `INSERT INTO ai_style_lessons (id, text, scope, status, from_remark, created_at, updated_at)
             SELECT ?1, ?2, ?3, 'seen', ?4, ?5, ?5
             WHERE (SELECT count(*) FROM ai_style_lessons WHERE status IN ('seen', 'asked')) < ?6`
          )
          .bind(id, text, scope, fromRemark ? 1 : 0, now, OPEN_LESSONS_MAX),
        db
          .prepare(
            `UPDATE ai_style_sources SET outcome = 'lesson', lesson_id = ?2
             WHERE source_key = ?1 AND EXISTS (SELECT 1 FROM ai_style_lessons WHERE id = ?2)`
          )
          .bind(key, id)
      ]);
      if ((inserted?.meta.changes ?? 0) === 1) return true;
      await db.prepare(`UPDATE ai_style_sources SET outcome = 'none' WHERE source_key = ?`).bind(key).run();
      return false;
    },

    async addEvidence({ lessonId, key, fromRemark, now }) {
      await db.batch([
        db
          .prepare(`UPDATE ai_style_sources SET outcome = 'lesson', lesson_id = ?2 WHERE source_key = ?1`)
          .bind(key, lessonId),
        db
          .prepare(
            `UPDATE ai_style_lessons SET updated_at = ?2, from_remark = max(from_remark, ?3)
             WHERE id = ?1 AND status IN ('seen', 'asked')`
          )
          .bind(lessonId, now, fromRemark ? 1 : 0)
      ]);
    },

    async known(scope) {
      const rows = await db
        .prepare(
          // Open and accepted first, then every turned-down or expired one the model must not propose again.
          `SELECT ${COLUMNS} FROM ai_style_lessons l WHERE l.scope = ?1
           ORDER BY l.status IN ('rejected', 'expired'), l.updated_at DESC LIMIT 100`
        )
        .bind(scope)
        .all<RawLesson>();
      return rows.results.map(toRow);
    },

    async toAsk(limit) {
      const rows = await db
        .prepare(
          `SELECT ${COLUMNS} FROM ai_style_lessons l WHERE l.status = 'seen'
             AND (l.from_remark = 1
               OR (SELECT count(DISTINCT s.generation_id) FROM ai_style_sources s WHERE s.lesson_id = l.id) >= 2)
           ORDER BY l.updated_at LIMIT ?`
        )
        .bind(Math.min(limit, 10))
        .all<RawLesson>();
      return rows.results.map(toRow);
    },

    async markAsked(id, now) {
      const result = await db
        .prepare(`UPDATE ai_style_lessons SET status = 'asked', updated_at = ?2 WHERE id = ?1 AND status = 'seen'`)
        .bind(id, now)
        .run();
      return result.meta.changes === 1;
    },

    async find(id) {
      const row = await db
        .prepare(`SELECT ${COLUMNS} FROM ai_style_lessons l WHERE l.id = ?`)
        .bind(id)
        .first<RawLesson>();
      return row === null ? null : toRow(row);
    },

    async accept({ id, ruleId, now }) {
      // The rule only while the lesson is still asked and a place is free; the lesson only if that rule went in.
      const [rule] = await db.batch([
        db
          .prepare(
            `INSERT INTO ai_rules (id, text, scope, source, status, created_at, updated_at)
             SELECT ?2, substr(l.text, 1, 300), l.scope, 'owner', 'active', ?3, ?3 FROM ai_style_lessons l
             WHERE l.id = ?1 AND l.status = 'asked'
               AND (SELECT count(*) FROM ai_rules WHERE ${RULES_IN_USE_SQL}) < ?4`
          )
          .bind(id, ruleId, now, RULES_IN_USE_MAX),
        db
          .prepare(
            `UPDATE ai_style_lessons SET status = 'accepted', rule_id = ?2, updated_at = ?3
             WHERE id = ?1 AND status = 'asked' AND EXISTS (SELECT 1 FROM ai_rules WHERE id = ?2)`
          )
          .bind(id, ruleId, now)
      ]);
      if ((rule?.meta.changes ?? 0) === 1) return 'accepted';
      const lesson = await db
        .prepare('SELECT status FROM ai_style_lessons WHERE id = ?')
        .bind(id)
        .first<{ status: string }>();
      return lesson?.status === 'asked' ? 'full' : 'stale';
    },

    async reject({ id, now }) {
      const result = await db
        .prepare(`UPDATE ai_style_lessons SET status = 'rejected', updated_at = ?2 WHERE id = ?1 AND status = 'asked'`)
        .bind(id, now)
        .run();
      return result.meta.changes === 1;
    },

    async forgetStale(before, now) {
      const [, , removed] = await db.batch([
        db
          .prepare(
            `UPDATE ai_style_lessons SET status = 'expired', updated_at = ?2 WHERE status = 'asked' AND updated_at < ?1`
          )
          .bind(now - ASKED_TTL_MS, now),
        db
          .prepare(
            `UPDATE ai_style_sources SET lesson_id = NULL, outcome = 'none' WHERE lesson_id IN (
               SELECT l.id FROM ai_style_lessons l WHERE l.status = 'seen' AND l.from_remark = 0 AND l.updated_at < ?1
                 AND (SELECT count(DISTINCT s.generation_id) FROM ai_style_sources s WHERE s.lesson_id = l.id) < 2)`
          )
          .bind(before),
        db
          .prepare(
            `DELETE FROM ai_style_lessons WHERE status = 'seen' AND from_remark = 0 AND updated_at < ?1
               AND NOT EXISTS (SELECT 1 FROM ai_style_sources s WHERE s.lesson_id = ai_style_lessons.id)`
          )
          .bind(before)
      ]);
      return removed?.meta.changes ?? 0;
    }
  };
}
