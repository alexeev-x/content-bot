import type { SlotAttemptRow, SlotBuild, SlotRepository, SlotRow } from '../application/ports';
import { COUNTING_STATUSES, ENDED_STATUSES, LIVE_STATUSES, type SlotStatus } from '../domain/slot-machine';

// The scheduler's slots (migration 0119). Inserts skip a taken time or dedupe key (the partial unique indexes decide,
// so two ticks planning at once never make two posts); every status change is conditional on the status it leaves.

const COLUMNS = `id, msk_day, slot_at, kind, rubric_key, candidates_json, cand_idx, attempt, status, build_at,
  next_action_at, deadline_at, lease_until, weight, interactive, family, manual, dedupe_key, reason_json, build_json, facts_json,
  post_id, publication_id, message_ids_json, poll_id, sent_at, error_code, error_step, created_at, updated_at`;

interface Row {
  id: string;
  msk_day: string;
  slot_at: number;
  kind: SlotRow['kind'];
  rubric_key: string;
  candidates_json: string;
  cand_idx: number;
  attempt: number;
  status: SlotStatus;
  build_at: number;
  next_action_at: number;
  deadline_at: number;
  lease_until: number | null;
  weight: 'V' | 'L';
  interactive: number;
  family: string;
  manual: number;
  dedupe_key: string;
  reason_json: string;
  build_json: string | null;
  facts_json: string | null;
  post_id: string | null;
  publication_id: string | null;
  message_ids_json: string | null;
  poll_id: string | null;
  sent_at: number | null;
  error_code: string | null;
  error_step: string | null;
  created_at: number;
  updated_at: number;
}

const toSlot = (row: Row): SlotRow => ({
  id: row.id,
  mskDay: row.msk_day,
  slotAt: row.slot_at,
  kind: row.kind,
  rubricKey: row.rubric_key,
  candidates: JSON.parse(row.candidates_json) as string[],
  candIdx: row.cand_idx,
  attempt: row.attempt,
  status: row.status,
  buildAt: row.build_at,
  nextActionAt: row.next_action_at,
  deadlineAt: row.deadline_at,
  leaseUntil: row.lease_until,
  weight: row.weight,
  interactive: row.interactive === 1,
  family: row.family,
  manual: row.manual === 1,
  dedupeKey: row.dedupe_key,
  reason: JSON.parse(row.reason_json) as SlotRow['reason'],
  build: row.build_json === null ? null : (JSON.parse(row.build_json) as SlotBuild),
  facts: row.facts_json === null ? null : (JSON.parse(row.facts_json) as Record<string, unknown>),
  postId: row.post_id,
  publicationId: row.publication_id,
  messageIds: row.message_ids_json === null ? [] : (JSON.parse(row.message_ids_json) as string[]),
  pollId: row.poll_id,
  sentAt: row.sent_at,
  errorCode: row.error_code,
  errorStep: row.error_step,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const LIVE = LIVE_STATUSES.map((status) => `'${status}'`).join(', ');
const COUNTING = COUNTING_STATUSES.map((status) => `'${status}'`).join(', ');

/** The columns a transition may set, and how each is stored. */
const SETTERS: Record<string, { column: string; value: (value: unknown) => string | number | null }> = {
  nextActionAt: { column: 'next_action_at', value: (value) => value as number },
  slotAt: { column: 'slot_at', value: (value) => value as number },
  deadlineAt: { column: 'deadline_at', value: (value) => value as number },
  leaseUntil: { column: 'lease_until', value: (value) => value as number | null },
  attempt: { column: 'attempt', value: (value) => value as number },
  candIdx: { column: 'cand_idx', value: (value) => value as number },
  rubricKey: { column: 'rubric_key', value: (value) => value as string },
  build: { column: 'build_json', value: (value) => (value === null ? null : JSON.stringify(value)) },
  facts: { column: 'facts_json', value: (value) => (value === null ? null : JSON.stringify(value)) },
  postId: { column: 'post_id', value: (value) => value as string | null },
  publicationId: { column: 'publication_id', value: (value) => value as string | null },
  messageIds: { column: 'message_ids_json', value: (value) => JSON.stringify(value) },
  pollId: { column: 'poll_id', value: (value) => value as string | null },
  sentAt: { column: 'sent_at', value: (value) => value as number | null },
  errorCode: { column: 'error_code', value: (value) => (value === null ? null : String(value).slice(0, 80)) },
  errorStep: { column: 'error_step', value: (value) => value as string | null },
  manual: { column: 'manual', value: (value) => (value === true ? 1 : 0) }
};

export function createD1SlotRepository(db: D1Database): SlotRepository {
  const many = async (sql: string, ...bindings: (string | number)[]) =>
    (
      await db
        .prepare(sql)
        .bind(...bindings)
        .all<Row>()
    ).results.map(toSlot);

  return {
    between: (from, to) =>
      many(
        `SELECT ${COLUMNS} FROM rubric_slots WHERE slot_at >= ?1 AND slot_at < ?2 ORDER BY slot_at LIMIT 500`,
        from,
        to
      ),

    async byId(id) {
      const row = await db.prepare(`SELECT ${COLUMNS} FROM rubric_slots WHERE id = ?1`).bind(id).first<Row>();
      return row === null ? null : toSlot(row);
    },

    async rubricOfPublications(publicationIds) {
      const ids = publicationIds.slice(0, 100);
      if (ids.length === 0) return new Map();
      const marks = ids.map((_, index) => `?${index + 1}`).join(', ');
      const { results } = await db
        .prepare(
          `SELECT publication_id AS pid, rubric_key AS rubric FROM rubric_slots
           WHERE publication_id IN (${marks}) AND kind <> 'poll_close' AND status <> 'superseded'
           UNION ALL
           SELECT j.value AS pid, s.rubric_key AS rubric FROM rubric_slots s, json_each(s.build_json, '$.publications') j
           WHERE s.build_json IS NOT NULL AND s.kind <> 'poll_close' AND s.status <> 'superseded' AND j.value IN (${marks})`
        )
        .bind(...ids)
        .all<{ pid: string; rubric: string }>();
      return new Map(results.map((row) => [row.pid, row.rubric]));
    },

    ofRubric: (rubricKey, limit) =>
      many(
        `SELECT ${COLUMNS} FROM rubric_slots WHERE rubric_key = ?1 ORDER BY slot_at DESC LIMIT ?2`,
        rubricKey,
        limit
      ),

    async countingOf(rubricKey) {
      const row = await db
        .prepare(
          `SELECT count(*) AS n FROM rubric_slots WHERE rubric_key = ?1 AND status IN (${COUNTING})
           AND kind NOT IN ('poll_close', 'follow_up')`
        )
        .bind(rubricKey)
        .first<{ n: number }>();
      return row?.n ?? 0;
    },

    due: (now, limit) =>
      many(
        `SELECT ${COLUMNS} FROM rubric_slots WHERE status IN (${LIVE}) AND next_action_at <= ?1
         ORDER BY next_action_at, id LIMIT ?2`,
        now,
        limit
      ),

    async taken(keys) {
      if (keys.length === 0) return new Set();
      const { results } = await db
        .prepare(
          `SELECT dedupe_key FROM rubric_slots WHERE dedupe_key IN (SELECT value FROM json_each(?1))
           AND status IN (${LIVE}, 'sent', 'partial', 'unresolved', 'skipped')`
        )
        .bind(JSON.stringify(keys.slice(0, 100)))
        .all<{ dedupe_key: string }>();
      return new Set(results.map((row) => row.dedupe_key));
    },

    live: () =>
      many(`SELECT ${COLUMNS} FROM rubric_slots WHERE status IN (${LIVE}) ORDER BY next_action_at, id LIMIT 200`),

    // No conflict target: a taken time or a taken dedupe key both skip the row (the partial unique indexes decide).
    async insert(slots, now) {
      if (slots.length === 0) return 0;
      const results = await db.batch(
        slots.map((slot) =>
          db
            .prepare(
              `INSERT INTO rubric_slots (id, msk_day, slot_at, kind, rubric_key, candidates_json, cand_idx, attempt,
                 status, build_at, next_action_at, deadline_at, weight, interactive, family, dedupe_key, reason_json,
                 created_at, updated_at, explore)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18, ?19)
               ON CONFLICT DO NOTHING`
            )
            .bind(
              slot.id,
              slot.mskDay,
              slot.slotAt,
              slot.kind,
              slot.rubricKey,
              JSON.stringify(slot.candidates),
              slot.candIdx,
              slot.attempt,
              slot.status,
              slot.buildAt,
              slot.nextActionAt,
              slot.deadlineAt,
              slot.weight,
              slot.interactive ? 1 : 0,
              slot.family,
              slot.dedupeKey,
              JSON.stringify(slot.reason),
              now,
              slot.explore === true ? 1 : 0
            )
        )
      );
      return results.reduce((sum, result) => sum + result.meta.changes, 0);
    },

    async transition({ id, from, attempt, to, now, set = {} }) {
      const assignments: string[] = ['status = ?1', 'updated_at = ?2'];
      const values: (string | number | null)[] = [to, now];
      for (const [key, value] of Object.entries(set)) {
        const setter = SETTERS[key];
        if (setter === undefined || value === undefined) continue;
        values.push(setter.value(value));
        assignments.push(`${setter.column} = ?${values.length}`);
      }
      values.push(id, from);
      let where = `id = ?${values.length - 1} AND status = ?${values.length}`;
      if (attempt !== undefined) {
        values.push(attempt);
        where += ` AND attempt = ?${values.length}`;
      }
      const result = await db
        .prepare(`UPDATE rubric_slots SET ${assignments.join(', ')} WHERE ${where}`)
        .bind(...values)
        .run();
      return result.meta.changes === 1;
    },

    // One row per (slot, attempt, step): a repeated write of the same step keeps the latest outcome.
    async recordAttempt(row) {
      await db
        .prepare(
          `INSERT INTO rubric_slot_attempts (slot_id, attempt, step, rubric_key, outcome, provider, http_status,
             error_code, message, started_at, finished_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
           ON CONFLICT (slot_id, attempt, step) DO UPDATE SET outcome = excluded.outcome, provider = excluded.provider,
             http_status = excluded.http_status, error_code = excluded.error_code, message = excluded.message,
             finished_at = excluded.finished_at`
        )
        .bind(
          row.slotId,
          row.attempt,
          row.step,
          row.rubricKey,
          row.outcome,
          row.provider,
          row.httpStatus,
          row.errorCode === null ? null : row.errorCode.slice(0, 80),
          row.message === null ? null : row.message.slice(0, 300),
          row.startedAt,
          row.finishedAt
        )
        .run();
    },

    async attempts(slotId) {
      const { results } = await db
        .prepare(
          `SELECT slot_id, attempt, step, rubric_key, outcome, provider, http_status, error_code, message, started_at,
                  finished_at
           FROM rubric_slot_attempts WHERE slot_id = ?1 ORDER BY started_at, attempt LIMIT 50`
        )
        .bind(slotId)
        .all<{
          slot_id: string;
          attempt: number;
          step: SlotAttemptRow['step'];
          rubric_key: string;
          outcome: SlotAttemptRow['outcome'];
          provider: string | null;
          http_status: number | null;
          error_code: string | null;
          message: string | null;
          started_at: number;
          finished_at: number;
        }>();
      return results.map((row) => ({
        slotId: row.slot_id,
        attempt: row.attempt,
        step: row.step,
        rubricKey: row.rubric_key,
        outcome: row.outcome,
        provider: row.provider,
        httpStatus: row.http_status,
        errorCode: row.error_code,
        message: row.message,
        startedAt: row.started_at,
        finishedAt: row.finished_at
      }));
    },

    async purgeAttempts(before, limit) {
      const result = await db
        .prepare(
          `DELETE FROM rubric_slot_attempts WHERE (slot_id, attempt, step) IN (
             SELECT slot_id, attempt, step FROM rubric_slot_attempts WHERE started_at < ?1 LIMIT ?2)`
        )
        .bind(before, limit)
        .run();
      return result.meta.changes;
    },

    async purgeBuilds(before, limit) {
      const ended = ENDED_STATUSES.map((status) => `'${status}'`).join(', ');
      const result = await db
        .prepare(
          `UPDATE rubric_slots SET build_json = NULL, facts_json = NULL WHERE id IN (
             SELECT id FROM rubric_slots
              WHERE slot_at < ?1 AND status IN (${ended}) AND (build_json IS NOT NULL OR facts_json IS NOT NULL)
              LIMIT ?2)`
        )
        .bind(before, limit)
        .run();
      return result.meta.changes;
    }
  };
}
