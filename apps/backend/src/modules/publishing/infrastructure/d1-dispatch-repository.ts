import type { ClaimedJob, DispatchRepository, DispatchTarget, ExpiredClaim, JobResolution } from '../application/ports';

type Value = string | number | null;

// Which job row a write may touch. Every statement of a batch carries the same guard, and the job
// update (which changes what the guard sees) is the last one, so the batch is all-or-nothing: if
// somebody else resolved the job first, nothing here is written.
interface Guard {
  /** Conditions on `jobs`, numbered from `first`. Constant fragments only; every value is bound. */
  conditions(first: number): string;
  bindings: Value[];
}

// The dispatcher's own attempt: still claimed, still the attempt it claimed.
function attemptGuard(jobId: string, attempt: number): Guard {
  return {
    conditions: (n) => `id = ?${n} AND status = 'claimed' AND attempts = ?${n + 1}`,
    bindings: [jobId, attempt]
  };
}

// Reconcile's view: the lease ran out and the send mark is in the state it was read in.
function expiredGuard(jobId: string, attempt: number, now: number, sendStarted: boolean): Guard {
  const mark = sendStarted ? 'IS NOT NULL' : 'IS NULL';
  return {
    conditions: (n) =>
      `id = ?${n} AND status = 'claimed' AND attempts = ?${n + 1} AND lease_until < ?${n + 2} AND send_started_at ${mark}`,
    bindings: [jobId, attempt, now]
  };
}

function guarded(
  db: D1Database,
  sql: (jobStillOurs: string) => string,
  own: Value[],
  guard: Guard
): D1PreparedStatement {
  const jobStillOurs = `EXISTS (SELECT 1 FROM jobs WHERE ${guard.conditions(own.length + 1)})`;
  return db.prepare(sql(jobStillOurs)).bind(...own, ...guard.bindings);
}

// Metadata only: never post or chat text.
function auditDetails(resolution: JobResolution): string {
  return JSON.stringify({
    jobId: resolution.jobId,
    attempt: resolution.attempt,
    status: resolution.status,
    ...(resolution.errorCode === null ? {} : { code: resolution.errorCode })
  });
}

function resolutionStatements(db: D1Database, resolution: JobResolution, guard: Guard): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [
    guarded(
      db,
      (ours) =>
        `INSERT INTO job_attempts
           (job_id, attempt, started_at, finished_at, outcome, error_code, retry_after, external_message_id)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE ${ours}`,
      [
        resolution.jobId,
        resolution.attempt,
        resolution.startedAt,
        resolution.finishedAt,
        resolution.attemptOutcome,
        resolution.errorCode,
        resolution.retryAfterSec,
        resolution.externalMessageId
      ],
      guard
    )
  ];

  if (resolution.incident !== null) {
    statements.push(
      guarded(
        db,
        (ours) =>
          `INSERT INTO incidents (id, kind, publication_id, job_id, code, created_at, details)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE ${ours}`,
        [
          resolution.incident.id,
          resolution.incident.kind,
          resolution.publicationId,
          resolution.jobId,
          resolution.incident.code,
          resolution.finishedAt,
          JSON.stringify(resolution.incident.details)
        ],
        guard
      )
    );
  }

  if (resolution.publicationId !== null) {
    // The confirmed message id is kept once written; the error code always follows the latest attempt.
    statements.push(
      guarded(
        db,
        (ours) =>
          `UPDATE publications
           SET external_message_id = COALESCE(?2, external_message_id),
               external_message_ids = COALESCE(?3, external_message_ids), last_error_code = ?4, updated_at = ?5
           WHERE id = ?1 AND ${ours}`,
        [
          resolution.publicationId,
          resolution.externalMessageId,
          resolution.externalMessageIds == null ? null : JSON.stringify(resolution.externalMessageIds),
          resolution.errorCode,
          resolution.finishedAt
        ],
        guard
      )
    );
  }

  statements.push(
    guarded(
      db,
      (ours) =>
        `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
         SELECT 'system', ?1, ?2, ?3, ?4, ?5 WHERE ${ours}`,
      [
        resolution.auditAction,
        resolution.publicationId === null ? 'job' : 'publication',
        resolution.publicationId ?? resolution.jobId,
        resolution.finishedAt,
        auditDetails(resolution)
      ],
      guard
    ),
    // Last: it moves the job out of `claimed`, which every statement above was guarded by.
    // A retry clears the send mark (Telegram refused, nothing was posted); every other state keeps it as evidence.
    db
      .prepare(
        `UPDATE jobs
         SET status = ?1, run_at = COALESCE(?2, run_at), lease_until = NULL,
             send_started_at = CASE WHEN ?1 = 'retry_wait' THEN NULL ELSE send_started_at END, updated_at = ?3
         WHERE ${guard.conditions(4)}`
      )
      .bind(resolution.status, resolution.runAt ?? null, resolution.finishedAt, ...guard.bindings)
  );
  return statements;
}

interface ClaimRow {
  id: string;
  publication_id: string | null;
  attempts: number;
}

interface TargetRow {
  post_id: string;
  post_revision: number;
  chat_id: string;
  title: string;
  enabled: number;
}

interface ExpiredRow {
  id: string;
  publication_id: string | null;
  attempts: number;
  send_started_at: number | null;
  updated_at: number;
}

// The due scan (docs/BACKEND_ARCHITECTURE.md §5). Each branch repeats the partial index predicate
// `status IN ('pending', 'retry_wait')` literally (SQLite cannot prove `status = 'pending'` implies
// it) and adds the single status it seeks, so both walk jobs_due in (run_at, id) order and stop
// after `limit` rows: a backlog of due jobs costs at most 2 x limit reads per tick, not its size.
// A plain `IN` with one ORDER BY would have to read every due row to sort it. The outer query
// merges at most 2 x limit rows into one oldest-first order.
const DUE_BRANCH = (status: string) => `SELECT id, run_at FROM jobs
    WHERE status IN ('pending', 'retry_wait') AND status = '${status}' AND run_at <= ?1 AND kind = 'publish'
    ORDER BY run_at, id LIMIT ?2`;

export const DUE_JOBS_SQL = `SELECT id FROM (
  SELECT id, run_at FROM (${DUE_BRANCH('pending')})
  UNION ALL
  SELECT id, run_at FROM (${DUE_BRANCH('retry_wait')})
) ORDER BY run_at, id LIMIT ?2`;

export const EXPIRED_CLAIMS_SQL = `SELECT id, publication_id, attempts, send_started_at, updated_at FROM jobs
  WHERE status = 'claimed' AND lease_until < ?1 ORDER BY lease_until LIMIT ?2`;

export function createD1DispatchRepository(db: D1Database): DispatchRepository {
  return {
    async findDueJobIds(now, limit) {
      const { results } = await db.prepare(DUE_JOBS_SQL).bind(now, limit).all<{ id: string }>();
      return results.map((row) => row.id);
    },

    // Copied from docs/BACKEND_ARCHITECTURE.md §5 "Conditional job claim".
    async claim(jobId, now, leaseUntil): Promise<ClaimedJob | null> {
      const result = await db
        .prepare(
          `UPDATE jobs
           SET status = 'claimed', attempts = attempts + 1,
               lease_until = ?1, updated_at = ?2
           WHERE id = ?3 AND status IN ('pending', 'retry_wait')
             AND run_at <= ?2
             AND (lease_until IS NULL OR lease_until < ?2)
           RETURNING id, publication_id, attempts`
        )
        .bind(leaseUntil, now, jobId)
        .all<ClaimRow>();
      const row = result.results[0];
      if (result.meta.changes !== 1 || row === undefined) return null;
      return { jobId: row.id, publicationId: row.publication_id, attempt: row.attempts };
    },

    async loadTarget(publicationId): Promise<DispatchTarget | null> {
      const row = await db
        .prepare(
          `SELECT p.post_id, p.post_revision, d.chat_id, d.title, d.enabled
           FROM publications p JOIN destinations d ON d.id = p.destination_id
           WHERE p.id = ?1`
        )
        .bind(publicationId)
        .first<TargetRow>();
      if (row === null) return null;
      return {
        postId: row.post_id,
        postRevision: row.post_revision,
        chatId: row.chat_id,
        destinationTitle: row.title,
        destinationEnabled: row.enabled === 1
      };
    },

    async markSendStarted({ jobId, attempt, now, minLeaseUntil }) {
      const result = await db
        .prepare(
          `UPDATE jobs SET send_started_at = ?1, updated_at = ?1
           WHERE id = ?2 AND status = 'claimed' AND send_started_at IS NULL
             AND attempts = ?3 AND lease_until >= ?4`
        )
        .bind(now, jobId, attempt, minLeaseUntil)
        .run();
      return result.meta.changes === 1;
    },

    async resolve(resolution) {
      const results = await db.batch(
        resolutionStatements(db, resolution, attemptGuard(resolution.jobId, resolution.attempt))
      );
      return results.at(-1)?.meta.changes === 1;
    },

    // Our own write may have committed and still thrown (a lost response): the batch is atomic, so
    // the job and the attempt row of this attempt show our resolution, or neither does.
    async outcomeInPlace(resolution) {
      const row = await db
        .prepare(
          `SELECT j.status AS status, a.outcome AS outcome
           FROM jobs j LEFT JOIN job_attempts a ON a.job_id = j.id AND a.attempt = j.attempts
           WHERE j.id = ?1 AND j.attempts = ?2`
        )
        .bind(resolution.jobId, resolution.attempt)
        .first<{ status: string; outcome: string | null }>();
      return row !== null && row.status === resolution.status && row.outcome === resolution.attemptOutcome;
    },

    async findExpiredClaims(now, limit): Promise<ExpiredClaim[]> {
      const { results } = await db.prepare(EXPIRED_CLAIMS_SQL).bind(now, limit).all<ExpiredRow>();
      return results.map((row) => ({
        jobId: row.id,
        publicationId: row.publication_id,
        attempt: row.attempts,
        sendStartedAt: row.send_started_at,
        startedAt: row.updated_at
      }));
    },

    async resolveExpired(items, now) {
      if (items.length === 0) return [];
      const groups = items.map(({ resolution, sendStarted }) =>
        resolutionStatements(db, resolution, expiredGuard(resolution.jobId, resolution.attempt, now, sendStarted))
      );
      const results = await db.batch(groups.flat());
      let offset = 0;
      return groups.map((group) => {
        offset += group.length;
        return results[offset - 1]?.meta.changes === 1;
      });
    },

    // The id list is bound as one JSON array (one parameter, however many ids), and the UPDATE decides
    // per row: only a row whose owner_notified_at is still NULL is changed and returned.
    async claimOwnerNotices(incidentIds, now) {
      if (incidentIds.length === 0) return [];
      const { results } = await db
        .prepare(
          `UPDATE incidents SET owner_notified_at = ?1
           WHERE id IN (SELECT value FROM json_each(?2)) AND owner_notified_at IS NULL
           RETURNING id`
        )
        .bind(now, JSON.stringify(incidentIds))
        .all<{ id: string }>();
      return results.map((row) => row.id);
    },

    // Walks incidents_open_idx and stops after `limit` rows.
    async countOpenIncidents(limit) {
      const row = await db
        .prepare('SELECT count(*) AS n FROM (SELECT 1 FROM incidents WHERE resolved_at IS NULL LIMIT ?1)')
        .bind(limit)
        .first<{ n: number }>();
      return row?.n ?? 0;
    }
  };
}
