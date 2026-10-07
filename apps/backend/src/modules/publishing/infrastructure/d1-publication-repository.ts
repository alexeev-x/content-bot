import { completeIdempotencyStatement, ownsClaimSql } from '../../../platform/idempotency/d1-idempotency-store';
import type { PublicationStatus } from '@alexeev/contracts';
import type {
  ListPublicationsQuery,
  PostPublicationSummary,
  PublicationChangeOutcome,
  PublicationRecord,
  PublicationRepository,
  RangeSummary,
  UpcomingPublication
} from '../application/ports';
import { type JobState, projectPublicationStatus } from '../domain/status-projection';
import { jobConditionForStatus } from './publication-status-sql';

interface PublicationRow {
  id: string;
  post_id: string;
  post_revision: number;
  destination_id: string;
  scheduled_at: number;
  timezone: string;
  revision: number;
  external_message_id: string | null;
  last_error_code: string | null;
  created_at: number;
  updated_at: number;
  job_status: JobState;
  job_run_at: number;
  job_send_started_at: number | null;
}

const PUBLICATION_COLUMNS = `p.id, p.post_id, p.post_revision, p.destination_id, p.scheduled_at, p.timezone,
  p.revision, p.external_message_id, p.last_error_code, p.created_at, p.updated_at,
  j.status AS job_status, j.run_at AS job_run_at, j.send_started_at AS job_send_started_at`;
// CROSS JOIN pins SQLite's order: the left table is walked through its keyset index and the other
// one is looked up by key, instead of scanning one side and sorting.
const FROM_PUBLICATIONS = `FROM publications p CROSS JOIN jobs j ON j.publication_id = p.id AND j.kind = 'publish'`;
const FROM_JOBS = `FROM jobs j CROSS JOIN publications p ON p.id = j.publication_id`;

function toRecord(row: PublicationRow): PublicationRecord {
  return {
    id: row.id,
    postId: row.post_id,
    postRevision: row.post_revision,
    destinationId: row.destination_id,
    scheduledAt: row.scheduled_at,
    timezone: row.timezone,
    revision: row.revision,
    externalMessageId: row.external_message_id,
    lastErrorCode: row.last_error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    job: { status: row.job_status, runAt: row.job_run_at, sendStartedAt: row.job_send_started_at }
  };
}

// Latest scheduledAt first. Every list is bounded by what its filter selects, not by the history:
// - a status filter walks jobs_status_scheduled_idx, which holds only rows of that status, and
//   checks post or destination after the primary-key join (a rare status such as `unknown` never
//   reads the sent history, however many publications one channel holds);
// - `sent` with a post or destination is the exception: it is the one status that grows with the
//   whole history, so walking all sent jobs to find a quiet destination's few rows is unbounded,
//   while publications_post_idx / publications_destination_idx reach a page of mostly-sent rows;
// - post or destination alone use their own indexes; no filter uses publications_scheduled_idx.
// Both orders are (scheduledAt, publication id) DESC, so one cursor fits all. Only constant
// fragments are joined; every value is bound.
export function listPublicationsSql(query: ListPublicationsQuery): { sql: string; bindings: (string | number)[] } {
  const byJobs =
    query.status !== undefined &&
    !(query.status === 'sent' && (query.postId !== undefined || query.destinationId !== undefined));
  const scheduledAt = byJobs ? 'j.publication_scheduled_at' : 'p.scheduled_at';
  const id = byJobs ? 'j.publication_id' : 'p.id';
  const conditions: string[] = byJobs ? ["j.kind = 'publish'"] : [];
  const bindings: (string | number)[] = [];
  if (query.postId !== undefined) {
    conditions.push('p.post_id = ?');
    bindings.push(query.postId);
  }
  if (query.destinationId !== undefined) {
    conditions.push('p.destination_id = ?');
    bindings.push(query.destinationId);
  }
  if (query.q !== undefined) {
    conditions.push(
      "EXISTS (SELECT 1 FROM posts search_post WHERE search_post.id = p.post_id AND (instr(lower(search_post.title), lower(?)) > 0 OR instr(lower(search_post.body), lower(?)) > 0))"
    );
    bindings.push(query.q, query.q);
  }
  if (query.status !== undefined) {
    const condition = jobConditionForStatus(query.status);
    conditions.push(condition.sql);
    if (condition.usesNow) bindings.push(query.now);
  }
  if (query.from !== undefined) {
    conditions.push(`${scheduledAt} >= ?`);
    bindings.push(query.from);
  }
  if (query.to !== undefined) {
    conditions.push(`${scheduledAt} < ?`);
    bindings.push(query.to);
  }
  const order = query.order ?? 'desc';
  if (query.after !== undefined) {
    const comparison = order === 'asc' ? '>' : '<';
    conditions.push(
      `${scheduledAt} ${order === 'asc' ? '>=' : '<='} ?`,
      `(${scheduledAt} ${comparison} ? OR ${id} ${comparison} ?)`
    );
    bindings.push(query.after.scheduledAt, query.after.scheduledAt, query.after.id);
  }
  bindings.push(query.limit);
  const where = conditions.length === 0 ? '' : ` WHERE ${conditions.join(' AND ')}`;
  const direction = order === 'asc' ? 'ASC' : 'DESC';
  return {
    sql: `SELECT ${PUBLICATION_COLUMNS} ${byJobs ? FROM_JOBS : FROM_PUBLICATIONS}${where} ORDER BY ${scheduledAt} ${direction}, ${id} ${direction} LIMIT ?`,
    bindings
  };
}

interface SummaryRow {
  post_id: string;
  destination_id: string;
  destination_title: string;
  job_status: JobState;
  in_future: number | null;
  not_started: number | null;
  n: number;
  first_scheduled_at: number;
  last_update: number;
}

// One group per post, destination and job state. `in_future` / `not_started` are set only where the
// projection looks at them (pending / claimed), so they split no other group. The post ids come as one
// JSON array: a single bound parameter however many posts the page holds (D1 allows 100 per statement).
export const SUMMARY_SQL = `
  SELECT p.post_id AS post_id, p.destination_id AS destination_id, d.title AS destination_title,
         j.status AS job_status,
         CASE WHEN j.status = 'pending' THEN j.run_at > ?2 END AS in_future,
         CASE WHEN j.status = 'claimed' THEN j.send_started_at IS NULL END AS not_started,
         count(*) AS n, min(p.scheduled_at) AS first_scheduled_at, max(j.updated_at) AS last_update
  FROM publications p
  JOIN jobs j ON j.publication_id = p.id AND j.kind = 'publish'
  JOIN destinations d ON d.id = p.destination_id
  WHERE p.post_id IN (SELECT value FROM json_each(?1))
  GROUP BY p.post_id, p.destination_id, j.status, in_future, not_started`;

const WAITING: readonly PublicationStatus[] = ['scheduled', 'queued', 'retry_wait'];
const NOT_DELIVERED: readonly PublicationStatus[] = ['failed', 'cancelled'];

function emptyCounts(): Record<PublicationStatus, number> {
  return {
    scheduled: 0,
    queued: 0,
    preparing: 0,
    sending: 0,
    sent: 0,
    retry_wait: 0,
    failed: 0,
    unknown: 0,
    cancelled: 0
  };
}

export function summarizeRows(rows: readonly SummaryRow[], now: number): Map<string, PostPublicationSummary> {
  const summaries = new Map<string, PostPublicationSummary>();
  const destinations = new Map<string, Map<string, string>>();
  for (const row of rows) {
    // Only whether the run time is after `now`, and whether the send mark is set, matter to the projection.
    const status = projectPublicationStatus(
      {
        status: row.job_status,
        runAt: row.in_future === 1 ? now + 1 : now,
        sendStartedAt: row.not_started === 1 ? null : now
      },
      now
    );
    let summary = summaries.get(row.post_id);
    if (summary === undefined) {
      summary = { counts: emptyCounts(), nextScheduled: null, lastSentAt: null, destinations: [] };
      summaries.set(row.post_id, summary);
      destinations.set(row.post_id, new Map());
    }
    summary.counts[status] += row.n;
    if (WAITING.includes(status)) {
      const next = summary.nextScheduled;
      if (
        next === null ||
        row.first_scheduled_at < next.scheduledAt ||
        (row.first_scheduled_at === next.scheduledAt && row.destination_id < next.destinationId)
      ) {
        summary.nextScheduled = { scheduledAt: row.first_scheduled_at, destinationId: row.destination_id };
      }
    }
    if (status === 'sent' && (summary.lastSentAt === null || row.last_update > summary.lastSentAt)) {
      summary.lastSentAt = row.last_update;
    }
    if (!NOT_DELIVERED.includes(status)) destinations.get(row.post_id)?.set(row.destination_id, row.destination_title);
  }
  for (const [postId, summary] of summaries) {
    summary.destinations = [...(destinations.get(postId) ?? [])]
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  }
  return summaries;
}

// The next jobs to run. Like the due scan, each branch repeats the partial index predicate and seeks
// one status, so both walk jobs_due in (run_at, id) order and stop after `limit` rows; the outer query
// merges at most 2 x limit rows. Joined to the publication and its channel by primary key afterwards.
const UPCOMING_BRANCH = (status: string) => `SELECT id, run_at, publication_id FROM jobs
    WHERE status IN ('pending', 'retry_wait') AND status = '${status}' AND kind = 'publish'
    ORDER BY run_at, id LIMIT ?1`;

export const UPCOMING_SQL = `
  WITH next_jobs AS (
    SELECT id, run_at, publication_id FROM (
      SELECT id, run_at, publication_id FROM (${UPCOMING_BRANCH('pending')})
      UNION ALL
      SELECT id, run_at, publication_id FROM (${UPCOMING_BRANCH('retry_wait')})
    ) ORDER BY run_at, id LIMIT ?1
  )
  SELECT p.id AS id, p.post_id AS post_id, p.post_revision AS post_revision, p.scheduled_at AS scheduled_at,
         p.timezone AS timezone, d.title AS destination_title
  FROM next_jobs n
  JOIN publications p ON p.id = n.publication_id
  JOIN destinations d ON d.id = p.destination_id
  ORDER BY n.run_at, n.id`;

interface UpcomingRow {
  id: string;
  post_id: string;
  post_revision: number;
  scheduled_at: number;
  timezone: string;
  destination_title: string;
}

/** One day of publications is far below this; the cap only bounds the read if something goes wrong. */
export const RANGE_SUMMARY_ROWS = 500;

// The same grouping as SUMMARY_SQL, over the publications scheduled in a range: publications_scheduled_idx
// gives the range in order and the inner LIMIT bounds what is read.
export const RANGE_SUMMARY_SQL = `
  SELECT status AS job_status, in_future, not_started, count(*) AS n, min(scheduled_at) AS first_scheduled_at
  FROM (
    SELECT j.status AS status,
           CASE WHEN j.status = 'pending' THEN j.run_at > ?3 END AS in_future,
           CASE WHEN j.status = 'claimed' THEN j.send_started_at IS NULL END AS not_started,
           p.scheduled_at AS scheduled_at
    FROM publications p CROSS JOIN jobs j ON j.publication_id = p.id AND j.kind = 'publish'
    WHERE p.scheduled_at >= ?1 AND p.scheduled_at < ?2
    ORDER BY p.scheduled_at DESC LIMIT ${RANGE_SUMMARY_ROWS}
  )
  GROUP BY status, in_future, not_started`;

interface RangeRow {
  job_status: JobState;
  in_future: number | null;
  not_started: number | null;
  n: number;
  first_scheduled_at: number;
}

export function summarizeRangeRows(rows: readonly RangeRow[], now: number): RangeSummary {
  const counts = emptyCounts();
  let nextWaitingAt: number | null = null;
  for (const row of rows) {
    const status = projectPublicationStatus(
      {
        status: row.job_status,
        runAt: row.in_future === 1 ? now + 1 : now,
        sendStartedAt: row.not_started === 1 ? null : now
      },
      now
    );
    counts[status] += row.n;
    if (WAITING.includes(status) && (nextWaitingAt === null || row.first_scheduled_at < nextWaitingAt)) {
      nextWaitingAt = row.first_scheduled_at;
    }
  }
  return { counts, nextWaitingAt };
}

export function createD1PublicationRepository(db: D1Database): PublicationRepository {
  const selectOne = (id: string) =>
    db.prepare(`SELECT ${PUBLICATION_COLUMNS} ${FROM_PUBLICATIONS} WHERE p.id = ?1`).bind(id);

  // The job statement runs first and decides, with the publication revision in its guard evaluated
  // before anything in the batch has changed. The next statement bumps the revision only when the
  // job statement changed a row (`changes()` is that statement's count), and so does the audit row
  // after it; the statements in `after` follow the audit row, whose count is 1 exactly when the change
  // applied. Reordering these statements breaks that chain. The last statement reads the result
  // inside the same batch, so a refusal can be explained from the state it was decided on.
  async function changeJob(args: {
    id: string;
    expectedRevision: number;
    actor: string;
    now: number;
    action: 'publication.reschedule' | 'publication.cancel' | 'publication.resolve_unknown';
    jobStatement: D1PreparedStatement;
    /** Extra columns for the publication row; `sql` ends with a comma and numbers from ?4. */
    publicationSet: { sql: string; bindings: (string | number)[] };
    /** Metadata for the audit row next to the new revision; never message text. */
    auditDetails?: Record<string, string | number>;
    /** Run only when the change applied, after the audit row. Must not end in another statement's count. */
    after?: D1PreparedStatement[];
  }): Promise<PublicationChangeOutcome> {
    const { id, expectedRevision, actor, now, action } = args;
    const results = await db.batch<PublicationRow>([
      args.jobStatement,
      db
        .prepare(
          `UPDATE publications SET ${args.publicationSet.sql} revision = revision + 1, updated_at = ?3
           WHERE id = ?1 AND revision = ?2 AND changes() = 1`
        )
        .bind(id, expectedRevision, now, ...args.publicationSet.bindings),
      db
        .prepare(
          `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
           SELECT ?1, ?2, 'publication', ?3, ?4, ?5 WHERE changes() = 1`
        )
        .bind(actor, action, id, now, JSON.stringify({ revision: expectedRevision + 1, ...args.auditDetails })),
      ...(args.after ?? []),
      selectOne(id)
    ]);
    const row = results.at(-1)?.results[0];
    // The job statement decides; the publication statement's own count is not used because the
    // scheduled_at trigger adds its job update to the count D1 reports for it.
    return { applied: results[0]?.meta.changes === 1, current: row === undefined ? null : toRecord(row) };
  }

  return {
    async create(input) {
      const claim = [
        input.idempotency.scope,
        input.idempotency.key,
        input.idempotency.requestHash,
        input.idempotency.claimedAt
      ];
      const results = await db.batch([
        // The guards run in the same statement as the insert: a post or destination that changed
        // after the use case read it makes this write nothing. Every later statement keys off the
        // publication row, so it is all-or-nothing.
        db
          .prepare(
            `INSERT INTO publications
               (id, post_id, post_revision, destination_id, scheduled_at, timezone, revision, created_at, updated_at)
             SELECT ?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?7
             WHERE ${ownsClaimSql(8)}
               AND EXISTS (SELECT 1 FROM posts WHERE id = ?2 AND revision = ?3 AND status = 'approved' AND archived_at IS NULL)
               AND EXISTS (SELECT 1 FROM destinations WHERE id = ?4 AND enabled = 1)`
          )
          .bind(
            input.id,
            input.postId,
            input.postRevision,
            input.destinationId,
            input.scheduledAt,
            input.timezone,
            input.now,
            ...claim
          ),
        db
          .prepare(
            `INSERT INTO jobs (id, kind, publication_id, status, run_at, attempts, dedupe_key, publication_scheduled_at, created_at, updated_at)
             SELECT ?1, 'publish', ?2, 'pending', ?3, 0, ?4, ?3, ?5, ?5
             WHERE EXISTS (SELECT 1 FROM publications WHERE id = ?2)`
          )
          .bind(input.jobId, input.id, input.scheduledAt, `publish:${input.id}`, input.now),
        db
          .prepare(
            `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
             SELECT ?1, 'publication.create', 'publication', ?2, ?3, ?4
             WHERE EXISTS (SELECT 1 FROM publications WHERE id = ?2)`
          )
          .bind(
            input.actor,
            input.id,
            input.now,
            JSON.stringify({
              postId: input.postId,
              postRevision: input.postRevision,
              destinationId: input.destinationId
            })
          ),
        completeIdempotencyStatement(db, input.idempotency, input.response, input.now, {
          sql: 'EXISTS (SELECT 1 FROM publications WHERE id = ?8)',
          bindings: [input.id]
        })
      ]);
      return results[0]?.meta.changes === 1;
    },

    async findById(id) {
      const row = await selectOne(id).first<PublicationRow>();
      return row === null ? null : toRecord(row);
    },

    async list(query) {
      const { sql, bindings } = listPublicationsSql(query);
      const { results } = await db
        .prepare(sql)
        .bind(...bindings)
        .all<PublicationRow>();
      return results.map(toRecord);
    },

    async summarizeByPost(postIds, now) {
      if (postIds.length === 0) return new Map();
      const { results } = await db.prepare(SUMMARY_SQL).bind(JSON.stringify(postIds), now).all<SummaryRow>();
      return summarizeRows(results, now);
    },

    async listUpcoming(limit) {
      const { results } = await db.prepare(UPCOMING_SQL).bind(limit).all<UpcomingRow>();
      return results.map((row): UpcomingPublication => ({
        id: row.id,
        postId: row.post_id,
        postRevision: row.post_revision,
        destinationTitle: row.destination_title,
        scheduledAt: row.scheduled_at,
        timezone: row.timezone
      }));
    },

    async summarizeRange({ from, to, now }) {
      const { results } = await db.prepare(RANGE_SUMMARY_SQL).bind(from, to, now).all<RangeRow>();
      return summarizeRangeRows(results, now);
    },

    reschedule(change) {
      return changeJob({
        ...change,
        action: 'publication.reschedule',
        // A job waiting for a retry becomes a plain scheduled one: the owner picked a new time.
        // The claim SQL only takes pending/retry_wait jobs, so a claimed job is never matched here.
        jobStatement: db
          .prepare(
            `UPDATE jobs SET status = 'pending', run_at = ?3, lease_until = NULL, updated_at = ?4
             WHERE publication_id = ?1 AND kind = 'publish' AND status IN ('pending', 'retry_wait')
               AND EXISTS (SELECT 1 FROM publications WHERE id = ?1 AND revision = ?2)`
          )
          .bind(change.id, change.expectedRevision, change.scheduledAt, change.now),
        publicationSet: { sql: 'scheduled_at = ?4, timezone = ?5,', bindings: [change.scheduledAt, change.timezone] }
      });
    },

    cancel(change) {
      return changeJob({
        ...change,
        action: 'publication.cancel',
        jobStatement: db
          .prepare(
            `UPDATE jobs SET status = 'cancelled', lease_until = NULL, updated_at = ?3
             WHERE publication_id = ?1 AND kind = 'publish' AND status IN ('pending', 'retry_wait')
               AND EXISTS (SELECT 1 FROM publications WHERE id = ?1 AND revision = ?2)`
          )
          .bind(change.id, change.expectedRevision, change.now),
        publicationSet: { sql: '', bindings: [] }
      });
    },

    resolveUnknown(change) {
      const { resolution } = change;
      const jobGuard = `publication_id = ?1 AND kind = 'publish' AND status = 'unknown'
               AND EXISTS (SELECT 1 FROM publications WHERE id = ?1 AND revision = ?2)`;
      const common = {
        id: change.id,
        expectedRevision: change.expectedRevision,
        actor: change.actor,
        now: change.now,
        action: 'publication.resolve_unknown' as const,
        // After the audit row, so `changes() = 1` still means "the change applied". `max` keeps the
        // `resolved_at >= created_at` check true if the clocks of two isolates disagree.
        after: [
          db
            .prepare(
              `UPDATE incidents SET resolved_at = max(created_at, ?2)
               WHERE job_id = (SELECT id FROM jobs WHERE publication_id = ?1 AND kind = 'publish')
                 AND resolved_at IS NULL AND changes() = 1`
            )
            .bind(change.id, change.now)
        ]
      };
      // `send_started_at` stays as evidence for `sent` and `cancel`; a resend clears it because the
      // owner saw the message is not in the channel, and the next claim must be able to set it again.
      // `attempts` is never reset: job_attempts is keyed by it, so the next claim adds a row.
      switch (resolution.outcome) {
        case 'sent':
          return changeJob({
            ...common,
            jobStatement: db
              .prepare(`UPDATE jobs SET status = 'succeeded', lease_until = NULL, updated_at = ?3 WHERE ${jobGuard}`)
              .bind(change.id, change.expectedRevision, change.now),
            publicationSet: {
              sql: 'external_message_id = ?4, last_error_code = NULL,',
              bindings: [resolution.externalMessageId]
            },
            auditDetails: { outcome: 'sent', externalMessageId: resolution.externalMessageId }
          });
        case 'resend':
          return changeJob({
            ...common,
            jobStatement: db
              .prepare(
                `UPDATE jobs SET status = 'pending', run_at = ?3, lease_until = NULL, send_started_at = NULL,
                   updated_at = ?4 WHERE ${jobGuard}`
              )
              .bind(change.id, change.expectedRevision, resolution.scheduledAt, change.now),
            publicationSet: {
              sql: 'scheduled_at = ?4, timezone = ?5, last_error_code = NULL,',
              bindings: [resolution.scheduledAt, resolution.timezone]
            },
            auditDetails: { outcome: 'resend', scheduledAt: resolution.scheduledAt, timezone: resolution.timezone }
          });
        case 'cancel':
          return changeJob({
            ...common,
            jobStatement: db
              .prepare(`UPDATE jobs SET status = 'cancelled', lease_until = NULL, updated_at = ?3 WHERE ${jobGuard}`)
              .bind(change.id, change.expectedRevision, change.now),
            publicationSet: { sql: '', bindings: [] },
            auditDetails: { outcome: 'cancel' }
          });
      }
    }
  };
}
