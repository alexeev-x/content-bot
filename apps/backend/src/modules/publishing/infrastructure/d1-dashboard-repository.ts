import {
  DASHBOARD_ATTENTION_LIMIT,
  DASHBOARD_ATTENTION_TOTAL_CAP,
  DASHBOARD_RECENT_SENT_LIMIT,
  DASHBOARD_TODAY_LIMIT,
  DASHBOARD_TODAY_TOTAL_CAP,
  DASHBOARD_UPCOMING_LIMIT
} from '@alexeev/contracts';
import type {
  DashboardAttentionRow,
  DashboardPublicationRow,
  DashboardRepository,
  DashboardSentRow
} from '../application/ports';
import type { JobState } from '../domain/status-projection';

// Titles are cut here so a long one never travels further than D1; the post body is never selected.
export const TITLE_MAX_CHARS = 120;
// One more than the cap, so "99 or more" is known without a second read.
const COUNT_PROBE = DASHBOARD_ATTENTION_TOTAL_CAP + 1;

// What a publication row needs: its post title (by the approved revision it sends, a primary-key
// lookup) and the channel name. Both joins are by key, so no statement reads more than its LIMIT.
const TITLE_AND_CHANNEL = `
  JOIN post_revisions r ON r.post_id = p.post_id AND r.revision = p.post_revision
  JOIN destinations d ON d.id = p.destination_id`;
const PUBLICATION_COLUMNS = `p.id AS publication_id, p.scheduled_at AS scheduled_at,
  substr(r.title, 1, ${TITLE_MAX_CHARS}) AS post_title, d.title AS destination_name`;

// (a) Open incidents, `unknown` before `failed`, newest first. Each kind is its own bounded walk of
// incidents_open_idx that stops after the limit, and only those few rows are joined to their
// publication (LEFT: an incident without one is still shown). The open count rides on the rows.
export const ATTENTION_SQL = `
  WITH top AS (
    SELECT id, kind, code, created_at, publication_id FROM (
      SELECT id, kind, code, created_at, publication_id FROM incidents
      WHERE resolved_at IS NULL AND kind = 'publish_unknown'
      ORDER BY created_at DESC, id DESC LIMIT ${DASHBOARD_ATTENTION_LIMIT})
    UNION ALL
    SELECT id, kind, code, created_at, publication_id FROM (
      SELECT id, kind, code, created_at, publication_id FROM incidents
      WHERE resolved_at IS NULL AND kind = 'publish_failed'
      ORDER BY created_at DESC, id DESC LIMIT ${DASHBOARD_ATTENTION_LIMIT})
  )
  SELECT t.id AS incident_id, t.kind AS kind, t.code AS code, t.created_at AS created_at,
         p.id AS publication_id, p.scheduled_at AS scheduled_at,
         substr(r.title, 1, ${TITLE_MAX_CHARS}) AS post_title, d.title AS destination_name,
         j.status AS job_status, j.run_at AS job_run_at, j.send_started_at AS job_send_started_at,
         (SELECT count(*) FROM (SELECT 1 FROM incidents WHERE resolved_at IS NULL LIMIT ${COUNT_PROBE})) AS open_total
  FROM top t
  LEFT JOIN publications p ON p.id = t.publication_id
  LEFT JOIN jobs j ON j.publication_id = p.id AND j.kind = 'publish'
  LEFT JOIN post_revisions r ON r.post_id = p.post_id AND r.revision = p.post_revision
  LEFT JOIN destinations d ON d.id = p.destination_id
  ORDER BY (t.kind = 'publish_unknown') DESC, t.created_at DESC, t.id DESC
  LIMIT ${DASHBOARD_ATTENTION_LIMIT}`;

const DUE_PENDING = `FROM jobs WHERE status IN ('pending', 'retry_wait') AND status = 'pending' AND kind = 'publish'`;

// (b) Stuck: `scheduled`/`queued` publications whose time passed more than the threshold ago.
// The repeated status predicate lets SQLite walk the partial jobs_due index in run_at order.
export const STUCK_SQL = `
  WITH overdue AS (
    SELECT id, run_at, publication_id, status, send_started_at ${DUE_PENDING} AND run_at < ?1
    ORDER BY run_at, id LIMIT ${DASHBOARD_ATTENTION_LIMIT}
  )
  SELECT ${PUBLICATION_COLUMNS}, n.status AS job_status, n.run_at AS job_run_at,
         n.send_started_at AS job_send_started_at,
         (SELECT count(*) FROM (SELECT 1 ${DUE_PENDING} AND run_at < ?1 LIMIT ${COUNT_PROBE})) AS stuck_total
  FROM overdue n JOIN publications p ON p.id = n.publication_id ${TITLE_AND_CHANNEL}
  ORDER BY n.run_at, n.id`;

// (c) The owner's day: publications_scheduled_idx gives the range in order, the LIMIT stops it, and
// the total is a count over a bounded subquery. A cancelled publication is not going out, so it is
// left off the timeline.
export const TODAY_SQL = `
  SELECT ${PUBLICATION_COLUMNS}, j.status AS job_status, j.run_at AS job_run_at,
         j.send_started_at AS job_send_started_at,
         (SELECT count(*) FROM (
            SELECT 1 FROM publications p2 CROSS JOIN jobs j2 ON j2.publication_id = p2.id AND j2.kind = 'publish'
            WHERE p2.scheduled_at >= ?1 AND p2.scheduled_at < ?2 AND j2.status <> 'cancelled'
            LIMIT ${DASHBOARD_TODAY_TOTAL_CAP})) AS today_total
  FROM publications p CROSS JOIN jobs j ON j.publication_id = p.id AND j.kind = 'publish' ${TITLE_AND_CHANNEL}
  WHERE p.scheduled_at >= ?1 AND p.scheduled_at < ?2 AND j.status <> 'cancelled'
  ORDER BY p.scheduled_at, p.id
  LIMIT ${DASHBOARD_TODAY_LIMIT}`;

const UPCOMING_BRANCH = (status: string) => `SELECT id, run_at, publication_id, status, send_started_at FROM jobs
    WHERE status IN ('pending', 'retry_wait') AND status = '${status}' AND kind = 'publish' AND run_at >= ?1
    ORDER BY run_at, id LIMIT ${DASHBOARD_UPCOMING_LIMIT}`;

// (d) What goes out after today: the same two-branch walk of jobs_due as the bot's /next, from the
// end of the owner's day on, merged to the limit.
export const UPCOMING_FROM_SQL = `
  WITH next_jobs AS (
    SELECT id, run_at, publication_id, status, send_started_at FROM (
      SELECT id, run_at, publication_id, status, send_started_at FROM (${UPCOMING_BRANCH('pending')})
      UNION ALL
      SELECT id, run_at, publication_id, status, send_started_at FROM (${UPCOMING_BRANCH('retry_wait')})
    ) ORDER BY run_at, id LIMIT ${DASHBOARD_UPCOMING_LIMIT}
  )
  SELECT ${PUBLICATION_COLUMNS}, n.status AS job_status, n.run_at AS job_run_at,
         n.send_started_at AS job_send_started_at
  FROM next_jobs n JOIN publications p ON p.id = n.publication_id ${TITLE_AND_CHANNEL}
  ORDER BY n.run_at, n.id`;

// (e) The last sent: jobs_status_scheduled_idx holds the `succeeded` jobs latest-scheduled first, so
// the read is five rows however long the history is.
export const RECENT_SENT_SQL = `
  WITH last_sent AS (
    SELECT id, run_at, publication_id, status, send_started_at FROM jobs
    WHERE status = 'succeeded' AND kind = 'publish'
    ORDER BY publication_scheduled_at DESC, publication_id DESC LIMIT ${DASHBOARD_RECENT_SENT_LIMIT}
  )
  SELECT ${PUBLICATION_COLUMNS}, p.updated_at AS updated_at, p.external_message_id AS external_message_id,
         d.chat_id AS chat_id, n.status AS job_status, n.run_at AS job_run_at,
         n.send_started_at AS job_send_started_at
  FROM last_sent n JOIN publications p ON p.id = n.publication_id ${TITLE_AND_CHANNEL}
  ORDER BY p.scheduled_at DESC, p.id DESC`;

interface JobColumns {
  job_status: JobState | null;
  job_run_at: number | null;
  job_send_started_at: number | null;
}

interface PublicationColumns extends JobColumns {
  publication_id: string | null;
  scheduled_at: number | null;
  post_title: string | null;
  destination_name: string | null;
}

interface AttentionRow extends PublicationColumns {
  incident_id: string;
  kind: 'publish_failed' | 'publish_unknown';
  code: string;
  created_at: number;
  open_total: number;
}
interface StuckRow extends PublicationColumns {
  stuck_total: number;
}
interface TodayRow extends PublicationColumns {
  today_total: number;
}
interface SentRow extends PublicationColumns {
  updated_at: number;
  external_message_id: string | null;
  chat_id: string;
}

// The joins are inner everywhere except (a), where a missing publication is the only way a column is null.
function publicationOf(row: PublicationColumns): DashboardPublicationRow | null {
  if (
    row.publication_id === null ||
    row.scheduled_at === null ||
    row.post_title === null ||
    row.destination_name === null ||
    row.job_status === null ||
    row.job_run_at === null
  ) {
    return null;
  }
  return {
    publicationId: row.publication_id,
    scheduledAt: row.scheduled_at,
    postTitle: row.post_title,
    destinationName: row.destination_name,
    job: { status: row.job_status, runAt: row.job_run_at, sendStartedAt: row.job_send_started_at }
  };
}

function requirePublication(row: PublicationColumns): DashboardPublicationRow {
  const publication = publicationOf(row);
  if (publication === null) throw new Error('A dashboard row lost its publication');
  return publication;
}

export function createD1DashboardRepository(db: D1Database): DashboardRepository {
  return {
    async read({ from, to, stuckBefore }) {
      const [attention, stuck, today, upcoming, recentSent] = await db.batch([
        db.prepare(ATTENTION_SQL),
        db.prepare(STUCK_SQL).bind(stuckBefore),
        db.prepare(TODAY_SQL).bind(from, to),
        db.prepare(UPCOMING_FROM_SQL).bind(to),
        db.prepare(RECENT_SENT_SQL)
      ]);
      const incidentRows = (attention?.results ?? []) as AttentionRow[];
      const stuckRows = (stuck?.results ?? []) as StuckRow[];
      const todayRows = (today?.results ?? []) as TodayRow[];
      const attentionRows: DashboardAttentionRow[] = [
        ...incidentRows.map((row) => ({
          incident: { id: row.incident_id, kind: row.kind, code: row.code, createdAt: row.created_at },
          publication: publicationOf(row)
        })),
        ...stuckRows.map((row) => ({ incident: null, publication: requirePublication(row) }))
      ].slice(0, DASHBOARD_ATTENTION_LIMIT);
      return {
        attention: attentionRows,
        openIncidents: incidentRows[0]?.open_total ?? 0,
        stuck: stuckRows[0]?.stuck_total ?? 0,
        today: todayRows.map(requirePublication),
        todayTotal: todayRows[0]?.today_total ?? 0,
        upcoming: ((upcoming?.results ?? []) as PublicationColumns[]).map(requirePublication),
        recentSent: ((recentSent?.results ?? []) as SentRow[]).map((row): DashboardSentRow => ({
          ...requirePublication(row),
          updatedAt: row.updated_at,
          externalMessageId: row.external_message_id,
          chatId: row.chat_id
        }))
      };
    }
  };
}
