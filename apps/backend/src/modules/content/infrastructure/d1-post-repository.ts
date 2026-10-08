import { type PostEntity, postEntityListSchema } from '@alexeev/contracts';
import { completeIdempotencyStatement, ownsClaimSql } from '../../../platform/idempotency/d1-idempotency-store';
import type { ListPostsQuery, PostChange, PostRecord, PostRepository } from '../application/ports';
import type { PostStatus } from '../domain/post';

interface PostRevisionRow {
  post_id: string;
  revision: number;
  title: string;
  body: string;
  entities: string;
  status: PostStatus;
  created_at: number;
}

interface PostRow {
  id: string;
  title: string;
  body: string;
  /** JSON list of entities, always valid and within the cap (CHECK in migration 0011). */
  entities: string;
  status: PostStatus;
  revision: number;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

const POST_COLUMNS = 'id, title, body, entities, status, revision, archived_at, created_at, updated_at';

// Every write goes through the contract schemas, so a stored list that does not parse is damaged data:
// it fails loudly instead of being sent or shown with other offsets.
function parseEntities(stored: string): PostEntity[] {
  return postEntityListSchema.parse(JSON.parse(stored));
}

function toRecord(row: PostRow): PostRecord {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    entities: parseEntities(row.entities),
    status: row.status,
    revision: row.revision,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Live view: newest update first over posts that are not archived. The two live shapes walk
// posts_updated_idx / posts_status_updated_idx in order and skip archived rows on the way (at most
// the retention period's worth, never a sort). Archive view: most recently archived first over the
// partial posts_archive_idx. Only constant fragments are joined; every value is bound.
export function listPostsSql(query: Pick<ListPostsQuery, 'view' | 'status' | 'after'>): string {
  const archive = query.view === 'archive';
  const sortKey = archive ? 'archived_at' : 'updated_at';
  const conditions: string[] = [archive ? 'archived_at IS NOT NULL' : 'archived_at IS NULL'];
  if (query.status !== undefined) conditions.push('status = ?');
  // The leading range on the sort key is what lets the index seek straight to the cursor; the OR
  // only breaks ties among rows that share the cursor's timestamp.
  if (query.after !== undefined) conditions.push(`${sortKey} <= ?`, `(${sortKey} < ? OR id < ?)`);
  return `SELECT ${POST_COLUMNS} FROM posts WHERE ${conditions.join(' AND ')} ORDER BY ${sortKey} DESC, id DESC LIMIT ?`;
}

function listBindings(query: ListPostsQuery): (string | number)[] {
  const values: (string | number)[] = [];
  if (query.status !== undefined) values.push(query.status);
  if (query.after !== undefined) values.push(query.after.at, query.after.at, query.after.id);
  values.push(query.limit);
  return values;
}

// Only the guarded post is touched: every statement of a change carries the same guard, and
// the guard is evaluated before the UPDATE bumps the revision, so the three statements either
// all apply or none does.
const GUARD = "id = ?1 AND revision = ?2 AND status = 'draft'";

function auditStatement(db: D1Database, action: string, change: PostChange, details: object): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
       SELECT ?3, ?4, 'post', id, ?5, ?6 FROM posts WHERE ${GUARD}`
    )
    .bind(change.id, change.expectedRevision, change.actor, action, change.now, JSON.stringify(details));
}

export function createD1PostRepository(db: D1Database): PostRepository {
  return {
    async create({ record, actor, idempotency, response }) {
      const claim = [idempotency.scope, idempotency.key, idempotency.requestHash, idempotency.claimedAt];
      const entities = JSON.stringify(record.entities);
      const results = await db.batch([
        db
          .prepare(
            `INSERT INTO posts (id, title, body, entities, status, revision, created_at, updated_at)
             SELECT ?1, ?2, ?3, ?4, 'draft', 0, ?5, ?5 WHERE ${ownsClaimSql(6)}`
          )
          .bind(record.id, record.title, record.body, entities, record.createdAt, ...claim),
        db
          .prepare(
            `INSERT INTO post_revisions (post_id, revision, title, body, entities, status, created_at)
             SELECT ?1, 0, ?2, ?3, ?4, 'draft', ?5 WHERE ${ownsClaimSql(6)}`
          )
          .bind(record.id, record.title, record.body, entities, record.createdAt, ...claim),
        db
          .prepare(
            `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
             SELECT ?3, 'post.create', 'post', ?1, ?2, '{"revision":0}' WHERE ${ownsClaimSql(4)}`
          )
          .bind(record.id, record.createdAt, actor, ...claim),
        completeIdempotencyStatement(db, idempotency, response, record.createdAt)
      ]);
      return results[0]?.meta.changes === 1;
    },

    async findById(id) {
      const row = await db.prepare(`SELECT ${POST_COLUMNS} FROM posts WHERE id = ?1`).bind(id).first<PostRow>();
      return row === null ? null : toRecord(row);
    },

    // A revision is an immutable snapshot (primary key post_id + revision): what a publication sends.
    async findRevision(postId, revision) {
      const row = await db
        .prepare('SELECT title, body, entities FROM post_revisions WHERE post_id = ?1 AND revision = ?2')
        .bind(postId, revision)
        .first<{ title: string; body: string; entities: string }>();
      return row === null ? null : { title: row.title, body: row.body, entities: parseEntities(row.entities) };
    },

    async listRevisions(postId, beforeRevision, limit) {
      const before = beforeRevision ?? Number.MAX_SAFE_INTEGER;
      const { results } = await db
        .prepare(
          `SELECT post_id, revision, title, body, entities, status, created_at
           FROM post_revisions
           WHERE post_id = ?1 AND revision < ?2
           ORDER BY revision DESC
           LIMIT ?3`
        )
        .bind(postId, before, limit)
        .all<PostRevisionRow>();
      return results.map((row) => ({
        postId: row.post_id,
        revision: row.revision,
        title: row.title,
        body: row.body,
        entities: parseEntities(row.entities),
        status: row.status,
        createdAt: row.created_at
      }));
    },

    async list(query) {
      const { results } = await db
        .prepare(listPostsSql(query))
        .bind(...listBindings(query))
        .all<PostRow>();
      return results.map(toRecord);
    },

    async countArchived() {
      const row = await db
        .prepare('SELECT count(*) AS n FROM posts WHERE archived_at IS NOT NULL')
        .first<{ n: number }>();
      return row?.n ?? 0;
    },

    async update(change) {
      const fields = [
        ...(change.title === undefined ? [] : ['title']),
        ...(change.body === undefined ? [] : ['body']),
        ...(change.entities === undefined ? [] : ['entities'])
      ];
      const entities = change.entities === undefined ? null : JSON.stringify(change.entities);
      const results = await db.batch<PostRow>([
        db
          .prepare(
            `INSERT INTO post_revisions (post_id, revision, title, body, entities, status, created_at)
             SELECT id, revision + 1, COALESCE(?3, title), COALESCE(?4, body), COALESCE(?5, entities), status, ?6
             FROM posts WHERE ${GUARD}`
          )
          .bind(change.id, change.expectedRevision, change.title ?? null, change.body ?? null, entities, change.now),
        auditStatement(db, 'post.update', change, { revision: change.expectedRevision + 1, fields }),
        db
          .prepare(
            `UPDATE posts SET title = COALESCE(?3, title), body = COALESCE(?4, body), entities = COALESCE(?5, entities),
               revision = revision + 1, updated_at = ?6
             WHERE ${GUARD} RETURNING ${POST_COLUMNS}`
          )
          .bind(change.id, change.expectedRevision, change.title ?? null, change.body ?? null, entities, change.now)
      ]);
      const row = results[2]?.results[0];
      return row === undefined ? null : toRecord(row);
    },

    async approve(change) {
      const results = await db.batch<PostRow>([
        db
          .prepare(
            `INSERT INTO post_revisions (post_id, revision, title, body, entities, status, created_at)
             SELECT id, revision + 1, title, body, entities, 'approved', ?3 FROM posts WHERE ${GUARD}`
          )
          .bind(change.id, change.expectedRevision, change.now),
        db
          .prepare(
            `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
             SELECT ?3, 'post.approve', 'post', id, ?4, ?5 FROM posts WHERE ${GUARD}`
          )
          .bind(
            change.id,
            change.expectedRevision,
            change.actor,
            change.now,
            JSON.stringify({ revision: change.expectedRevision + 1 })
          ),
        db
          .prepare(
            `UPDATE posts SET status = 'approved', revision = revision + 1, updated_at = ?3
             WHERE ${GUARD} RETURNING ${POST_COLUMNS}`
          )
          .bind(change.id, change.expectedRevision, change.now)
      ]);
      const row = results[2]?.results[0];
      return row === undefined ? null : toRecord(row);
    }
  };
}
