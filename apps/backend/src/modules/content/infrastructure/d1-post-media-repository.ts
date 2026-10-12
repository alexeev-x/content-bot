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
  source_media_id?: string | null;
  created_at?: number;
}

function toMedia(row: MediaRow): PostMediaDto {
  return postMediaSchema.parse({
    id: row.id,
    sourceMediaId: row.source_media_id ?? null,
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

// An asset is retained, hence listed, readable and attachable, while a draft holds it, a revision snapshot
// names it, or a derivative (a crop) keeps it as its source. Every read and the attach guard share this
// predicate, so anything the library lists can be attached.
function isRetainedSql(idExpression: string): string {
  return `(EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = ${idExpression})
    OR EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = ${idExpression})
    OR EXISTS (SELECT 1 FROM media_assets derivative WHERE derivative.source_media_id = ${idExpression}))`;
}

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

    async findCrop(postId, idempotencyKey) {
      const row = await db
        .prepare(
          `SELECT state, request_id AS requestId, lease_until AS leaseUntil,
                  payload_hash AS payloadHash, response_body AS responseBody, media_id AS mediaId
             FROM post_media_crops WHERE post_id = ?1 AND idempotency_key = ?2`
        )
        .bind(postId, idempotencyKey)
        .first<{
          state: 'in_flight' | 'completed';
          requestId: string | null;
          leaseUntil: number | null;
          payloadHash: string | null;
          responseBody: string | null;
          mediaId: string | null;
        }>();
      if (row === null) return null;
      if (row.state === 'in_flight' && row.requestId !== null && row.leaseUntil !== null)
        return { state: 'in_flight', requestId: row.requestId, leaseUntil: row.leaseUntil };
      if (row.state === 'completed' && row.payloadHash !== null && row.responseBody !== null && row.mediaId !== null)
        return {
          state: 'completed',
          payloadHash: row.payloadHash,
          responseBody: row.responseBody,
          mediaId: row.mediaId
        };
      throw new Error('Stored crop idempotency state is invalid');
    },

    async claimCrop(postId, idempotencyKey, requestId, now) {
      const leaseUntil = now + 10 * 60 * 1000;
      const claimed = await db
        .prepare(
          `INSERT INTO post_media_crops (post_id, idempotency_key, state, request_id, lease_until, created_at)
           VALUES (?1, ?2, 'in_flight', ?3, ?4, ?5)
           ON CONFLICT (post_id, idempotency_key) DO UPDATE SET
             state = 'in_flight', request_id = excluded.request_id, lease_until = excluded.lease_until,
             payload_hash = NULL, media_id = NULL, response_body = NULL, created_at = excluded.created_at
           WHERE post_media_crops.state = 'in_flight' AND post_media_crops.lease_until <= excluded.created_at`
        )
        .bind(postId, idempotencyKey, requestId, leaseUntil, now)
        .run();
      if (claimed.meta.changes === 1) return 'claimed';
      const existing = await this.findCrop(postId, idempotencyKey);
      if (existing?.state === 'completed') return 'completed';
      return 'in_flight';
    },

    async releaseCrop(postId, idempotencyKey, requestId) {
      await db
        .prepare(
          `DELETE FROM post_media_crops
            WHERE post_id = ?1 AND idempotency_key = ?2 AND state = 'in_flight' AND request_id = ?3`
        )
        .bind(postId, idempotencyKey, requestId)
        .run();
    },

    async findPostState(postId): Promise<MediaPostState | null> {
      const post = await db
        .prepare('SELECT revision, status FROM posts WHERE id = ?1')
        .bind(postId)
        .first<{ revision: number; status: 'draft' | 'approved' }>();
      if (post === null) return null;
      const { results } = await db
        .prepare(
          `SELECT m.id, m.kind, m.file_name, m.content_type, m.size_bytes, m.width, m.height, m.duration_ms,
                  m.source_media_id, pm.position
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
            WHERE ${isRetainedSql('m.id')}
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
                m.source_media_id,
                CAST(requested.key AS INTEGER) AS position
           FROM json_each(?1) requested JOIN media_assets m ON m.id = requested.value
          WHERE ${isRetainedSql('m.id')}
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
        expectedCount: number,
        conflicts: { nextRevision?: boolean; alreadyAttached?: boolean } = {}
      ) => `EXISTS (SELECT 1 FROM posts p WHERE p.id = ?1 AND p.revision = ?2 AND p.status = 'draft'
        AND (SELECT count(*) FROM post_media WHERE post_id = p.id) = ${expectedCount}
        AND (SELECT count(*) FROM post_media WHERE post_id = p.id) + ${mediaIds.length} <= 10
        ${conflicts.nextRevision ? 'AND NOT EXISTS (SELECT 1 FROM post_revisions r WHERE r.post_id = p.id AND r.revision = p.revision + 1)' : ''}
        ${
          conflicts.alreadyAttached
            ? `AND NOT EXISTS (SELECT 1 FROM post_media attached JOIN json_each(?${mediaListParam}) requested
          ON requested.value = attached.media_id WHERE attached.post_id = p.id)`
            : ''
        }
        AND NOT EXISTS (SELECT 1 FROM json_each(?${mediaListParam}) requested WHERE NOT EXISTS (
          SELECT 1 FROM media_assets m WHERE m.id = requested.value AND ${isRetainedSql('m.id')})) )`;
      const statements: D1PreparedStatement[] = [];
      for (const [index, mediaId] of mediaIds.entries()) {
        statements.push(
          db
            .prepare(
              `INSERT INTO post_media (post_id, media_id, position)
             SELECT ?1, ?3, ${currentIds.length + index} WHERE ${guard(4, currentIds.length + index, {
               nextRevision: index === 0,
               alreadyAttached: index === 0
             })}`
            )
            .bind(postId, expectedRevision, mediaId, JSON.stringify(mediaIds))
        );
      }
      statements.push(
        db
          .prepare(
            `INSERT INTO post_revisions (post_id, revision, title, body, entities, status, created_at, media_json)
          SELECT id, revision + 1, title, body, entities, status, ?3, ?4 FROM posts WHERE ${guard(5, fullIds.length, {
            nextRevision: true
          })}`
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

    async replaceWithCrop(input) {
      const { asset } = input;
      const reservation = `EXISTS (SELECT 1 FROM post_media_crops c
        WHERE c.post_id = ?1 AND c.idempotency_key = ?3 AND c.state = 'in_flight' AND c.request_id = ?4)`;
      const current = `EXISTS (SELECT 1 FROM posts p JOIN post_media pm ON pm.post_id = p.id
        JOIN media_assets source ON source.id = pm.media_id
        WHERE p.id = ?1 AND p.revision = ?2 AND p.status = 'draft'
          AND pm.media_id = ?5 AND source.kind = 'photo' AND pm.position = ?6)`;
      const guards = `${reservation} AND ${current}
        AND EXISTS (SELECT 1 FROM post_media_cleanup staging WHERE staging.media_id = ?7 AND staging.staging = 1)`;
      const response = JSON.parse(input.responseBody) as { media: PostMediaDto; revision: number };
      const statements: D1PreparedStatement[] = [
        db
          .prepare(
            `INSERT INTO media_assets (id, object_key, sha256, kind, file_name, content_type, size_bytes, width, height, duration_ms, created_at, source_media_id)
           SELECT ?7, ?8, ?9, 'photo', ?10, ?11, ?12, ?13, ?14, NULL, ?15, ?16 WHERE ${guards}`
          )
          .bind(
            input.postId,
            input.expectedRevision,
            input.idempotencyKey,
            input.requestId,
            input.sourceMediaId,
            input.position,
            asset.id,
            asset.objectKey,
            asset.sha256,
            asset.fileName,
            asset.contentType,
            asset.sizeBytes,
            asset.width,
            asset.height,
            asset.createdAt,
            asset.sourceMediaId
          ),
        db
          .prepare(`DELETE FROM post_media WHERE post_id = ?1 AND media_id = ?5 AND position = ?6 AND ${guards}`)
          .bind(
            input.postId,
            input.expectedRevision,
            input.idempotencyKey,
            input.requestId,
            input.sourceMediaId,
            input.position,
            asset.id
          ),
        db
          .prepare(
            `INSERT INTO post_media (post_id, media_id, position)
           SELECT ?1, ?7, ?6 WHERE ${reservation}
             AND EXISTS (SELECT 1 FROM posts p WHERE p.id = ?1 AND p.revision = ?2 AND p.status = 'draft')
             AND NOT EXISTS (SELECT 1 FROM post_media WHERE post_id = ?1 AND media_id = ?5)
             AND EXISTS (SELECT 1 FROM media_assets WHERE id = ?7)
             AND EXISTS (SELECT 1 FROM post_media_cleanup staging WHERE staging.media_id = ?7 AND staging.staging = 1)`
          )
          .bind(
            input.postId,
            input.expectedRevision,
            input.idempotencyKey,
            input.requestId,
            input.sourceMediaId,
            input.position,
            asset.id
          ),
        db
          .prepare(
            `INSERT INTO post_revisions (post_id, revision, title, body, entities, status, created_at, media_json)
           SELECT id, revision + 1, title, body, entities, status, ?7, '[]' FROM posts
            WHERE id = ?1 AND revision = ?2 AND status = 'draft' AND ${reservation}
              AND EXISTS (SELECT 1 FROM post_media WHERE post_id = ?1 AND media_id = ?6)`
          )
          .bind(
            input.postId,
            input.expectedRevision,
            input.idempotencyKey,
            input.requestId,
            input.sourceMediaId,
            asset.id,
            input.now
          ),
        db
          .prepare(
            `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
           SELECT ?5, 'post.media.crop', 'post', id, ?7, ?8 FROM posts
            WHERE id = ?1 AND revision = ?2 AND status = 'draft' AND ${reservation}
              AND EXISTS (SELECT 1 FROM post_media WHERE post_id = ?1 AND media_id = ?6)`
          )
          .bind(
            input.postId,
            input.expectedRevision,
            input.idempotencyKey,
            input.requestId,
            input.actor,
            asset.id,
            input.now,
            JSON.stringify({ revision: response.revision, sourceMediaId: input.sourceMediaId, mediaId: asset.id })
          ),
        db
          .prepare(
            `UPDATE posts SET revision = revision + 1, updated_at = ?7
            WHERE id = ?1 AND revision = ?2 AND status = 'draft' AND ${reservation}
              AND EXISTS (SELECT 1 FROM post_media WHERE post_id = ?1 AND media_id = ?6)`
          )
          .bind(
            input.postId,
            input.expectedRevision,
            input.idempotencyKey,
            input.requestId,
            input.sourceMediaId,
            asset.id,
            input.now
          ),
        db
          .prepare(
            `UPDATE post_media_crops SET state = 'completed', request_id = NULL, lease_until = NULL,
             payload_hash = ?5, media_id = ?6, response_body = ?7
            WHERE post_id = ?1 AND idempotency_key = ?2 AND state = 'in_flight' AND request_id = ?3
              AND EXISTS (SELECT 1 FROM posts WHERE id = ?1 AND revision = ?4 + 1)
              AND EXISTS (SELECT 1 FROM post_media WHERE post_id = ?1 AND media_id = ?6)`
          )
          .bind(
            input.postId,
            input.idempotencyKey,
            input.requestId,
            input.expectedRevision,
            input.payloadHash,
            asset.id,
            input.responseBody
          ),
        db.prepare('DELETE FROM post_media_cleanup WHERE media_id = ?1 AND staging = 1').bind(asset.id)
      ];
      const results = await db.batch(statements);
      return results[5]?.meta.changes === 1 && results[6]?.meta.changes === 1;
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
        .prepare(`SELECT m.object_key FROM media_assets m WHERE m.id = ?1 AND ${isRetainedSql('m.id')}`)
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
        .prepare(`SELECT ${isRetainedSql('?1')} AS referenced`)
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
            `DELETE FROM post_media_crops WHERE media_id = ?1
              AND NOT EXISTS (SELECT 1 FROM post_media WHERE media_id = ?1)
              AND NOT EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = ?1)`
          )
          .bind(mediaId),
        db
          .prepare(
            `DELETE FROM media_assets WHERE id = ?1
              AND NOT EXISTS (SELECT 1 FROM post_media WHERE media_id = ?1)
              AND NOT EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = ?1)
              AND NOT EXISTS (SELECT 1 FROM media_assets derivative WHERE derivative.source_media_id = ?1)`
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
