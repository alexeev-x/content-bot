import { AppError } from '../../../shared/app-error';
import { SYSTEM_ACTOR } from '../domain/archive-policy';
import type {
  CancelledPublication,
  DeleteItemOutcome,
  LifecycleRepository,
  ReturnToDraftOutcome,
  RestoreItemOutcome
} from '../application/ports';

// This repository reads and writes posts together with publications, jobs, attempts and incidents. It
// names the job states it depends on (docs/BACKEND_ARCHITECTURE.md §5):
// - 'pending', 'retry_wait': nothing is in flight, the owner may cancel; deleting a post cancels them;
// - 'claimed' (preparing or sending) and 'unknown' (a send that may have happened): never deleted;
// - 'succeeded', 'failed', 'cancelled': final.
// Every operation is one batch. D1 runs a batch as a transaction, so a statement sees what the ones
// before it wrote, and a guard that holds for the first statement holds for the rest: each statement
// recomputes the same eligible set, and only the post's own rows (never a blocking job) disappear.

// A post is blocked while a publication is being sent or its result is unknown.
const BLOCKING_JOB = (post: string) =>
  `SELECT 1 FROM publications pu JOIN jobs j ON j.publication_id = pu.id
   WHERE pu.post_id = ${post} AND j.status IN ('claimed', 'unknown')`;

// ?1 = JSON array of {id, revision}; a null revision means "any" (the purge). ?2 = purge cutoff, or NULL
// for an owner delete; with a cutoff the post must still be archived and expired. A soft-deleted post is
// never a target again. `soft` marks a post with a sent publication (a succeeded job): it is kept as a
// tombstone so the publication stays in the history; any other post disappears. The flag only depends on
// succeeded jobs, which no statement of the batch removes, so every statement computes the same sets.
const DELETE_TARGET = `WITH target(id, soft) AS (
  SELECT po.id, EXISTS (SELECT 1 FROM publications sp JOIN jobs sj ON sj.publication_id = sp.id
                        WHERE sp.post_id = po.id AND sj.status = 'succeeded')
  FROM json_each(?1) je JOIN posts po ON po.id = json_extract(je.value, '$.id')
  WHERE po.deleted_at IS NULL
    AND (json_extract(je.value, '$.revision') IS NULL OR po.revision = json_extract(je.value, '$.revision'))
    AND (?2 IS NULL OR (po.archived_at IS NOT NULL AND po.archived_at <= ?2))
    AND NOT EXISTS (${BLOCKING_JOB('po.id')})
)`;

const OF_TARGET = 'IN (SELECT id FROM target)';
const OF_SOFT_TARGET = 'IN (SELECT id FROM target WHERE soft = 1)';
// Publications that go away: all of a hard-deleted post, and the unsent ones of a soft-deleted post.
const DOOMED_PUBLICATIONS = `SELECT pu.id FROM publications pu WHERE pu.post_id ${OF_TARGET}
  AND NOT EXISTS (SELECT 1 FROM jobs sj WHERE sj.publication_id = pu.id AND sj.status = 'succeeded')`;

// ?3 actor, ?4 action, ?5 now. The counts say what the delete took with it; never post text.
const DELETE_AUDIT = `${DELETE_TARGET}
  INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
  SELECT ?3, ?4, 'post', t.id, ?5,
         json_object(
           'revision', po.revision,
           'soft', t.soft,
           'cancelledPublications', (SELECT count(*) FROM publications pu JOIN jobs j ON j.publication_id = pu.id
                                     WHERE pu.post_id = t.id AND j.status IN ('pending', 'retry_wait')),
           'removedPublications', (SELECT count(*) FROM (${DOOMED_PUBLICATIONS}) d
                                   JOIN publications dp ON dp.id = d.id WHERE dp.post_id = t.id))
  FROM target t JOIN posts po ON po.id = t.id`;

const WAITING_OF_TARGET = `${DELETE_TARGET}
  SELECT pu.post_id AS post_id, pu.id AS publication_id, pu.destination_id AS destination_id,
         pu.scheduled_at AS scheduled_at
  FROM publications pu JOIN jobs j ON j.publication_id = pu.id
  WHERE pu.post_id ${OF_TARGET} AND j.status IN ('pending', 'retry_wait')
  ORDER BY pu.post_id, pu.scheduled_at, pu.id`;

// A deleted post's unsent publications go; the later posts of their series would wait for them for ever, so they are
// cancelled first (owner, 22.10.2026; migration 0098). ?3 = now.
const CANCEL_LATER_IN_SERIES = `${DELETE_TARGET}
  UPDATE jobs SET status = 'cancelled', lease_until = NULL, updated_at = ?3
  WHERE kind = 'publish' AND status IN ('pending', 'retry_wait') AND publication_id IN (
    SELECT later.id FROM publications current
    JOIN publications later ON later.series_id = current.series_id AND later.series_position > current.series_position
    WHERE current.id IN (${DOOMED_PUBLICATIONS}) AND later.id NOT IN (${DOOMED_PUBLICATIONS}))`;

// Children first: foreign keys point from attempts, incidents and jobs up to publications and posts.
// A soft-deleted post keeps its sent publications with their jobs, attempts, incidents and the revision
// they sent; the rest of its rows go like a hard delete (post_media and bot imports are cascades of the
// post row, which stays, so they are removed explicitly).
export const DELETE_STATEMENTS = [
  `${DELETE_TARGET} DELETE FROM job_attempts WHERE job_id IN
     (SELECT j.id FROM jobs j WHERE j.publication_id IN (${DOOMED_PUBLICATIONS}))`,
  `${DELETE_TARGET} DELETE FROM incidents WHERE publication_id IN (${DOOMED_PUBLICATIONS})
     OR job_id IN (SELECT j.id FROM jobs j WHERE j.publication_id IN (${DOOMED_PUBLICATIONS}))`,
  `${DELETE_TARGET} DELETE FROM jobs WHERE publication_id IN (${DOOMED_PUBLICATIONS})`,
  `${DELETE_TARGET} DELETE FROM publications WHERE id IN (${DOOMED_PUBLICATIONS})`,
  `${DELETE_TARGET} DELETE FROM post_revisions WHERE post_id ${OF_TARGET}
     AND NOT EXISTS (SELECT 1 FROM publications pu WHERE pu.post_id = post_revisions.post_id
                     AND pu.post_revision = post_revisions.revision)`,
  `${DELETE_TARGET} DELETE FROM post_media WHERE post_id ${OF_SOFT_TARGET}`,
  `${DELETE_TARGET} DELETE FROM post_media_uploads WHERE post_id ${OF_SOFT_TARGET}`,
  `${DELETE_TARGET} DELETE FROM bot_media_imports WHERE post_id ${OF_SOFT_TARGET}`
];
const DELETE_POSTS = `${DELETE_TARGET} DELETE FROM posts WHERE id IN (SELECT id FROM target WHERE soft = 0) RETURNING id`;
// ?3 = now. Runs last: it removes the post from every later target.
const SOFT_DELETE_POSTS = `${DELETE_TARGET} UPDATE posts SET deleted_at = ?3 WHERE id ${OF_SOFT_TARGET} RETURNING id`;

// Read after the writes of the same batch: a post that was not deleted is exactly as it was decided on.
const BLOCKER = (column: string) =>
  `(SELECT ${column} FROM publications pu JOIN jobs j ON j.publication_id = pu.id
    WHERE pu.post_id = po.id AND j.status IN ('claimed', 'unknown')
    ORDER BY (j.status = 'unknown') DESC, pu.id LIMIT 1)`;
const DELETE_STATE = `SELECT json_extract(je.value, '$.id') AS id, po.id IS NOT NULL AS found, po.revision AS revision,
    ${BLOCKER('pu.id')} AS blocker_publication_id, ${BLOCKER('j.status')} AS blocker_status
  FROM json_each(?1) je LEFT JOIN posts po ON po.id = json_extract(je.value, '$.id') AND po.deleted_at IS NULL`;

const RESTORE_TARGET = `WITH target(id) AS (
  SELECT po.id FROM json_each(?1) je JOIN posts po ON po.id = json_extract(je.value, '$.id')
  WHERE po.revision = json_extract(je.value, '$.revision') AND po.archived_at IS NOT NULL AND po.deleted_at IS NULL
)`;
const RESTORE_AUDIT = `${RESTORE_TARGET}
  INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
  SELECT ?2, 'post.restore', 'post', t.id, ?3, json_object('revision', po.revision)
  FROM target t JOIN posts po ON po.id = t.id`;
// The post returns to the top of the live list; its revision is untouched (no content changed).
const RESTORE_POSTS = `${RESTORE_TARGET}
  UPDATE posts SET archived_at = NULL, restored_at = ?2, updated_at = ?2 WHERE id ${OF_TARGET} RETURNING id`;
const RESTORE_STATE = `SELECT json_extract(je.value, '$.id') AS id, po.id IS NOT NULL AS found, po.revision AS revision,
    po.archived_at IS NOT NULL AS archived
  FROM json_each(?1) je LEFT JOIN posts po ON po.id = json_extract(je.value, '$.id') AND po.deleted_at IS NULL`;

const RETURN_TO_DRAFT_BLOCKER = `(SELECT j.status FROM publications pu JOIN jobs j ON j.publication_id = pu.id
  WHERE pu.post_id = po.id AND j.status IN ('pending', 'retry_wait', 'claimed', 'unknown')
  ORDER BY CASE j.status WHEN 'unknown' THEN 0 WHEN 'claimed' THEN 1 ELSE 2 END, pu.id LIMIT 1)`;
const RETURN_TO_DRAFT_TARGET = `WITH target(id) AS (
  SELECT po.id FROM posts po
  WHERE po.id = ?1 AND po.revision = ?2 AND po.status = 'approved' AND po.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM publications pu JOIN jobs j ON j.publication_id = pu.id
                    WHERE pu.post_id = po.id AND j.status IN ('pending', 'retry_wait', 'claimed', 'unknown'))
)`;
const RETURN_TO_DRAFT_AUDIT = `${RETURN_TO_DRAFT_TARGET}
  INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
  SELECT ?3, 'post.return_to_draft', 'post', po.id, ?4,
         json_object('revision', po.revision + 1, 'restoredFromArchive', po.archived_at IS NOT NULL)
  FROM target t JOIN posts po ON po.id = t.id`;
const RETURN_TO_DRAFT_REVISION = `${RETURN_TO_DRAFT_TARGET}
  INSERT INTO post_revisions (post_id, revision, title, body, entities, status, created_at, media_json,
    kind, poll_json, send_silent, send_protected, link_preview_disabled, rich_html)
  SELECT po.id, po.revision + 1, po.title, po.body, po.entities, 'draft', ?3,
         COALESCE((SELECT r.media_json FROM post_revisions r WHERE r.post_id = po.id AND r.revision = po.revision), '[]'),
         po.kind, po.poll_json, po.send_silent, po.send_protected, po.link_preview_disabled, po.rich_html
  FROM target t JOIN posts po ON po.id = t.id`;
const RETURN_TO_DRAFT_UPDATE = `${RETURN_TO_DRAFT_TARGET}
  UPDATE posts SET status = 'draft', revision = revision + 1, archived_at = NULL,
    restored_at = CASE WHEN archived_at IS NULL THEN restored_at ELSE ?3 END, updated_at = ?3
  WHERE id IN (SELECT id FROM target) RETURNING id`;
const RETURN_TO_DRAFT_STATE = `SELECT po.id AS id, po.status AS status, po.revision AS revision,
    ${RETURN_TO_DRAFT_BLOCKER} AS blocker_status
  FROM posts po WHERE po.id = ?1 AND po.deleted_at IS NULL`;

// Qualifies for the archive: a publication was sent after the last restore, and nothing is left to
// send (scheduled, queued, preparing, sending, retry_wait, unknown). Failed and cancelled ones do not
// block, but a post with only those never qualifies.
const ARCHIVABLE = `po.archived_at IS NULL AND po.deleted_at IS NULL AND po.status = 'approved'
  AND EXISTS (SELECT 1 FROM publications p2 JOIN jobs j2 ON j2.publication_id = p2.id
              WHERE p2.post_id = po.id AND j2.status = 'succeeded' AND j2.updated_at > COALESCE(po.restored_at, 0))
  AND NOT EXISTS (SELECT 1 FROM publications p3 JOIN jobs j3 ON j3.publication_id = p3.id
                  WHERE p3.post_id = po.id AND j3.status IN ('pending', 'claimed', 'retry_wait', 'unknown'))`;

// The scan starts from jobs that reached a final state in the window (jobs_final_updated_idx), so an
// idle tick reads only what finished recently, never the history. INDEXED BY pins it: without table
// statistics SQLite prefers jobs_status_scheduled_idx, which would read every finished job.
export const FIND_ARCHIVABLE = `SELECT po.id AS id FROM jobs AS j INDEXED BY jobs_final_updated_idx
  JOIN publications pu ON pu.id = j.publication_id
  JOIN posts po ON po.id = pu.post_id
  WHERE j.status IN ('succeeded', 'failed', 'cancelled') AND j.updated_at >= ?1 AND ${ARCHIVABLE}
  GROUP BY po.id ORDER BY po.id LIMIT ?2`;
const ARCHIVE_TARGET = `WITH target(id) AS (
  SELECT po.id FROM json_each(?1) je JOIN posts po ON po.id = je.value WHERE ${ARCHIVABLE}
)`;
const ARCHIVE_AUDIT = `${ARCHIVE_TARGET}
  INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
  SELECT ?3, 'post.archive', 'post', t.id, ?2, '{"reason":"sent"}' FROM target t`;
const ARCHIVE_POSTS = `${ARCHIVE_TARGET} UPDATE posts SET archived_at = ?2 WHERE id ${OF_TARGET} RETURNING id`;

export const FIND_EXPIRED = `SELECT po.id AS id FROM posts po
  WHERE po.deleted_at IS NULL AND po.archived_at IS NOT NULL AND po.archived_at <= ?1 AND NOT EXISTS (${BLOCKING_JOB('po.id')})
  ORDER BY po.archived_at, po.id LIMIT ?2`;

interface WaitingRow {
  post_id: string;
  publication_id: string;
  destination_id: string;
  scheduled_at: number;
}

interface DeleteStateRow {
  id: string;
  found: number;
  revision: number | null;
  blocker_publication_id: string | null;
  blocker_status: string | null;
}

interface RestoreStateRow {
  id: string;
  found: number;
  revision: number | null;
  archived: number | null;
}

interface ReturnToDraftStateRow {
  id: string;
  status: string;
  revision: number;
  blocker_status: string | null;
}

function notApplied(): AppError {
  // Unreachable while the writes are one atomic batch; fail loudly rather than guess.
  return new AppError('UNAVAILABLE', 'The change was not applied');
}

export function createD1LifecycleRepository(db: D1Database): LifecycleRepository {
  // The owner delete and the purge share these statements: the purge differs only in the cutoff it
  // passes (so a post restored in between is skipped) and in not needing the report or the state read.
  const deleteStatements = (
    json: string,
    cutoff: number | null,
    audit: { actor: string; action: string; now: number }
  ): D1PreparedStatement[] => [
    db.prepare(DELETE_AUDIT).bind(json, cutoff, audit.actor, audit.action, audit.now),
    // The owner's delete only: an archived post (the purge) has no waiting publication; a failed one it may keep already
    // holds the later posts until the owner cancels them, so purging it changes nothing for them.
    ...(cutoff === null ? [db.prepare(CANCEL_LATER_IN_SERIES).bind(json, cutoff, audit.now)] : []),
    ...DELETE_STATEMENTS.map((sql) => db.prepare(sql).bind(json, cutoff)),
    db.prepare(DELETE_POSTS).bind(json, cutoff),
    db.prepare(SOFT_DELETE_POSTS).bind(json, cutoff, audit.now)
  ];

  return {
    async deletePosts({ items, actor, now }) {
      if (items.length === 0) return [];
      const json = JSON.stringify(items);
      // The report of waiting publications runs first, so it reads them before the delete removes them.
      const results = await db.batch([
        db.prepare(WAITING_OF_TARGET).bind(json, null),
        ...deleteStatements(json, null, { actor, action: 'post.delete', now }),
        db.prepare(DELETE_STATE).bind(json)
      ]);
      const waiting = rowsOf<WaitingRow>(results[0]);
      const deleted = new Set(
        [results[results.length - 3], results[results.length - 2]].flatMap((result) =>
          rowsOf<{ id: string }>(result).map((row) => row.id)
        )
      );
      const state = new Map(rowsOf<DeleteStateRow>(results[results.length - 1]).map((row) => [row.id, row]));

      return items.map((item): DeleteItemOutcome => {
        if (deleted.has(item.id)) {
          const cancelledPublications: CancelledPublication[] = waiting
            .filter((row) => row.post_id === item.id)
            .map((row) => ({
              id: row.publication_id,
              destinationId: row.destination_id,
              scheduledAt: row.scheduled_at
            }));
          return { id: item.id, outcome: 'deleted', cancelledPublications };
        }
        const row = state.get(item.id);
        if (row === undefined) throw notApplied();
        if (row.found !== 1) return { id: item.id, outcome: 'refused', reason: 'NOT_FOUND' };
        // What a publication is doing is said first: no revision helps while it is in flight.
        if (row.blocker_publication_id !== null && row.blocker_status === 'unknown') {
          return {
            id: item.id,
            outcome: 'refused',
            reason: 'PUBLICATION_UNKNOWN',
            publicationId: row.blocker_publication_id
          };
        }
        if (row.blocker_publication_id !== null && row.blocker_status === 'claimed') {
          return {
            id: item.id,
            outcome: 'refused',
            reason: 'PUBLICATION_IN_PROGRESS',
            publicationId: row.blocker_publication_id
          };
        }
        if (row.revision !== item.revision) return { id: item.id, outcome: 'refused', reason: 'STALE_REVISION' };
        throw notApplied();
      });
    },

    async restorePosts({ items, actor, now }) {
      if (items.length === 0) return [];
      const json = JSON.stringify(items);
      const results = await db.batch([
        db.prepare(RESTORE_AUDIT).bind(json, actor, now),
        db.prepare(RESTORE_POSTS).bind(json, now),
        db.prepare(RESTORE_STATE).bind(json)
      ]);
      const restored = new Set(rowsOf<{ id: string }>(results[1]).map((row) => row.id));
      const state = new Map(rowsOf<RestoreStateRow>(results[2]).map((row) => [row.id, row]));

      return items.map((item): RestoreItemOutcome => {
        if (restored.has(item.id)) return { id: item.id, outcome: 'restored' };
        const row = state.get(item.id);
        if (row === undefined) throw notApplied();
        if (row.found !== 1) return { id: item.id, outcome: 'refused', reason: 'NOT_FOUND' };
        if (row.archived !== 1) return { id: item.id, outcome: 'refused', reason: 'NOT_ARCHIVED' };
        if (row.revision !== item.revision) return { id: item.id, outcome: 'refused', reason: 'STALE_REVISION' };
        throw notApplied();
      });
    },

    async returnPostToDraft({ id, revision, actor, now }): Promise<ReturnToDraftOutcome> {
      const results = await db.batch([
        db.prepare(RETURN_TO_DRAFT_AUDIT).bind(id, revision, actor, now),
        db.prepare(RETURN_TO_DRAFT_REVISION).bind(id, revision, now),
        db.prepare(RETURN_TO_DRAFT_UPDATE).bind(id, revision, now),
        db.prepare(RETURN_TO_DRAFT_STATE).bind(id)
      ]);
      if (rowsOf<{ id: string }>(results[2]).some((row) => row.id === id)) return { id, outcome: 'returned' };
      const row = rowsOf<ReturnToDraftStateRow>(results[3])[0];
      if (row === undefined) return { id, outcome: 'refused', reason: 'NOT_FOUND' };
      if (row.blocker_status === 'unknown') return { id, outcome: 'refused', reason: 'PUBLICATION_UNKNOWN' };
      if (row.blocker_status === 'claimed') return { id, outcome: 'refused', reason: 'PUBLICATION_IN_PROGRESS' };
      if (row.blocker_status === 'pending' || row.blocker_status === 'retry_wait')
        return { id, outcome: 'refused', reason: 'PUBLICATION_PENDING' };
      if (row.revision !== revision) return { id, outcome: 'refused', reason: 'STALE_REVISION' };
      if (row.status !== 'approved') return { id, outcome: 'refused', reason: 'NOT_APPROVED' };
      throw notApplied();
    },

    async findArchivable({ since, limit }) {
      const { results } = await db.prepare(FIND_ARCHIVABLE).bind(since, limit).all<{ id: string }>();
      return results.map((row) => row.id);
    },

    async archivePosts({ ids, now }) {
      if (ids.length === 0) return 0;
      const json = JSON.stringify(ids);
      const results = await db.batch([
        db.prepare(ARCHIVE_AUDIT).bind(json, now, SYSTEM_ACTOR),
        db.prepare(ARCHIVE_POSTS).bind(json, now)
      ]);
      return rowsOf<{ id: string }>(results[1]).length;
    },

    async findExpired({ before, limit }) {
      const { results } = await db.prepare(FIND_EXPIRED).bind(before, limit).all<{ id: string }>();
      return results.map((row) => row.id);
    },

    async purgePosts({ ids, before, now }) {
      if (ids.length === 0) return 0;
      const json = JSON.stringify(ids.map((id) => ({ id, revision: null })));
      const results = await db.batch(
        deleteStatements(json, before, { actor: SYSTEM_ACTOR, action: 'post.purge', now })
      );
      return [results[results.length - 2], results[results.length - 1]].reduce(
        (count, result) => count + rowsOf<{ id: string }>(result).length,
        0
      );
    }
  };
}

function rowsOf<T>(result: D1Result | undefined): T[] {
  return (result?.results ?? []) as T[];
}
