import {
  type MediaLibraryItemDto,
  type PostMediaDto,
  mediaLibraryItemSchema,
  postMediaSchema
} from '@alexeev/contracts';
import type { MediaPostState, PostMediaRepository, StoredUpload } from '../application/media-ports';

interface MediaRow {
  id: string;
  kind: PostMediaDto['kind'];
  file_name: string;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  position: number;
  created_at?: number;
}

function toMedia(row: MediaRow): PostMediaDto {
  return postMediaSchema.parse({
    id: row.id,
    kind: row.kind,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    position: row.position
  });
}

const guardedPost = "id = ?1 AND revision = ?2 AND status = 'draft'";

export function createD1PostMediaRepository(db: D1Database): PostMediaRepository {
  return {
    async registerStaging(mediaId, objectKey, now) {
      const result = await db
        .prepare(
          'INSERT INTO post_media_cleanup (media_id, object_key, staging, attempts, created_at) VALUES (?1, ?2, 1, 0, ?3) ON CONFLICT (media_id) DO NOTHING'
        )
        .bind(mediaId, objectKey, now)
        .run();
      if (result.meta.changes !== 1) throw new Error('Could not claim a unique media staging key');
    },

    async removeStaging(mediaId) {
      await db.prepare('DELETE FROM post_media_cleanup WHERE media_id = ?1').bind(mediaId).run();
    },

    async findUpload(postId, idempotencyKey) {
      return db
        .prepare(
          'SELECT payload_hash AS payloadHash, response_body AS responseBody FROM post_media_uploads WHERE post_id = ?1 AND idempotency_key = ?2'
        )
        .bind(postId, idempotencyKey)
        .first<StoredUpload>();
    },

    async findPostState(postId): Promise<MediaPostState | null> {
      const post = await db
        .prepare('SELECT revision, status FROM posts WHERE id = ?1')
        .bind(postId)
        .first<{ revision: number; status: 'draft' | 'approved' }>();
      if (post === null) return null;
      const { results } = await db
        .prepare(
          `SELECT m.id, m.kind, m.file_name, m.content_type, m.size_bytes, m.width, m.height, m.duration_ms, pm.position
             FROM post_media pm JOIN media_assets m ON m.id = pm.media_id
            WHERE pm.post_id = ?1 ORDER BY pm.position`
        )
        .bind(postId)
        .all<MediaRow>();
      return { revision: post.revision, status: post.status, media: results.map(toMedia) };
    },

    async listLibrary({ kind, after, limit }): Promise<MediaLibraryItemDto[]> {
      const kindClause =
        kind === 'all' ? '' : kind === 'photo' ? "AND m.kind = 'photo'" : "AND m.kind IN ('video', 'animation')";
      const cursorClause = after === undefined ? '' : 'AND (m.created_at < ?1 OR (m.created_at = ?1 AND m.id < ?2))';
      const bindings: (string | number)[] = [];
      if (after !== undefined) bindings.push(after.createdAt, after.id);
      bindings.push(limit + 1);
      const limitPlaceholder = `?${bindings.length}`;
      const { results } = await db
        .prepare(
          `SELECT m.id, m.kind, m.file_name, m.content_type, m.size_bytes, m.width, m.height, m.duration_ms, m.created_at
             FROM media_assets m
            WHERE (EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = m.id)
               OR EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = m.id))
               ${kindClause} ${cursorClause}
            ORDER BY m.created_at DESC, m.id DESC LIMIT ${limitPlaceholder}`
        )
        .bind(...bindings)
        .all<MediaRow>();
      return results.map((row) =>
        mediaLibraryItemSchema.parse({
          id: row.id,
          kind: row.kind,
          fileName: row.file_name,
          contentType: row.content_type,
          sizeBytes: row.size_bytes,
          width: row.width,
          height: row.height,
          durationMs: row.duration_ms,
          createdAt: new Date(row.created_at ?? 0).toISOString()
        })
      );
    },

    async findRetainedMedia(mediaIds) {
      if (mediaIds.length === 0) return [];
      const { results } = await db
        .prepare(
          `SELECT m.id, m.kind, m.file_name, m.content_type, m.size_bytes, m.width, m.height, m.duration_ms,
                CAST(requested.key AS INTEGER) AS position
           FROM json_each(?1) requested JOIN media_assets m ON m.id = requested.value
          WHERE EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = m.id)
             OR EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = m.id)
          ORDER BY CAST(requested.key AS INTEGER)`
        )
        .bind(JSON.stringify(mediaIds))
        .all<MediaRow>();
      return results.map(toMedia);
    },

    async attachRetained({ postId, expectedRevision, actor, now, currentIds, mediaIds }) {
      const fullIds = [...currentIds, ...mediaIds];
      const guard = (
        mediaListParam: number,
        expectedCount: number
      ) => `EXISTS (SELECT 1 FROM posts p WHERE p.id = ?1 AND p.revision = ?2 AND p.status = 'draft'
        AND (SELECT count(*) FROM post_media WHERE post_id = p.id) = ${expectedCount}
        AND (SELECT count(*) FROM post_media WHERE post_id = p.id) + ${mediaIds.length} <= 10
        AND NOT EXISTS (SELECT 1 FROM json_each(?${mediaListParam}) requested WHERE NOT EXISTS (
          SELECT 1 FROM media_assets m WHERE m.id = requested.value AND (
            EXISTS (SELECT 1 FROM post_media retained WHERE retained.media_id = m.id) OR
            EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) ref WHERE ref.value = m.id)))) )`;
      const statements: D1PreparedStatement[] = [];
      for (const [index, mediaId] of mediaIds.entries()) {
        statements.push(
          db
            .prepare(
              `INSERT INTO post_media (post_id, media_id, position)
             SELECT ?1, ?3, ${currentIds.length + index} WHERE ${guard(4, currentIds.length + index)}`
            )
            .bind(postId, expectedRevision, mediaId, JSON.stringify(mediaIds))
        );
      }
      statements.push(
        db
          .prepare(
            `INSERT INTO post_revisions (post_id, revision, title, body, entities, status, created_at, media_json)
          SELECT id, revision + 1, title, body, entities, status, ?3, ?4 FROM posts WHERE ${guard(5, fullIds.length)}`
          )
          .bind(postId, expectedRevision, now, JSON.stringify(fullIds), JSON.stringify(mediaIds)),
        db
          .prepare(
            `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
          SELECT ?3, 'post.media.attach_library', 'post', id, ?4, ?5 FROM posts WHERE ${guard(6, fullIds.length)}`
          )
          .bind(
            postId,
            expectedRevision,
            actor,
            now,
            JSON.stringify({ revision: expectedRevision + 1, mediaIds }),
            JSON.stringify(mediaIds)
          ),
        db
          .prepare(
            `UPDATE posts SET revision = revision + 1, updated_at = ?3 WHERE id = ?1 AND revision = ?2 AND status = 'draft'
          AND ${guard(4, fullIds.length)}`
          )
          .bind(postId, expectedRevision, now, JSON.stringify(mediaIds))
      );
      const results = await db.batch(statements);
      return results.at(-1)?.meta.changes === 1;
    },

    async attach(input) {
      const { asset } = input;
      const response = JSON.parse(input.responseBody) as { media: PostMediaDto; revision: number };
      const claim = db
        .prepare(
          `INSERT INTO post_media_uploads (post_id, idempotency_key, payload_hash, media_id, response_body, created_at)
           SELECT ?1, ?3, ?4, ?5, ?6, ?7 FROM posts p
            WHERE p.id = ?1 AND p.revision = ?2 AND p.status = 'draft'
              AND (SELECT count(*) FROM post_media WHERE post_id = p.id) < 10
              AND EXISTS (SELECT 1 FROM post_media_cleanup s WHERE s.media_id = ?5 AND s.staging = 1)
           ON CONFLICT (post_id, idempotency_key) DO NOTHING`
        )
        .bind(
          input.postId,
          input.expectedRevision,
          input.idempotencyKey,
          input.payloadHash,
          asset.id,
          input.responseBody,
          input.now
        );
      const claimGuard = `EXISTS (SELECT 1 FROM post_media_uploads u WHERE u.post_id = ?1 AND u.idempotency_key = ?3 AND u.media_id = ?4 AND u.payload_hash = ?5)`;
      const statements: D1PreparedStatement[] = [
        claim,
        db
          .prepare(
            `INSERT INTO media_assets (id, object_key, sha256, kind, file_name, content_type, size_bytes, width, height, duration_ms, created_at)
             SELECT ?4, ?6, ?5, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14 WHERE ${claimGuard}`
          )
          .bind(
            input.postId,
            input.expectedRevision,
            input.idempotencyKey,
            asset.id,
            input.payloadHash,
            asset.objectKey,
            asset.kind,
            asset.fileName,
            asset.contentType,
            asset.sizeBytes,
            asset.width,
            asset.height,
            asset.durationMs,
            asset.createdAt
          ),
        db
          .prepare(
            `INSERT INTO post_media (post_id, media_id, position)
             SELECT ?1, ?4, (SELECT count(*) FROM post_media WHERE post_id = ?1) WHERE ${claimGuard}`
          )
          .bind(input.postId, input.expectedRevision, input.idempotencyKey, asset.id, input.payloadHash),
        db
          .prepare(
            `INSERT INTO post_revisions (post_id, revision, title, body, entities, status, created_at, media_json)
             SELECT id, revision + 1, title, body, entities, status, ?6, '[]' FROM posts
              WHERE ${guardedPost} AND ${claimGuard}`
          )
          .bind(input.postId, input.expectedRevision, input.idempotencyKey, asset.id, input.payloadHash, input.now),
        db
          .prepare(
            `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
             SELECT ?3, 'post.media.attach', 'post', id, ?6, ?7 FROM posts
              WHERE ${guardedPost} AND ${claimGuard}`
          )
          .bind(
            input.postId,
            input.expectedRevision,
            input.actor,
            asset.id,
            input.payloadHash,
            input.now,
            JSON.stringify({ revision: response.revision, mediaId: asset.id })
          ),
        db
          .prepare(
            `UPDATE posts SET revision = revision + 1, updated_at = ?6
              WHERE ${guardedPost} AND ${claimGuard}`
          )
          .bind(input.postId, input.expectedRevision, input.idempotencyKey, asset.id, input.payloadHash, input.now),
        db
          .prepare(
            'DELETE FROM post_media_cleanup WHERE media_id = ?1 AND staging = 1 AND EXISTS (SELECT 1 FROM post_media WHERE post_id = ?2 AND media_id = ?1)'
          )
          .bind(asset.id, input.postId)
      ];
      const results = await db.batch(statements);
      return results[0]?.meta.changes === 1 && results[5]?.meta.changes === 1;
    },

    async rewrite(input) {
      const placeholders = input.mediaIds.map((_, index) => `?${index + 3}`).join(', ');
      const removal =
        input.mediaIds.length === 0
          ? `DELETE FROM post_media WHERE post_id = ?1 AND EXISTS (SELECT 1 FROM posts WHERE ${guardedPost})`
          : `DELETE FROM post_media WHERE post_id = ?1 AND media_id NOT IN (${placeholders}) AND EXISTS (SELECT 1 FROM posts WHERE ${guardedPost})`;
      const statements: D1PreparedStatement[] = [
        db.prepare(removal).bind(input.postId, input.expectedRevision, ...input.mediaIds)
      ];
      for (const [position, mediaId] of input.mediaIds.entries()) {
        statements.push(
          db
            .prepare(
              `UPDATE post_media SET position = ?4 WHERE post_id = ?1 AND media_id = ?3
                AND EXISTS (SELECT 1 FROM posts WHERE ${guardedPost})`
            )
            .bind(input.postId, input.expectedRevision, mediaId, position)
        );
      }
      statements.push(
        db
          .prepare(
            `INSERT INTO post_revisions (post_id, revision, title, body, entities, status, created_at, media_json)
             SELECT id, revision + 1, title, body, entities, status, ?3, '[]' FROM posts WHERE ${guardedPost}`
          )
          .bind(input.postId, input.expectedRevision, input.now),
        db
          .prepare(
            `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
             SELECT ?3, 'post.media.change', 'post', id, ?4, ?5 FROM posts WHERE ${guardedPost}`
          )
          .bind(
            input.postId,
            input.expectedRevision,
            input.actor,
            input.now,
            JSON.stringify({ revision: input.expectedRevision + 1, mediaIds: input.mediaIds })
          ),
        db
          .prepare(`UPDATE posts SET revision = revision + 1, updated_at = ?3 WHERE ${guardedPost}`)
          .bind(input.postId, input.expectedRevision, input.now)
      );
      const results = await db.batch(statements);
      return results.at(-1)?.meta.changes === 1;
    },

    async findObjectKey(mediaId) {
      const row = await db
        .prepare(
          `SELECT m.object_key FROM media_assets m WHERE m.id = ?1 AND (
             EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = m.id) OR
             EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = m.id))`
        )
        .bind(mediaId)
        .first<{ object_key: string }>();
      return row?.object_key ?? null;
    },

    async claimCleanup(limit, now) {
      const { results } = await db
        .prepare(
          `UPDATE post_media_cleanup SET staging = 2, claim_until = ?2 + 900000
            WHERE media_id IN (
              SELECT media_id FROM post_media_cleanup
               WHERE staging = 0 OR (staging = 1 AND created_at <= ?2 - 900000) OR (staging = 2 AND claim_until <= ?2)
               ORDER BY created_at, media_id LIMIT ?1
            )
              AND (staging = 0 OR (staging = 1 AND created_at <= ?2 - 900000) OR (staging = 2 AND claim_until <= ?2))
            RETURNING media_id AS mediaId, object_key AS objectKey`
        )
        .bind(limit, now)
        .all<{ mediaId: string; objectKey: string }>();
      return results;
    },

    async stagingIsActive(mediaId) {
      const row = await db
        .prepare('SELECT EXISTS (SELECT 1 FROM post_media_cleanup WHERE media_id = ?1 AND staging = 1) AS active')
        .bind(mediaId)
        .first<{ active: number }>();
      return row?.active === 1;
    },

    async cleanupIsReferenced(mediaId) {
      const row = await db
        .prepare(
          `SELECT EXISTS (SELECT 1 FROM post_media WHERE media_id = ?1) OR
                  EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = ?1) AS referenced`
        )
        .bind(mediaId)
        .first<{ referenced: number }>();
      return row?.referenced === 1;
    },

    async completeCleanup(mediaId) {
      await db.batch([
        db.prepare('DELETE FROM post_media_cleanup WHERE media_id = ?1 AND staging = 2').bind(mediaId),
        db
          .prepare(
            `DELETE FROM post_media_uploads WHERE media_id = ?1
              AND NOT EXISTS (SELECT 1 FROM post_media WHERE media_id = ?1)
              AND NOT EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = ?1)`
          )
          .bind(mediaId),
        db
          .prepare(
            `DELETE FROM media_assets WHERE id = ?1
              AND NOT EXISTS (SELECT 1 FROM post_media WHERE media_id = ?1)
              AND NOT EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = ?1)`
          )
          .bind(mediaId)
      ]);
    },

    async failCleanup(mediaId) {
      await db
        .prepare(
          'UPDATE post_media_cleanup SET staging = 0, claim_until = NULL, attempts = attempts + 1 WHERE media_id = ?1 AND staging = 2'
        )
        .bind(mediaId)
        .run();
    }
  };
}
