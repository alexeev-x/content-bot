import type { PublicationOutcomeRow, PublicationOutcomesRepository } from '../application/ports';
import type { JobState } from '../domain/status-projection';

// The rubric scheduler's read side of publishing (docs/scheduler/area-backend-core.md §4.2): what became of the posts
// it handed over, whether a post already has a live publication, and the recent publications its daily gate counts.
// D1 only, bounded: never more than OUTCOMES_MAX ids or RECENT_MAX rows per call.

export const OUTCOMES_MAX = 20;
export const RECENT_MAX = 200;

interface OutcomeRow {
  id: string;
  post_id: string;
  scheduled_at: number;
  external_message_ids: string | null;
  external_poll_id: string | null;
  last_error_code: string | null;
  job_status: JobState;
  job_run_at: number;
  job_send_started_at: number | null;
  job_updated_at: number;
}

const OUTCOME_COLUMNS = `p.id, p.post_id, p.scheduled_at, p.external_message_ids, p.external_poll_id, p.last_error_code,
  j.status AS job_status, j.run_at AS job_run_at, j.send_started_at AS job_send_started_at, j.updated_at AS job_updated_at`;
const FROM_PUBLICATIONS = `FROM publications p CROSS JOIN jobs j ON j.publication_id = p.id AND j.kind = 'publish'`;

function toOutcome(row: OutcomeRow): PublicationOutcomeRow {
  return {
    publicationId: row.id,
    postId: row.post_id,
    scheduledAt: row.scheduled_at,
    externalMessageIds: row.external_message_ids === null ? [] : (JSON.parse(row.external_message_ids) as string[]),
    externalPollId: row.external_poll_id,
    lastErrorCode: row.last_error_code,
    job: { status: row.job_status, runAt: row.job_run_at, sendStartedAt: row.job_send_started_at },
    jobUpdatedAt: row.job_updated_at
  };
}

export function createD1PublicationOutcomesRepository(db: D1Database): PublicationOutcomesRepository {
  return {
    async outcomes(ids) {
      if (ids.length === 0) return [];
      const { results } = await db
        .prepare(`SELECT ${OUTCOME_COLUMNS} ${FROM_PUBLICATIONS} WHERE p.id IN (SELECT value FROM json_each(?1))`)
        .bind(JSON.stringify(ids.slice(0, OUTCOMES_MAX)))
        .all<OutcomeRow>();
      return results.map(toOutcome);
    },

    // Newest first through publications_post_idx; a post has few publications.
    async latestForPost(postId, destinationId) {
      const row = await db
        .prepare(
          `SELECT ${OUTCOME_COLUMNS} ${FROM_PUBLICATIONS}
           WHERE p.post_id = ?1 AND p.destination_id = ?2 ORDER BY p.scheduled_at DESC, p.id DESC LIMIT 1`
        )
        .bind(postId, destinationId)
        .first<OutcomeRow>();
      return row === null ? null : toOutcome(row);
    },

    // Walks publications_scheduled_idx from `since` on.
    async recent(since) {
      const { results } = await db
        .prepare(
          `SELECT ${OUTCOME_COLUMNS}, r.kind AS post_kind, json_array_length(r.media_json) AS media_count,
             p.destination_id, p.series_position,
             (SELECT a.actor_telegram_id FROM audit_log a
               WHERE a.entity_id = p.id AND a.entity_type = 'publication' AND a.action = 'publication.create'
               ORDER BY a.id LIMIT 1) AS actor
           ${FROM_PUBLICATIONS}
           JOIN post_revisions r ON r.post_id = p.post_id AND r.revision = p.post_revision
           WHERE p.scheduled_at >= ?1 ORDER BY p.scheduled_at DESC, p.id DESC LIMIT ?2`
        )
        .bind(since, RECENT_MAX)
        .all<
          OutcomeRow & {
            post_kind: 'text' | 'poll';
            media_count: number | null;
            destination_id: string;
            series_position: number | null;
            actor: string | null;
          }
        >();
      return results.map((row) => ({
        ...toOutcome(row),
        postKind: row.post_kind,
        hasMedia: (row.media_count ?? 0) > 0,
        destinationId: row.destination_id,
        actor: row.actor,
        seriesPosition: row.series_position
      }));
    }
  };
}
