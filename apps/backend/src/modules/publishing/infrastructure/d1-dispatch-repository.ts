import type {
  ClaimedJob,
  DispatchRepository,
  DispatchTarget,
  ExpiredClaim,
  JobResolution,
  OwnerIncidentAlertGroup
} from '../application/ports';

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

function resolutionStatements(
  db: D1Database,
  resolution: JobResolution,
  guard: Guard,
  schema: Schema
): D1PreparedStatement[] {
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
    const groupKey = `${resolution.incident.kind}:${resolution.publicationId ?? resolution.jobId}`;
    statements.push(
      guarded(
        db,
        (ours) =>
          `INSERT INTO incidents (id, kind, publication_id, job_id, code, created_at, details, alert_group_key)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE ${ours}`,
        [
          resolution.incident.id,
          resolution.incident.kind,
          resolution.publicationId,
          resolution.jobId,
          resolution.incident.code,
          resolution.finishedAt,
          JSON.stringify(resolution.incident.details),
          groupKey
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
               ${schema === 'current' ? ', external_poll_id = COALESCE(?6, external_poll_id)' : ''}
           WHERE id = ?1 AND ${ours}`,
        [
          resolution.publicationId,
          resolution.externalMessageId,
          resolution.externalMessageIds == null ? null : JSON.stringify(resolution.externalMessageIds),
          resolution.errorCode,
          resolution.finishedAt,
          ...(schema === 'current' ? [resolution.externalPollId ?? null] : [])
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
//
// A series post (migration 0098) is due only once the previous post's job is `succeeded` and the gap has passed
// since then: the scan and the claim both check it, with `?now` the parameter holding the current time. Nothing is
// written when the previous post goes out. Few series posts ever wait at once, so the walk stays short.
export const SERIES_READY_SQL = (now: string) => `(blocked_by_job_id IS NULL OR EXISTS (
      SELECT 1 FROM jobs previous WHERE previous.id = jobs.blocked_by_job_id AND previous.status = 'succeeded'
        AND previous.updated_at + coalesce(jobs.chain_gap_ms, 0) <= ${now}))`;
// A job past its `not_after` (migration 0117) is never due: reconcile cancels it, and it must not hold up the scan.
const ON_TIME_SQL = (now: string) => `(not_after IS NULL OR not_after >= ${now})`;
const DUE_BRANCH = (status: string, onTime: boolean) => `SELECT id, run_at FROM jobs
    WHERE status IN ('pending', 'retry_wait') AND status = '${status}' AND run_at <= ?1 AND kind = 'publish'
      AND ${SERIES_READY_SQL('?1')}${onTime ? ` AND ${ON_TIME_SQL('?1')}` : ''}
    ORDER BY run_at, id LIMIT ?2`;
const dueJobsSql = (onTime: boolean) => `SELECT id FROM (
  SELECT id, run_at FROM (${DUE_BRANCH('pending', onTime)})
  UNION ALL
  SELECT id, run_at FROM (${DUE_BRANCH('retry_wait', onTime)})
) ORDER BY run_at, id LIMIT ?2`;

export const DUE_JOBS_SQL = dueJobsSql(true);
/** The scan before migration 0117: the shim below falls back to it while production lacks the column. */
const DUE_JOBS_SQL_V0 = dueJobsSql(false);

// Copied from docs/BACKEND_ARCHITECTURE.md §5 "Conditional job claim", plus the deadline of migration 0117.
const claimSql = (onTime: boolean) => `UPDATE jobs
           SET status = 'claimed', attempts = attempts + 1,
               lease_until = ?1, updated_at = ?2
           WHERE id = ?3 AND status IN ('pending', 'retry_wait')
             AND run_at <= ?2
             AND (lease_until IS NULL OR lease_until < ?2)
             AND ${SERIES_READY_SQL('?2')}${
               onTime
                 ? `
             AND ${ON_TIME_SQL('?2')}`
                 : ''
             }
           RETURNING id, publication_id, attempts`;

/** Waiting jobs past their deadline, oldest deadline first (jobs_not_after_idx). */
// Pinned: the planner would otherwise walk jobs_status_scheduled_idx by status and filter the deadline row by row.
export const LATE_JOBS_SQL = `SELECT id FROM jobs INDEXED BY jobs_not_after_idx
  WHERE not_after IS NOT NULL AND status IN ('pending', 'retry_wait') AND not_after < ?1
  ORDER BY not_after, id LIMIT ?2`;

/**
 * `v0`: production D1 has not had migration 0117 yet (the owner applies it before the release). Publishing then keeps
 * going without the deadline instead of stopping on «no such column». Remove with the shim (scheduler stage 9).
 */
type Schema = 'current' | 'v0';
const SCHEMA_BEHIND = /no such (column: (not_after|external_poll_id)|index: jobs_not_after_idx)/;

export const EXPIRED_CLAIMS_SQL = `SELECT id, publication_id, attempts, send_started_at, updated_at FROM jobs
  WHERE status = 'claimed' AND lease_until < ?1 ORDER BY lease_until LIMIT ?2`;

/** The `detail` an incident was stored with (Telegram's refusal text), or null when it has none or is unreadable. */
function incidentDetail(details: string | null): string | null {
  if (details === null) return null;
  try {
    const value: unknown = JSON.parse(details);
    const detail = typeof value === 'object' && value !== null ? (value as { detail?: unknown }).detail : undefined;
    return typeof detail === 'string' && detail !== '' ? detail.slice(0, 300) : null;
  } catch {
    return null;
  }
}

export const OWNER_INCIDENT_ALERT_GROUPS_SQL = `
  SELECT g.group_key, g.kind, g.first_seen_at, g.last_seen_at, g.occurrence_count,
         g.recovery_claimed_at,
         (SELECT max(history.resolved_at) FROM incidents history
          WHERE history.alert_group_key = g.group_key AND history.resolved_at IS NOT NULL) AS recovered_at,
         CASE WHEN NOT EXISTS (SELECT 1 FROM incidents open
                               WHERE open.alert_group_key = g.group_key AND open.resolved_at IS NULL)
              THEN 1 ELSE 0 END AS is_recovery,
         sample.code, sample.publication_id, substr(sample.details, 1, 1200) AS details,
         substr(r.title, 1, 120) AS post_title, d.title AS channel_title
  FROM incident_alert_groups g INDEXED BY incident_alert_groups_due_idx
  JOIN incidents sample ON sample.id = (
    SELECT recent.id FROM incidents recent
    WHERE recent.alert_group_key = g.group_key
    ORDER BY recent.created_at DESC, recent.id DESC LIMIT 1
  )
  LEFT JOIN publications p ON p.id = sample.publication_id
  LEFT JOIN post_revisions r ON r.post_id = p.post_id AND r.revision = p.post_revision
  LEFT JOIN destinations d ON d.id = p.destination_id
  WHERE (EXISTS (SELECT 1 FROM incidents open
                 WHERE open.alert_group_key = g.group_key AND open.resolved_at IS NULL) AND
         (g.last_alert_claimed_at IS NULL OR
          (g.last_seen_at > g.last_alert_claimed_at AND g.last_alert_claimed_at <= ?1 - 900000)))
     OR (NOT EXISTS (SELECT 1 FROM incidents open
                     WHERE open.alert_group_key = g.group_key AND open.resolved_at IS NULL)
         AND g.alert_succeeded_at IS NOT NULL AND g.recovery_claimed_at IS NULL)
  -- Oldest first across severity and recovery so the bounded per-tick page cannot starve older groups.
  ORDER BY g.first_seen_at, g.group_key LIMIT ?2`;

export const PURGE_OWNER_INCIDENT_ALERT_GROUPS_SQL = `DELETE FROM incident_alert_groups
  WHERE recovery_claimed_at IS NOT NULL
    AND group_key IN (
      SELECT group_key FROM incident_alert_groups INDEXED BY incident_alert_groups_recovery_idx
      WHERE recovery_claimed_at IS NOT NULL
      ORDER BY recovery_claimed_at, group_key LIMIT ?1
    )`;

export function createD1DispatchRepository(
  db: D1Database,
  onSchemaBehind: () => void = () => undefined
): DispatchRepository {
  // Per repository, so per tick: the first «no such column» switches the rest of this tick to the old statements.
  let schema: Schema = 'current';
  const fellBehind = (error: unknown) => {
    if (schema === 'v0' || !(error instanceof Error) || !SCHEMA_BEHIND.test(error.message)) return false;
    schema = 'v0';
    onSchemaBehind();
    return true;
  };
  const behind = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      if (!fellBehind(error)) throw error;
      return run();
    }
  };
  return {
    schemaBehind: () => schema === 'v0',

    async findDueJobIds(now, limit) {
      const { results } = await behind(() =>
        db
          .prepare(schema === 'current' ? DUE_JOBS_SQL : DUE_JOBS_SQL_V0)
          .bind(now, limit)
          .all<{ id: string }>()
      );
      return results.map((row) => row.id);
    },

    async claim(jobId, now, leaseUntil): Promise<ClaimedJob | null> {
      const result = await behind(() =>
        db
          .prepare(claimSql(schema === 'current'))
          .bind(leaseUntil, now, jobId)
          .all<ClaimRow>()
      );
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
      const results = await behind(() =>
        db.batch(resolutionStatements(db, resolution, attemptGuard(resolution.jobId, resolution.attempt), schema))
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

    // One batch: each statement re-checks the deadline and the job update comes last, so a job claimed or moved
    // meanwhile is left alone. The publication's revision moves as on an owner's cancel: a stale edit is refused.
    async cancelLateJobs(now, limit) {
      if (schema === 'v0') return [];
      let ids: string[];
      try {
        ids = (await db.prepare(LATE_JOBS_SQL).bind(now, limit).all<{ id: string }>()).results.map((row) => row.id);
      } catch (error) {
        if (fellBehind(error)) return [];
        throw error;
      }
      if (ids.length === 0) return [];
      const late = `SELECT id FROM jobs WHERE id IN (SELECT value FROM json_each(?1))
        AND status IN ('pending', 'retry_wait') AND not_after < ?2`;
      const list = JSON.stringify(ids);
      const results = await db.batch([
        db
          .prepare(
            `UPDATE publications SET last_error_code = 'NOT_AFTER_PASSED', revision = revision + 1, updated_at = ?2
             WHERE id IN (SELECT publication_id FROM jobs WHERE id IN (${late}))`
          )
          .bind(list, now),
        db
          .prepare(
            `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
             SELECT 'system', 'job.expired', CASE WHEN publication_id IS NULL THEN 'job' ELSE 'publication' END,
                    coalesce(publication_id, id), ?2, json_object('jobId', id, 'code', 'NOT_AFTER_PASSED')
             FROM jobs WHERE id IN (${late})`
          )
          .bind(list, now),
        db
          .prepare(
            `UPDATE jobs SET status = 'cancelled', lease_until = NULL, updated_at = ?2
             WHERE id IN (${late}) RETURNING id, publication_id`
          )
          .bind(list, now)
      ]);
      return (results.at(-1)?.results ?? []).map((row) => {
        const late = row as { id: string; publication_id: string | null };
        return { jobId: late.id, publicationId: late.publication_id };
      });
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
      const statements = () =>
        items.map(({ resolution, sendStarted }) =>
          resolutionStatements(
            db,
            resolution,
            expiredGuard(resolution.jobId, resolution.attempt, now, sendStarted),
            schema
          )
        );
      let groups = statements();
      const results = await behind(() => {
        groups = statements();
        return db.batch(groups.flat());
      });
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

    async listOwnerIncidentAlertGroups(now, limit): Promise<OwnerIncidentAlertGroup[]> {
      const { results } = await db.prepare(OWNER_INCIDENT_ALERT_GROUPS_SQL).bind(now, limit).all<{
        group_key: string;
        kind: 'publish_failed' | 'publish_unknown';
        first_seen_at: number;
        last_seen_at: number;
        occurrence_count: number;
        recovery_claimed_at: number | null;
        recovered_at: number | null;
        is_recovery: number;
        code: string;
        publication_id: string | null;
        details: string | null;
        post_title: string | null;
        channel_title: string | null;
      }>();
      return results.map((row) => ({
        groupKey: row.group_key,
        kind: row.kind,
        code: row.code,
        publicationId: row.publication_id,
        postTitle: row.post_title,
        channelTitle: row.channel_title,
        detail: incidentDetail(row.details),
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        occurrenceCount: row.occurrence_count,
        recovery: row.is_recovery === 1,
        recoveredAt: row.recovered_at
      }));
    },

    async purgeOwnerIncidentAlertGroups(limit) {
      const result = await db.prepare(PURGE_OWNER_INCIDENT_ALERT_GROUPS_SQL).bind(limit).run();
      return result.meta.changes;
    },

    async claimOwnerIncidentAlertGroup(groupKey, now, recovery) {
      const claim = recovery
        ? db
            .prepare(
              `UPDATE incident_alert_groups SET recovery_claimed_at = ?1
               WHERE group_key = ?2 AND recovery_claimed_at IS NULL AND alert_succeeded_at IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM incidents WHERE alert_group_key = ?2 AND resolved_at IS NULL)`
            )
            .bind(now, groupKey)
        : db
            .prepare(
              `UPDATE incident_alert_groups SET last_alert_claimed_at = ?1
               WHERE group_key = ?2
                 AND (last_alert_claimed_at IS NULL OR
                      (last_seen_at > last_alert_claimed_at AND last_alert_claimed_at <= ?1 - 900000))
                 AND EXISTS (SELECT 1 FROM incidents WHERE alert_group_key = ?2 AND resolved_at IS NULL)`
            )
            .bind(now, groupKey);
      const results = await db.batch([
        claim,
        ...(recovery
          ? []
          : [
              db
                .prepare(
                  `UPDATE incidents SET owner_notified_at = ?1
                   WHERE alert_group_key = ?2 AND resolved_at IS NULL AND owner_notified_at IS NULL
                     AND changes() = 1`
                )
                .bind(now, groupKey)
            ])
      ]);
      return results[0]?.meta.changes === 1;
    },

    async markOwnerIncidentAlertSent(groupKey, sentAt) {
      await db
        .prepare(
          `UPDATE incident_alert_groups SET alert_succeeded_at = ?2
           WHERE group_key = ?1 AND recovery_claimed_at IS NULL AND last_alert_claimed_at IS NOT NULL`
        )
        .bind(groupKey, sentAt)
        .run();
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
