import { completeIdempotencyStatement, ownsClaimSql } from '../../../platform/idempotency/d1-idempotency-store';
import type {
  ListPublicationsQuery,
  PublicationChangeOutcome,
  PublicationRecord,
  PublicationRepository
} from '../application/ports';
import type { JobState } from '../domain/status-projection';
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
  if (query.status !== undefined) {
    const condition = jobConditionForStatus(query.status);
    conditions.push(condition.sql);
    if (condition.usesNow) bindings.push(query.now);
  }
  if (query.after !== undefined) {
    // The leading range lets the index seek straight to the cursor; the OR only breaks ties among
    // rows that share the cursor's timestamp.
    conditions.push(`${scheduledAt} <= ?`, `(${scheduledAt} < ? OR ${id} < ?)`);
    bindings.push(query.after.scheduledAt, query.after.scheduledAt, query.after.id);
  }
  bindings.push(query.limit);
  const where = conditions.length === 0 ? '' : ` WHERE ${conditions.join(' AND ')}`;
  return {
    sql: `SELECT ${PUBLICATION_COLUMNS} ${byJobs ? FROM_JOBS : FROM_PUBLICATIONS}${where} ORDER BY ${scheduledAt} DESC, ${id} DESC LIMIT ?`,
    bindings
  };
}

export function createD1PublicationRepository(db: D1Database): PublicationRepository {
  const selectOne = (id: string) =>
    db.prepare(`SELECT ${PUBLICATION_COLUMNS} ${FROM_PUBLICATIONS} WHERE p.id = ?1`).bind(id);

  // The job statement runs first and decides, with the publication revision in its guard evaluated
  // before anything in the batch has changed. The next statement bumps the revision only when the
  // job statement changed a row (`changes()` is that statement's count), and so does the audit row
  // after it. Reordering these statements breaks that chain. The last statement reads the result
  // inside the same batch, so a refusal can be explained from the state it was decided on.
  async function changeJob(args: {
    id: string;
    expectedRevision: number;
    actor: string;
    now: number;
    action: 'publication.reschedule' | 'publication.cancel';
    jobStatement: D1PreparedStatement;
    /** Extra columns for the publication row; `sql` ends with a comma and numbers from ?4. */
    publicationSet: { sql: string; bindings: (string | number)[] };
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
        .bind(actor, action, id, now, JSON.stringify({ revision: expectedRevision + 1 })),
      selectOne(id)
    ]);
    const row = results[3]?.results[0];
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
               AND EXISTS (SELECT 1 FROM posts WHERE id = ?2 AND revision = ?3 AND status = 'approved')
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
    }
  };
}
