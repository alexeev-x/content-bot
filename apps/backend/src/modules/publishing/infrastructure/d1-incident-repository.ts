import { OPEN_INCIDENT_COUNT_CAP } from '@alexeev/contracts';
import type { IncidentRecord, IncidentRepository, ListIncidentsQuery } from '../application/ports';
import type { JobState } from '../domain/status-projection';
import { TITLE_MAX_CHARS } from './d1-dashboard-repository';

/** job_attempts of one job are a handful; the probe only bounds the read if something goes wrong. */
const ATTEMPT_COUNT_PROBE = 50;

interface IncidentRow {
  id: string;
  kind: 'publish_failed' | 'publish_unknown';
  code: string;
  created_at: number;
  resolved_at: number | null;
  job_id: string | null;
  attempt_count: number;
  publication_id: string | null;
  scheduled_at: number | null;
  post_title: string | null;
  destination_name: string | null;
  job_status: JobState | null;
  job_run_at: number | null;
  job_send_started_at: number | null;
}

// Never `details`: it is metadata for people reading D1, not part of any response. The publication is
// joined by key from the few rows the incident index yields (LEFT keeps the incident when it has none),
// and the attempt count is a correlated count bounded by the job's primary key prefix.
const INCIDENT_FROM = `
  SELECT i.id AS id, i.kind AS kind, i.code AS code, i.created_at AS created_at, i.resolved_at AS resolved_at,
         i.job_id AS job_id,
         (SELECT count(*) FROM (SELECT 1 FROM job_attempts a WHERE a.job_id = i.job_id LIMIT ${ATTEMPT_COUNT_PROBE})) AS attempt_count,
         p.id AS publication_id, p.scheduled_at AS scheduled_at,
         substr(r.title, 1, ${TITLE_MAX_CHARS}) AS post_title, d.title AS destination_name,
         j.status AS job_status, j.run_at AS job_run_at, j.send_started_at AS job_send_started_at
  FROM incidents i
  LEFT JOIN publications p ON p.id = i.publication_id
  LEFT JOIN jobs j ON j.publication_id = p.id AND j.kind = 'publish'
  LEFT JOIN post_revisions r ON r.post_id = p.post_id AND r.revision = p.post_revision
  LEFT JOIN destinations d ON d.id = p.destination_id`;

function toRecord(row: IncidentRow): IncidentRecord {
  const { publication_id, scheduled_at, post_title, destination_name, job_status, job_run_at } = row;
  return {
    id: row.id,
    kind: row.kind,
    code: row.code,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    jobId: row.job_id,
    attemptCount: row.attempt_count,
    publication:
      publication_id !== null &&
      scheduled_at !== null &&
      post_title !== null &&
      destination_name !== null &&
      job_status !== null &&
      job_run_at !== null
        ? {
            id: publication_id,
            scheduledAt: scheduled_at,
            postTitle: post_title,
            destinationName: destination_name,
            job: { status: job_status, runAt: job_run_at, sendStartedAt: row.job_send_started_at }
          }
        : null
  };
}

// Open incidents walk incidents_open_idx (created_at, id) and the resolved history incidents_resolved_idx
// (resolved_at, id), or incidents_resolved_kind_idx when a kind is given. Each partial index repeats
// its predicate here, so SQLite may use it; the page stops after LIMIT rows. Only constant fragments
// are joined; every value is bound.
export function listIncidentsSql(query: ListIncidentsQuery): { sql: string; bindings: (string | number)[] } {
  const open = query.state === 'open';
  const at = open ? 'i.created_at' : 'i.resolved_at';
  const conditions = [open ? 'i.resolved_at IS NULL' : 'i.resolved_at IS NOT NULL'];
  const bindings: (string | number)[] = [];
  if (query.kind !== undefined) {
    conditions.push('i.kind = ?');
    bindings.push(query.kind);
  }
  if (query.after !== undefined) {
    // The leading range lets the index seek to the cursor; the OR only splits ties on the timestamp.
    conditions.push(`${at} <= ?`, `(${at} < ? OR i.id < ?)`);
    bindings.push(query.after.at, query.after.at, query.after.id);
  }
  bindings.push(query.limit);
  return {
    sql: `${INCIDENT_FROM} WHERE ${conditions.join(' AND ')} ORDER BY ${at} DESC, i.id DESC LIMIT ?`,
    bindings
  };
}

// Walks incidents_open_idx and stops at the cap.
export const OPEN_COUNT_SQL = `SELECT count(*) AS n FROM (SELECT 1 FROM incidents WHERE resolved_at IS NULL LIMIT ${OPEN_INCIDENT_COUNT_CAP})`;

export const INCIDENT_BY_ID_SQL = `${INCIDENT_FROM} WHERE i.id = ?1`;

export function createD1IncidentRepository(db: D1Database): IncidentRepository {
  return {
    async list(query) {
      const { sql, bindings } = listIncidentsSql(query);
      const [page, count] = await db.batch([db.prepare(sql).bind(...bindings), db.prepare(OPEN_COUNT_SQL)]);
      const rows = (page?.results ?? []) as IncidentRow[];
      const n = (count?.results[0] as { n: number } | undefined)?.n ?? 0;
      return { items: rows.map(toRecord), openCount: n };
    },

    // The guard is in the UPDATE itself: only an open `publish_failed` incident changes, and the
    // audit row exists only if that UPDATE changed a row (`changes()` is its count), so two presses
    // leave exactly one row of each. `max` keeps `resolved_at >= created_at` true when two isolates'
    // clocks disagree. The last statement reads the result inside the same batch, so a repeat is
    // answered with the row as it stands.
    async acknowledgeFailed({ id, actor, now }) {
      const results = await db.batch([
        db
          .prepare(
            `UPDATE incidents SET resolved_at = max(created_at, ?2)
             WHERE id = ?1 AND kind = 'publish_failed' AND resolved_at IS NULL`
          )
          .bind(id, now),
        db
          .prepare(
            `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
             SELECT ?2, 'incident.resolve', 'incident', ?1, ?3, json_object('code', code)
             FROM incidents WHERE id = ?1 AND changes() = 1`
          )
          .bind(id, actor, now),
        db.prepare(INCIDENT_BY_ID_SQL).bind(id)
      ]);
      const row = results[2]?.results[0] as IncidentRow | undefined;
      return row === undefined ? null : toRecord(row);
    }
  };
}
