import { type PostEntity, type PostMediaDto, postEntityListSchema, postMediaSchema } from '@alexeev/contracts';
import { completeIdempotencyStatement, ownsClaimSql } from '../../../platform/idempotency/d1-idempotency-store';
import type { ListPostsQuery, PostChange, PostRecord, PostRepository } from '../application/ports';
import type { PostStatus } from '../domain/post';
import { postNameFromBody } from '../domain/post-name';
import { postTitleSortKey } from '../domain/post-title-sort-key';

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
  /** 0 for a post created without a title (migration 0063). */
  title_in_message: number;
}

// A post without a title in its message is named after its body (?8) and ignores a client title; a post with one
// takes the client's (?3). Both keep the stored value when nothing new comes.
const NEW_TITLE = 'CASE WHEN title_in_message = 0 THEN COALESCE(?8, title) ELSE COALESCE(?3, title) END';

const POST_COLUMNS =
  'id, title, body, entities, status, revision, archived_at, created_at, updated_at, title_in_message';

// Every write goes through the contract schemas, so a stored list that does not parse is damaged data:
// it fails loudly instead of being sent or shown with other offsets.
function parseEntities(stored: string): PostEntity[] {
  return postEntityListSchema.parse(JSON.parse(stored));
}

function toRecord(row: PostRow): PostRecord {
  return {
    id: row.id,
    title: row.title,
    titleInMessage: row.title_in_message !== 0,
    body: row.body,
    entities: parseEntities(row.entities),
    status: row.status,
    revision: row.revision,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

interface MediaRow {
  post_id: string;
  id: string;
  kind: PostMediaDto['kind'];
  file_name: string;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  source_media_id: string | null;
  position: number;
}

function mediaStatement(db: D1Database, postIds: string[]): D1PreparedStatement {
  return db
    .prepare(
      `SELECT p.id AS post_id, m.id, m.kind, m.file_name, m.content_type, m.size_bytes, m.width, m.height,
              m.duration_ms, m.source_media_id, pm.position
         FROM posts p JOIN json_each(?1) requested ON requested.value = p.id
              JOIN post_media pm ON pm.post_id = p.id JOIN media_assets m ON m.id = pm.media_id
        WHERE p.status = 'draft'
       UNION ALL
       SELECT p.id AS post_id, m.id, m.kind, m.file_name, m.content_type, m.size_bytes, m.width, m.height,
              m.duration_ms, m.source_media_id, CAST(j.key AS INTEGER) AS position
         FROM posts p JOIN post_revisions r ON r.post_id = p.id AND r.revision = p.revision
              JOIN json_each(r.media_json) j JOIN media_assets m ON m.id = j.value
              JOIN json_each(?1) requested ON requested.value = p.id
        WHERE p.status = 'approved'
        ORDER BY post_id, position`
    )
    .bind(JSON.stringify(postIds));
}

function withMedia(posts: PostRecord[], rows: MediaRow[]): PostRecord[] {
  const mediaByPost = new Map<string, PostMediaDto[]>();
  for (const row of rows) {
    const items = mediaByPost.get(row.post_id) ?? [];
    items.push(
      postMediaSchema.parse({
        id: row.id,
        sourceMediaId: row.source_media_id,
        kind: row.kind,
        fileName: row.file_name,
        contentType: row.content_type,
        sizeBytes: row.size_bytes,
        width: row.width,
        height: row.height,
        durationMs: row.duration_ms,
        position: row.position
      })
    );
    mediaByPost.set(row.post_id, items);
  }
  return posts.map((post) => ({ ...post, media: mediaByPost.get(post.id) ?? [] }));
}

async function attachMedia(db: D1Database, posts: PostRecord[]): Promise<PostRecord[]> {
  if (posts.length === 0) return posts;
  const { results } = await mediaStatement(
    db,
    posts.map(({ id }) => id)
  ).all<MediaRow>();
  return withMedia(posts, results);
}

// Live view: newest update first over posts that are not archived. The two live shapes walk
// posts_updated_idx / posts_status_updated_idx in order and skip archived rows on the way (at most
// the retention period's worth, never a sort). Archive view: most recently archived first over the
// partial posts_archived_idx. Only constant fragments are joined; every value is bound.
export function listPostsSql(query: Pick<ListPostsQuery, 'view' | 'status' | 'after'>): string {
  const archive = query.view === 'archive';
  const sortKey = archive ? 'archived_at' : 'updated_at';
  const conditions: string[] = [archive ? 'archived_at IS NOT NULL' : 'archived_at IS NULL', 'deleted_at IS NULL'];
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
const GUARD = "id = ?1 AND revision = ?2 AND status = 'draft' AND deleted_at IS NULL";

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
            `INSERT INTO posts (id, title, title_sort_key, body, entities, status, revision, created_at, updated_at,
               title_in_message)
             SELECT ?1, ?2, ?3, ?4, ?5, 'draft', 0, ?6, ?6, ?${7 + claim.length} WHERE ${ownsClaimSql(7)}`
          )
          .bind(
            record.id,
            record.title,
            postTitleSortKey(record.title),
            record.body,
            entities,
            record.createdAt,
            ...claim,
            record.titleInMessage ? 1 : 0
          ),
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
      // The FTS maintenance trigger can affect D1's changes count for the first statement; the final
      // idempotency completion is the guarded batch outcome and remains one changed row on success.
      return results.at(-1)?.meta.changes === 1;
    },

    async findById(id) {
      const row = await db
        .prepare(`SELECT ${POST_COLUMNS} FROM posts WHERE id = ?1 AND deleted_at IS NULL`)
        .bind(id)
        .first<PostRow>();
      return row === null ? null : ((await attachMedia(db, [toRecord(row)]))[0] ?? null);
    },

    async findManyByIds(ids) {
      if (ids.length === 0) return [];
      const { results } = await db
        .prepare(
          `SELECT ${POST_COLUMNS} FROM posts WHERE id IN (SELECT value FROM json_each(?1)) AND deleted_at IS NULL`
        )
        .bind(JSON.stringify(ids))
        .all<PostRow>();
      const byId = new Map((await attachMedia(db, results.map(toRecord))).map((post) => [post.id, post]));
      return ids.flatMap((id) => {
        const post = byId.get(id);
        return post === undefined ? [] : [post];
      });
    },

    // A revision is an immutable snapshot (primary key post_id + revision): what a publication sends.
    async findRevision(postId, revision) {
      const { results } = await db
        .prepare(
          // The title flag is per post and fixed at creation, so the post row holds it for every revision.
          `SELECT r.title, COALESCE(p.title_in_message, 1) AS title_in_message, r.body, r.entities,
                  m.id, m.kind, m.file_name, m.content_type, m.object_key
             FROM post_revisions r LEFT JOIN posts p ON p.id = r.post_id
             LEFT JOIN json_each(r.media_json) j
             LEFT JOIN media_assets m ON m.id = j.value
            WHERE r.post_id = ?1 AND r.revision = ?2 ORDER BY CAST(j.key AS INTEGER)`
        )
        .bind(postId, revision)
        .all<{
          title: string;
          title_in_message: number;
          body: string;
          entities: string;
          id: string | null;
          kind: PostMediaDto['kind'] | null;
          file_name: string | null;
          content_type: string | null;
          object_key: string | null;
        }>();
      const row = results[0];
      if (row === undefined) return null;
      return {
        title: row.title,
        titleInMessage: row.title_in_message !== 0,
        body: row.body,
        entities: parseEntities(row.entities),
        media: results.flatMap((item) =>
          item.id === null ||
          item.kind === null ||
          item.file_name === null ||
          item.content_type === null ||
          item.object_key === null
            ? []
            : [
                {
                  id: item.id,
                  kind: item.kind,
                  fileName: item.file_name,
                  contentType: item.content_type,
                  objectKey: item.object_key
                }
              ]
        )
      };
    },

    async list(query) {
      const { results } = await db
        .prepare(listPostsSql(query))
        .bind(...listBindings(query))
        .all<PostRow>();
      return attachMedia(db, results.map(toRecord));
    },

    async countArchived() {
      const row = await db
        .prepare('SELECT count(*) AS n FROM posts WHERE archived_at IS NOT NULL AND deleted_at IS NULL')
        .first<{ n: number }>();
      return row?.n ?? 0;
    },

    async count(view, status) {
      const conditions = [view === 'archive' ? 'archived_at IS NOT NULL' : 'archived_at IS NULL', 'deleted_at IS NULL'];
      const bindings: string[] = [];
      if (status !== undefined) {
        conditions.push('status = ?');
        bindings.push(status);
      }
      const row = await db
        .prepare(`SELECT count(*) AS n FROM posts WHERE ${conditions.join(' AND ')}`)
        .bind(...bindings)
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
      const results = await db.batch<PostRow | MediaRow>([
        db
          .prepare(
            `INSERT INTO post_revisions (post_id, revision, title, body, entities, status, created_at, media_json)
             SELECT id, revision + 1, ${NEW_TITLE}, COALESCE(?4, body), COALESCE(?5, entities), status, ?6, '[]'
             FROM posts WHERE ${GUARD}`
          )
          .bind(
            change.id,
            change.expectedRevision,
            change.title ?? null,
            change.body ?? null,
            entities,
            change.now,
            null,
            change.body === undefined ? null : postNameFromBody(change.body)
          ),
        auditStatement(db, 'post.update', change, { revision: change.expectedRevision + 1, fields }),
        db
          .prepare(
            `UPDATE posts SET title = ${NEW_TITLE},
               title_sort_key = CASE WHEN title_in_message = 0 THEN COALESCE(?9, title_sort_key)
                 ELSE COALESCE(?7, title_sort_key) END,
               body = COALESCE(?4, body), entities = COALESCE(?5, entities),
               revision = revision + 1, updated_at = ?6
             WHERE ${GUARD} RETURNING ${POST_COLUMNS}`
          )
          .bind(
            change.id,
            change.expectedRevision,
            change.title ?? null,
            change.body ?? null,
            entities,
            change.now,
            change.title === undefined ? null : postTitleSortKey(change.title),
            change.body === undefined ? null : postNameFromBody(change.body),
            change.body === undefined ? null : postTitleSortKey(postNameFromBody(change.body))
          ),
        // Read in the same batch as the write, so the media returned is the media of the revision returned.
        mediaStatement(db, [change.id])
      ]);
      const row = results[2]?.results[0] as PostRow | undefined;
      return row === undefined
        ? null
        : (withMedia([toRecord(row)], (results[3]?.results ?? []) as MediaRow[])[0] ?? null);
    },

    async approve(change) {
      const results = await db.batch<PostRow | MediaRow>([
        db
          .prepare(
            `INSERT INTO post_revisions (post_id, revision, title, body, entities, status, created_at, media_json)
             SELECT id, revision + 1, title, body, entities, 'approved', ?3,
                    COALESCE((SELECT json_group_array(media_id) FROM
                      (SELECT media_id FROM post_media WHERE post_id = posts.id ORDER BY position)), '[]')
               FROM posts WHERE ${GUARD}`
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
          .bind(change.id, change.expectedRevision, change.now),
        mediaStatement(db, [change.id])
      ]);
      const row = results[2]?.results[0] as PostRow | undefined;
      return row === undefined
        ? null
        : (withMedia([toRecord(row)], (results[3]?.results ?? []) as MediaRow[])[0] ?? null);
    }
  };
}
