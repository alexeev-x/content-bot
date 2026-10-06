import { completeIdempotencyStatement, ownsClaimSql } from '../../../platform/idempotency/d1-idempotency-store';
import type { ListPostsQuery, PostChange, PostRecord, PostRepository } from '../application/ports';
import type { PostStatus } from '../domain/post';

interface PostRow {
  id: string;
  title: string;
  body: string;
  status: PostStatus;
  revision: number;
  created_at: number;
  updated_at: number;
}

const POST_COLUMNS = 'id, title, body, status, revision, created_at, updated_at';

function toRecord(row: PostRow): PostRecord {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Newest update first. Each shape matches one index (posts_status_updated_idx / posts_updated_idx)
// so SQLite walks the index in order and never sorts. Only constant fragments are joined; every
// value is bound.
export function listPostsSql(query: Pick<ListPostsQuery, 'status' | 'after'>): string {
  const conditions: string[] = [];
  if (query.status !== undefined) conditions.push('status = ?');
  // The leading range on updated_at is what lets the index seek straight to the cursor; the OR
  // only breaks ties among rows that share the cursor's timestamp.
  if (query.after !== undefined) conditions.push('updated_at <= ?', '(updated_at < ? OR id < ?)');
  const where = conditions.length === 0 ? '' : ` WHERE ${conditions.join(' AND ')}`;
  return `SELECT ${POST_COLUMNS} FROM posts${where} ORDER BY updated_at DESC, id DESC LIMIT ?`;
}

function listBindings(query: ListPostsQuery): (string | number)[] {
  const values: (string | number)[] = [];
  if (query.status !== undefined) values.push(query.status);
  if (query.after !== undefined) values.push(query.after.updatedAt, query.after.updatedAt, query.after.id);
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
      const results = await db.batch([
        db
          .prepare(
            `INSERT INTO posts (id, title, body, status, revision, created_at, updated_at)
             SELECT ?1, ?2, ?3, 'draft', 0, ?4, ?4 WHERE ${ownsClaimSql(5)}`
          )
          .bind(record.id, record.title, record.body, record.createdAt, ...claim),
        db
          .prepare(
            `INSERT INTO post_revisions (post_id, revision, title, body, status, created_at)
             SELECT ?1, 0, ?2, ?3, 'draft', ?4 WHERE ${ownsClaimSql(5)}`
          )
          .bind(record.id, record.title, record.body, record.createdAt, ...claim),
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
      return db
        .prepare('SELECT title, body FROM post_revisions WHERE post_id = ?1 AND revision = ?2')
        .bind(postId, revision)
        .first<{ title: string; body: string }>();
    },

    async list(query) {
      const { results } = await db
        .prepare(listPostsSql(query))
        .bind(...listBindings(query))
        .all<PostRow>();
      return results.map(toRecord);
    },

    async update(change) {
      const fields = [...(change.title === undefined ? [] : ['title']), ...(change.body === undefined ? [] : ['body'])];
      const results = await db.batch<PostRow>([
        db
          .prepare(
            `INSERT INTO post_revisions (post_id, revision, title, body, status, created_at)
             SELECT id, revision + 1, COALESCE(?3, title), COALESCE(?4, body), status, ?5 FROM posts WHERE ${GUARD}`
          )
          .bind(change.id, change.expectedRevision, change.title ?? null, change.body ?? null, change.now),
        auditStatement(db, 'post.update', change, { revision: change.expectedRevision + 1, fields }),
        db
          .prepare(
            `UPDATE posts SET title = COALESCE(?3, title), body = COALESCE(?4, body), revision = revision + 1, updated_at = ?5
             WHERE ${GUARD} RETURNING ${POST_COLUMNS}`
          )
          .bind(change.id, change.expectedRevision, change.title ?? null, change.body ?? null, change.now)
      ]);
      const row = results[2]?.results[0];
      return row === undefined ? null : toRecord(row);
    },

    async approve(change) {
      const results = await db.batch<PostRow>([
        db
          .prepare(
            `INSERT INTO post_revisions (post_id, revision, title, body, status, created_at)
             SELECT id, revision + 1, title, body, 'approved', ?3 FROM posts WHERE ${GUARD}`
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
