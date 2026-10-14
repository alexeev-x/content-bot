import {
  type MediaLibraryItemDto,
  type MediaUsageDto,
  type PostMediaDto,
  MEDIA_DETACH_DRAFTS_MAX,
  MEDIA_DELETED_CANCEL_CODE,
  type MediaDetach,
  MEDIA_USAGE_LIST_MAX,
  mediaLibraryItemSchema,
  mediaUsageSchema,
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
  duplicate_count?: number;
  usage_count?: number;
  deletable?: number;
  usages?: string;
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

const guardedPost = "id = ?1 AND revision = ?2 AND status = 'draft' AND deleted_at IS NULL";

// An asset is retained, hence listed, readable and attachable, while a draft holds it, a revision snapshot
// names it (for a replaced original, library_state 2, only a publication snapshot counts), a derivative (a crop) keeps it as its source, or it was saved to the library on its own. Every read and the attach guard share this
// predicate, so anything the library lists can be attached.
function revisionHoldSql(idExpression: string): string {
  return `(EXISTS (SELECT 1 FROM media_assets draftable WHERE draftable.id = ${idExpression} AND draftable.library_state <> 2
      AND EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = ${idExpression}))
    OR EXISTS (SELECT 1 FROM publications pu
      JOIN post_revisions r ON r.post_id = pu.post_id AND r.revision = pu.post_revision, json_each(r.media_json) j
      WHERE j.value = ${idExpression}))`;
}

function isRetainedSql(idExpression: string): string {
  return `(EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = ${idExpression})
    OR ${revisionHoldSql(idExpression)}
    OR EXISTS (SELECT 1 FROM media_assets derivative WHERE derivative.source_media_id = ${idExpression})
    OR EXISTS (SELECT 1 FROM media_assets own WHERE own.id = ${idExpression} AND own.in_library = 1))`;
}

// Nothing holds the asset: no post attachment (any status), no publication snapshot and no crop derived
// from it. Evaluated inside the DELETE itself, so an attach racing with a delete either lands first
// (the delete then matches nothing) or finds the asset gone (the attach guard then fails).
function isDeletableSql(idExpression: string): string {
  return `(NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = ${idExpression})
    AND NOT EXISTS (SELECT 1 FROM publications pu
      JOIN post_revisions r ON r.post_id = pu.post_id AND r.revision = pu.post_revision, json_each(r.media_json) j
      WHERE j.value = ${idExpression})
    AND NOT EXISTS (SELECT 1 FROM media_assets derivative WHERE derivative.source_media_id = ${idExpression}))`;
}

// Blocked members of a selection of ids deleted together (bind it as ?1, a JSON array). A member is blocked
// when a post holds it, a publication snapshot names it, or a derivative outside the selection still
// points at it; blocking propagates to the source of a blocked member that is also selected. So a source
// and its crop chosen together are both deleted or both kept, whatever order the ids arrive in.
// detach 'drafts': a draft's own attachment does not block (it is removed first), but a file held by more
// than MEDIA_DETACH_DRAFTS_MAX drafts stays blocked: the detach stays bounded.
// detach 'all': nothing blocks except a publication whose job is claimed or unknown (a send may be in
// flight or unconfirmed: never touched), a derivative outside the selection and that draft bound.
function selectionBlockedCte(detach: MediaDetach | undefined): string {
  const draftsOverBound = `(SELECT count(*) FROM post_media pm JOIN posts p ON p.id = pm.post_id
            WHERE pm.media_id = m.id AND p.status = 'draft') > ${MEDIA_DETACH_DRAFTS_MAX}`;
  const postHolds =
    detach === 'all'
      ? draftsOverBound
      : detach === 'drafts'
        ? `EXISTS (SELECT 1 FROM post_media pm JOIN posts p ON p.id = pm.post_id
               WHERE pm.media_id = m.id AND p.status <> 'draft')
       OR ${draftsOverBound}`
        : 'EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = m.id)';
  const snapshotHolds =
    detach === 'all'
      ? `EXISTS (SELECT 1 FROM publications pu
            JOIN jobs jb ON jb.publication_id = pu.id AND jb.status IN ('claimed', 'unknown')
            JOIN post_revisions r ON r.post_id = pu.post_id AND r.revision = pu.post_revision, json_each(r.media_json) j
            WHERE j.value = m.id)`
      : `EXISTS (SELECT 1 FROM publications pu
            JOIN post_revisions r ON r.post_id = pu.post_id AND r.revision = pu.post_revision, json_each(r.media_json) j
            WHERE j.value = m.id)`;
  return `WITH RECURSIVE blocked(id) AS (
  SELECT m.id FROM media_assets m
   WHERE m.id IN (SELECT value FROM json_each(?1))
     AND (${postHolds}
       OR ${snapshotHolds}
       OR EXISTS (SELECT 1 FROM media_assets d
            WHERE d.source_media_id = m.id AND d.id NOT IN (SELECT value FROM json_each(?1))))
  UNION
  SELECT m.source_media_id FROM media_assets m JOIN blocked b ON m.id = b.id
   WHERE m.source_media_id IN (SELECT value FROM json_each(?1))
)`;
}

const libraryItemSelect = `SELECT m.id, m.kind, m.file_name, m.content_type, m.size_bytes, m.width, m.height, m.duration_ms, m.created_at,
                  (SELECT count(*) FROM media_assets duplicate
                    WHERE duplicate.sha256 = m.sha256 AND ${isRetainedSql('duplicate.id')}) AS duplicate_count,
                  (SELECT count(*) FROM post_media current_usage WHERE current_usage.media_id = m.id) AS usage_count,
                  ${isDeletableSql('m.id')} AS deletable,
                  (SELECT json_group_array(json_object('postId', post_id, 'title', title)) FROM (
                    SELECT p.id AS post_id, p.title
                      FROM post_media linked JOIN posts p ON p.id = linked.post_id
                     WHERE linked.media_id = m.id
                     ORDER BY p.created_at DESC, p.id DESC LIMIT 3
                  )) AS usages`;

function toLibraryItem(row: MediaRow): MediaLibraryItemDto {
  return mediaLibraryItemSchema.parse({
    id: row.id,
    kind: row.kind,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    createdAt: new Date(row.created_at ?? 0).toISOString(),
    duplicateCount: row.duplicate_count,
    usageCount: row.usage_count,
    deletable: row.deletable === 1,
    usages: JSON.parse(row.usages ?? '[]')
  });
}

export function createD1PostMediaRepository(db: D1Database): PostMediaRepository {
  // The swap of mode=replace. It runs in the same batch as the derivative's insert and every statement is
  // guarded by that insert (the claim row names the new asset id, so a replay or a lost race matches nothing).
  // Drafts are identified by status at statement time, inside the batch transaction: an approve landing
  // first leaves its post (and snapshot) on the source, one landing later snapshots the new item.
  // Revision bump = an edit (new revision row, audit row, revision + 1), so a stale editor gets STALE_REVISION.
  const replaceStatements = (input: {
    idempotencyKey: string;
    sourceMediaId: string;
    payloadHash: string;
    actor: string;
    now: number;
    asset: { id: string };
  }): D1PreparedStatement[] => {
    const guard = `EXISTS (SELECT 1 FROM media_derivations d WHERE d.idempotency_key = ?1 AND d.media_id = ?4 AND d.payload_hash = ?3)
      AND EXISTS (SELECT 1 FROM media_assets WHERE id = ?4)`;
    // Drafts already swapped by the first statement: the only post_media rows naming the brand new asset.
    const swapped = `p.status = 'draft' AND p.deleted_at IS NULL AND EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = p.id AND pm.media_id = ?4)`;
    // D1 rejects a statement bound to more values than its highest ?N, so each one takes only what it names.
    const prepare = (sql: string) =>
      db.prepare(sql).bind(...binds.slice(0, Math.max(...[...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1])))));
    const binds = [
      input.idempotencyKey,
      input.sourceMediaId,
      input.payloadHash,
      input.asset.id,
      input.actor,
      input.now
    ];
    return [
      prepare(
        `UPDATE post_media SET media_id = ?4
            WHERE media_id = ?2 AND post_id IN (SELECT id FROM posts WHERE status = 'draft' AND deleted_at IS NULL) AND ${guard}`
      ),
      prepare(
        `INSERT INTO post_revisions (post_id, revision, title, body, entities, status, created_at, media_json)
           SELECT p.id, p.revision + 1, p.title, p.body, p.entities, p.status, ?6, '[]' FROM posts p
            WHERE ${swapped} AND ${guard}`
      ),
      prepare(
        `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
           SELECT ?5, 'post.media.replace', 'post', p.id, ?6,
                  json_object('revision', p.revision + 1, 'sourceMediaId', ?2, 'mediaId', ?4)
             FROM posts p WHERE ${swapped} AND ${guard}`
      ),
      prepare(`UPDATE posts AS p SET revision = revision + 1, updated_at = ?6 WHERE ${swapped} AND ${guard}`),
      prepare(`UPDATE media_assets SET in_library = 0, library_state = 2 WHERE id = ?2 AND ${guard}`),
      // After the flags above, the same rule as the detach trigger: queue the object only if nothing holds it.
      prepare(
        `INSERT OR IGNORE INTO post_media_cleanup (media_id, object_key, attempts, created_at)
           SELECT m.id, m.object_key, 0, m.created_at FROM media_assets m
            WHERE m.id = ?2 AND m.in_library = 0 AND ${guard}
              AND NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = m.id)
              AND NOT EXISTS (SELECT 1 FROM publications pu
                JOIN post_revisions r ON r.post_id = pu.post_id AND r.revision = pu.post_revision, json_each(r.media_json) j
                WHERE j.value = m.id)
              AND NOT EXISTS (SELECT 1 FROM media_assets derivative WHERE derivative.source_media_id = m.id)`
      )
    ];
  };
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

    async registerStagingMany(items, now) {
      if (items.length === 0) return;
      const result = await db
        .prepare(
          `INSERT INTO post_media_cleanup (media_id, object_key, staging, attempts, created_at)
           SELECT json_extract(value, '$.mediaId'), json_extract(value, '$.objectKey'), 1, 0, ?2 FROM json_each(?1) WHERE true
           ON CONFLICT (media_id) DO NOTHING`
        )
        .bind(JSON.stringify(items), now)
        .run();
      if (result.meta.changes !== items.length) throw new Error('Could not claim unique media staging keys');
    },

    async findObjectKeys(mediaIds) {
      if (mediaIds.length === 0) return new Map();
      const { results } = await db
        .prepare(
          `SELECT m.id, m.object_key FROM media_assets m
            WHERE m.id IN (SELECT value FROM json_each(?1)) AND ${isRetainedSql('m.id')}`
        )
        .bind(JSON.stringify(mediaIds))
        .all<{ id: string; object_key: string }>();
      return new Map(results.map((row) => [row.id, row.object_key]));
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
        .prepare('SELECT revision, status FROM posts WHERE id = ?1 AND deleted_at IS NULL')
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

    async listLibrary({ kind, search, usage, after, offset, limit }) {
      const kindClause =
        kind === 'all' ? '' : kind === 'photo' ? "AND m.kind = 'photo'" : "AND m.kind IN ('video', 'animation')";
      const filterBindings: (string | number)[] = [];
      const searchClause =
        search === undefined
          ? ''
          : (() => {
              const escaped = search.replace(/[\\%_]/g, '\\$&');
              filterBindings.push(`${escaped}%`);
              return `AND m.file_name LIKE ?${filterBindings.length} ESCAPE '\\' COLLATE NOCASE`;
            })();
      const usageClause =
        usage === 'used'
          ? 'AND EXISTS (SELECT 1 FROM post_media current_usage WHERE current_usage.media_id = m.id)'
          : usage === 'unused'
            ? 'AND NOT EXISTS (SELECT 1 FROM post_media current_usage WHERE current_usage.media_id = m.id)'
            : '';
      const filters = `WHERE ${isRetainedSql('m.id')} AND m.library_state <> 2 ${kindClause} ${searchClause} ${usageClause}`;
      const bindings: (string | number)[] = [...filterBindings];
      const nextParameter = () => `?${bindings.length + 1}`;
      const cursorClause =
        after === undefined
          ? ''
          : (() => {
              const createdAt = nextParameter();
              bindings.push(after.createdAt);
              const id = nextParameter();
              bindings.push(after.id);
              return `AND (m.created_at < ${createdAt} OR (m.created_at = ${createdAt} AND m.id < ${id}))`;
            })();
      const limitParameter = nextParameter();
      bindings.push(limit + 1);
      const offsetClause =
        offset === undefined
          ? ''
          : (() => {
              const parameter = nextParameter();
              bindings.push(offset);
              return `OFFSET ${parameter}`;
            })();
      const [page, count] = await db.batch([
        db
          .prepare(
            `${libraryItemSelect}
             FROM media_assets m
            ${filters} ${cursorClause}
            ORDER BY m.created_at DESC, m.id DESC LIMIT ${limitParameter} ${offsetClause}`
          )
          .bind(...bindings),
        db.prepare(`SELECT count(*) AS total FROM media_assets m ${filters}`).bind(...filterBindings)
      ]);
      const results = (page?.results ?? []) as MediaRow[];
      const totalCount = ((count?.results ?? []) as Array<{ total: number }>)[0]?.total ?? 0;
      const items = results.map(toLibraryItem);
      return { items, totalCount };
    },

    async findLibraryItem(mediaId) {
      const row = await db
        .prepare(`${libraryItemSelect} FROM media_assets m WHERE m.id = ?1 AND ${isRetainedSql('m.id')}`)
        .bind(mediaId)
        .first<MediaRow>();
      return row === null ? null : toLibraryItem(row);
    },

    async findDerivation(idempotencyKey) {
      return db
        .prepare(
          'SELECT payload_hash AS payloadHash, response_body AS responseBody FROM media_derivations WHERE idempotency_key = ?1'
        )
        .bind(idempotencyKey)
        .first<StoredUpload>();
    },

    async storeDerived(input) {
      const { asset } = input;
      const claimGuard =
        'EXISTS (SELECT 1 FROM media_derivations d WHERE d.idempotency_key = ?1 AND d.media_id = ?4 AND d.payload_hash = ?3)';
      const results = await db.batch([
        db
          .prepare(
            `INSERT INTO media_derivations (idempotency_key, source_media_id, payload_hash, media_id, response_body, created_at)
             SELECT ?1, ?2, ?3, ?4, ?5, ?6
              WHERE EXISTS (SELECT 1 FROM media_assets WHERE id = ?7)
                -- Checked again at commit: a source detached (and queued for cleanup) after the request was
                -- accepted must not become retained through a new derivative, or Cron would delete its object
                -- while the row stays listed as a broken tile.
                AND ${isRetainedSql('?7')}
                AND ${isRetainedSql('?2')}
                AND EXISTS (SELECT 1 FROM post_media_cleanup s WHERE s.media_id = ?4 AND s.staging = 1)
                AND (?8 = 0 OR NOT EXISTS (SELECT 1 FROM media_assets replaced WHERE replaced.id = ?2 AND replaced.library_state = 2))
             ON CONFLICT (idempotency_key) DO NOTHING`
          )
          .bind(
            input.idempotencyKey,
            input.sourceMediaId,
            input.payloadHash,
            asset.id,
            input.responseBody,
            input.now,
            asset.sourceMediaId,
            input.replace === true ? 1 : 0
          ),
        db
          .prepare(
            `INSERT INTO media_assets (id, object_key, sha256, kind, file_name, content_type, size_bytes, width, height, duration_ms, created_at, source_media_id, in_library)
             SELECT ?4, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, 1 WHERE ${claimGuard}`
          )
          .bind(
            input.idempotencyKey,
            input.sourceMediaId,
            input.payloadHash,
            asset.id,
            input.actor,
            asset.objectKey,
            asset.sha256,
            asset.kind,
            asset.fileName,
            asset.contentType,
            asset.sizeBytes,
            asset.width,
            asset.height,
            asset.durationMs,
            asset.createdAt,
            asset.sourceMediaId
          ),
        db
          .prepare(
            `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
             SELECT ?5, 'media.derive', 'media', ?4, ?6, ?7 WHERE ${claimGuard}
               AND EXISTS (SELECT 1 FROM media_assets WHERE id = ?4)`
          )
          .bind(
            input.idempotencyKey,
            input.sourceMediaId,
            input.payloadHash,
            asset.id,
            input.actor,
            input.now,
            JSON.stringify({ sourceMediaId: input.sourceMediaId, mediaId: asset.id })
          ),
        ...(input.replace === true ? replaceStatements(input) : []),
        db
          .prepare(
            'DELETE FROM post_media_cleanup WHERE media_id = ?1 AND staging = 1 AND EXISTS (SELECT 1 FROM media_assets WHERE id = ?1)'
          )
          .bind(asset.id)
      ]);
      return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1 && results.at(-1)?.meta.changes === 1;
    },

    async storeLibraryUpload(input) {
      const { asset } = input;
      const claimGuard =
        'EXISTS (SELECT 1 FROM media_derivations d WHERE d.idempotency_key = ?1 AND d.media_id = ?4 AND d.payload_hash = ?3)';
      const results = await db.batch([
        db
          .prepare(
            `INSERT INTO media_derivations (idempotency_key, source_media_id, payload_hash, media_id, response_body, created_at)
             SELECT ?1, ?4, ?3, ?4, ?5, ?6
              WHERE EXISTS (SELECT 1 FROM post_media_cleanup s WHERE s.media_id = ?4 AND s.staging = 1)
             ON CONFLICT (idempotency_key) DO NOTHING`
          )
          .bind(input.idempotencyKey, '', input.payloadHash, asset.id, input.responseBody, input.now),
        db
          .prepare(
            `INSERT INTO media_assets (id, object_key, sha256, kind, file_name, content_type, size_bytes, width, height, duration_ms, created_at, source_media_id, in_library)
             SELECT ?4, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, NULL, 1 WHERE ${claimGuard}`
          )
          .bind(
            input.idempotencyKey,
            '',
            input.payloadHash,
            asset.id,
            input.actor,
            asset.objectKey,
            asset.sha256,
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
            `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
             SELECT ?5, 'media.upload', 'media', ?4, ?6, ?7 WHERE ${claimGuard}
               AND EXISTS (SELECT 1 FROM media_assets WHERE id = ?4)`
          )
          .bind(
            input.idempotencyKey,
            '',
            input.payloadHash,
            asset.id,
            input.actor,
            input.now,
            JSON.stringify({ mediaId: asset.id })
          ),
        db
          .prepare(
            'DELETE FROM post_media_cleanup WHERE media_id = ?1 AND staging = 1 AND EXISTS (SELECT 1 FROM media_assets WHERE id = ?1)'
          )
          .bind(asset.id)
      ]);
      return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1 && results.at(-1)?.meta.changes === 1;
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

    async attachRetained({ postId, expectedRevision, actor, now, currentIds, mediaIds, copies }) {
      const fullIds = [...currentIds, ...mediaIds];
      const copyIds = new Set(copies.map(({ id }) => id));
      // Only pictures taken as they are must already be retained; a copy is created inside this batch.
      const originalIds = mediaIds.filter((id) => !copyIds.has(id));
      const guard = (
        originalsParam: number,
        expectedCount: number,
        conflicts: { nextRevision?: boolean } = {}
      ) => `EXISTS (SELECT 1 FROM posts p WHERE p.id = ?1 AND p.revision = ?2 AND p.status = 'draft' AND p.deleted_at IS NULL
        AND (SELECT count(*) FROM post_media WHERE post_id = p.id) = ${expectedCount}
        AND ${currentIds.length + mediaIds.length} <= 10
        ${conflicts.nextRevision ? 'AND NOT EXISTS (SELECT 1 FROM post_revisions r WHERE r.post_id = p.id AND r.revision = p.revision + 1)' : ''}
        AND NOT EXISTS (SELECT 1 FROM json_each(?${originalsParam}) requested WHERE NOT EXISTS (
          SELECT 1 FROM media_assets m WHERE m.id = requested.value AND ${isRetainedSql('m.id')})) )`;
      const statements: D1PreparedStatement[] = [];
      if (copies.length > 0) {
        statements.push(
          db
            .prepare(
              `INSERT INTO media_assets (id, object_key, sha256, kind, file_name, content_type, size_bytes, width, height, duration_ms, created_at, in_library, source_media_id)
               SELECT json_extract(c.value, '$.id'), json_extract(c.value, '$.objectKey'), s.sha256, s.kind, s.file_name,
                      s.content_type, s.size_bytes, s.width, s.height, s.duration_ms, ?3, 0,
                      -- A copy of a crop keeps the crop's original, so re-cropping the copy starts from it too.
                      s.source_media_id
                 FROM json_each(?4) c JOIN media_assets s ON s.id = json_extract(c.value, '$.sourceId')
                WHERE ${guard(5, currentIds.length, { nextRevision: true })}
                  AND ${isRetainedSql('s.id')}
                  AND EXISTS (SELECT 1 FROM post_media_cleanup st
                               WHERE st.media_id = json_extract(c.value, '$.id') AND st.staging = 1)`
            )
            .bind(postId, expectedRevision, now, JSON.stringify(copies), JSON.stringify(originalIds))
        );
      }
      for (const [index, mediaId] of mediaIds.entries()) {
        statements.push(
          db
            .prepare(
              `INSERT INTO post_media (post_id, media_id, position)
             SELECT ?1, ?3, ${currentIds.length + index} WHERE ${guard(4, currentIds.length + index, {
               nextRevision: index === 0
             })} AND EXISTS (SELECT 1 FROM media_assets WHERE id = ?3)`
            )
            .bind(postId, expectedRevision, mediaId, JSON.stringify(originalIds))
        );
      }
      statements.push(
        db
          .prepare(
            `INSERT INTO post_revisions (post_id, revision, title, body, entities, status, created_at, media_json)
          SELECT id, revision + 1, title, body, entities, status, ?3, ?4 FROM posts
          WHERE id = ?1 AND ${guard(5, fullIds.length, { nextRevision: true })}`
          )
          .bind(postId, expectedRevision, now, JSON.stringify(fullIds), JSON.stringify(originalIds)),
        db
          .prepare(
            `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
          SELECT ?3, 'post.media.attach_library', 'post', id, ?4, ?5 FROM posts
          WHERE id = ?1 AND ${guard(6, fullIds.length)}`
          )
          .bind(
            postId,
            expectedRevision,
            actor,
            now,
            JSON.stringify({ revision: expectedRevision + 1, mediaIds }),
            JSON.stringify(originalIds)
          ),
        db
          .prepare(
            `UPDATE posts SET revision = revision + 1, updated_at = ?3 WHERE id = ?1 AND revision = ?2 AND status = 'draft' AND deleted_at IS NULL
          AND ${guard(4, fullIds.length)}`
          )
          .bind(postId, expectedRevision, now, JSON.stringify(originalIds)),
        db
          .prepare(
            `DELETE FROM post_media_cleanup WHERE staging = 1
               AND media_id IN (SELECT value FROM json_each(?1)) AND EXISTS (SELECT 1 FROM post_media WHERE post_id = ?2 AND media_id = post_media_cleanup.media_id)`
          )
          .bind(JSON.stringify([...copyIds]), postId)
      );
      const results = await db.batch(statements);
      return results.at(-2)?.meta.changes === 1;
    },

    async attach(input) {
      const { asset } = input;
      const response = JSON.parse(input.responseBody) as { media: PostMediaDto; revision: number };
      const claim = db
        .prepare(
          `INSERT INTO post_media_uploads (post_id, idempotency_key, payload_hash, media_id, response_body, created_at)
           SELECT ?1, ?3, ?4, ?5, ?6, ?7 FROM posts p
            WHERE p.id = ?1 AND p.revision = ?2 AND p.status = 'draft' AND p.deleted_at IS NULL
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
        WHERE p.id = ?1 AND p.revision = ?2 AND p.status = 'draft' AND p.deleted_at IS NULL
          AND pm.media_id = ?5 AND source.kind IN ('photo', 'video') AND pm.position = ?6)`;
      const guards = `${reservation} AND ${current}
        AND EXISTS (SELECT 1 FROM post_media_cleanup staging WHERE staging.media_id = ?7 AND staging.staging = 1)`;
      const response = JSON.parse(input.responseBody) as { media: PostMediaDto; revision: number };
      const statements: D1PreparedStatement[] = [
        db
          .prepare(
            `INSERT INTO media_assets (id, object_key, sha256, kind, file_name, content_type, size_bytes, width, height, duration_ms, created_at, source_media_id)
           SELECT ?7, ?8, ?9, ?17, ?10, ?11, ?12, ?13, ?14, ?18, ?15, ?16 WHERE ${guards}`
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
            asset.sourceMediaId,
            asset.kind,
            asset.durationMs
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
             AND EXISTS (SELECT 1 FROM posts p WHERE p.id = ?1 AND p.revision = ?2 AND p.status = 'draft' AND p.deleted_at IS NULL)
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
            WHERE id = ?1 AND revision = ?2 AND status = 'draft' AND deleted_at IS NULL AND ${reservation}
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
            WHERE id = ?1 AND revision = ?2 AND status = 'draft' AND deleted_at IS NULL AND ${reservation}
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
            WHERE id = ?1 AND revision = ?2 AND status = 'draft' AND deleted_at IS NULL AND ${reservation}
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

    async findReplaceableSource(mediaId) {
      const row = await db
        .prepare(
          `SELECT 1 AS ok FROM media_assets m WHERE m.id = ?1 AND m.library_state <> 2 AND ${isRetainedSql('m.id')}`
        )
        .bind(mediaId)
        .first<{ ok: number }>();
      return row !== null;
    },

    async getUsage(mediaId): Promise<MediaUsageDto | null> {
      // One row per holder, tagged by kind. A publication is classified by its job: pending/retry_wait is
      // scheduled, claimed/unknown is sending (never touched), succeeded is sent history; failed and
      // cancelled ones hold nothing worth listing.
      const snapshot = `FROM publications pu
          JOIN posts p ON p.id = pu.post_id
          JOIN post_revisions r ON r.post_id = pu.post_id AND r.revision = pu.post_revision
          JOIN jobs jb ON jb.publication_id = pu.id AND jb.kind = 'publish'
         WHERE EXISTS (SELECT 1 FROM json_each(r.media_json) j WHERE j.value = ?1)`;
      const holdsByRevision = `EXISTS (SELECT 1 FROM publications pu2
          JOIN jobs jb2 ON jb2.publication_id = pu2.id AND jb2.kind = 'publish'
                        AND jb2.status IN ('pending', 'retry_wait', 'claimed', 'unknown', 'succeeded')
          JOIN post_revisions r2 ON r2.post_id = pu2.post_id AND r2.revision = pu2.post_revision
         WHERE pu2.post_id = p.id AND EXISTS (SELECT 1 FROM json_each(r2.media_json) j2 WHERE j2.value = ?1))`;
      const wouldBeEmpty = `(trim(r.title) = '' AND trim(r.body) = ''
          AND NOT EXISTS (SELECT 1 FROM json_each(r.media_json) k JOIN media_assets a ON a.id = k.value WHERE k.value <> ?1))`;
      const limit = MEDIA_USAGE_LIST_MAX + 1;
      const [lists, facts] = await db.batch([
        db
          .prepare(
            `SELECT * FROM (SELECT 'draft' AS kind, p.id AS post_id, p.title, NULL AS at, NULL AS publication_id, NULL AS state, 0 AS empty
                   FROM posts p
                 WHERE p.status = 'draft' AND EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = p.id AND pm.media_id = ?1)
                 ORDER BY p.updated_at DESC, p.id DESC LIMIT ${limit})
             UNION ALL
             SELECT * FROM (SELECT 'approved' AS kind, p.id AS post_id, p.title, NULL AS at, NULL AS publication_id, NULL AS state, 0 AS empty
                   FROM posts p
                 WHERE p.status = 'approved' AND EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = p.id AND pm.media_id = ?1)
                   AND NOT ${holdsByRevision}
                 ORDER BY p.updated_at DESC, p.id DESC LIMIT ${limit})
             UNION ALL
             SELECT * FROM (SELECT 'scheduled' AS kind, p.id AS post_id, p.title, pu.scheduled_at AS at, pu.id AS publication_id,
                                   NULL AS state, ${wouldBeEmpty} AS empty
                   ${snapshot} AND jb.status IN ('pending', 'retry_wait')
                 ORDER BY pu.scheduled_at, pu.id LIMIT ${limit})
             UNION ALL
             SELECT * FROM (SELECT 'sending' AS kind, p.id AS post_id, p.title, NULL AS at, pu.id AS publication_id,
                                   jb.status AS state, 0 AS empty
                   ${snapshot} AND jb.status IN ('claimed', 'unknown')
                 ORDER BY pu.scheduled_at DESC, pu.id DESC LIMIT ${limit})
             UNION ALL
             SELECT * FROM (SELECT 'sent' AS kind, p.id AS post_id, p.title, max(jb.updated_at) AS at, NULL AS publication_id,
                                   NULL AS state, 0 AS empty
                   ${snapshot} AND jb.status = 'succeeded'
                 GROUP BY pu.post_id
                 ORDER BY at DESC, pu.post_id DESC LIMIT ${limit})`
          )
          .bind(mediaId),
        db
          .prepare(
            `SELECT m.library_state AS state,
                    (SELECT count(*) FROM media_assets d WHERE d.source_media_id = m.id) AS derivatives,
                    (SELECT count(*) FROM post_media pm JOIN posts p ON p.id = pm.post_id
                      WHERE pm.media_id = m.id AND p.status = 'draft') AS drafts,
                    ${isDeletableSql('m.id')} AS deletable
               FROM media_assets m WHERE m.id = ?1 AND ${isRetainedSql('m.id')}`
          )
          .bind(mediaId)
      ]);
      const fact = (
        (facts?.results ?? []) as { state: number; derivatives: number; drafts: number; deletable: number }[]
      )[0];
      if (fact === undefined) return null;
      const rows = (lists?.results ?? []) as {
        kind: 'draft' | 'approved' | 'scheduled' | 'sending' | 'sent';
        post_id: string;
        title: string | null;
        at: number | null;
        publication_id: string | null;
        state: string | null;
        empty: number;
      }[];
      const pick = (kind: string) => rows.filter((row) => row.kind === kind).slice(0, MEDIA_USAGE_LIST_MAX);
      const sending = pick('sending');
      return mediaUsageSchema.parse({
        drafts: pick('draft').map((row) => ({ postId: row.post_id, title: row.title })),
        approved: pick('approved').map((row) => ({ postId: row.post_id, title: row.title })),
        scheduled: pick('scheduled').map((row) => ({
          postId: row.post_id,
          title: row.title,
          publicationId: row.publication_id,
          scheduledAt: new Date(row.at ?? 0).toISOString(),
          wouldBeEmpty: row.empty === 1
        })),
        sending: sending.map((row) => ({
          postId: row.post_id,
          title: row.title,
          publicationId: row.publication_id,
          state: row.state === 'unknown' ? 'unknown' : 'sending'
        })),
        sent: pick('sent').map((row) => ({
          postId: row.post_id,
          title: row.title,
          sentAt: new Date(row.at ?? 0).toISOString()
        })),
        derivatives: fact.derivatives,
        deletable: fact.deletable === 1,
        detachable: sending.length === 0 && fact.derivatives === 0 && fact.drafts <= MEDIA_DETACH_DRAFTS_MAX
      });
    },

    async findObjectKey(mediaId) {
      const row = await db
        .prepare(`SELECT m.object_key FROM media_assets m WHERE m.id = ?1 AND ${isRetainedSql('m.id')}`)
        .bind(mediaId)
        .first<{ object_key: string }>();
      return row?.object_key ?? null;
    },

    async deleteUnusedAssets({ mediaIds, actor, now, detach }) {
      const ids = JSON.stringify(mediaIds);
      // One round trip for the whole selection. Every decision reads the state before the first write
      // (cleanup rows and the audit trail are written ahead of the deletes), and D1 runs a batch as one
      // transaction, so an attach racing with it either lands first (the asset is then blocked) or finds
      // the asset gone. The cleanup row is written in the same transaction as the delete, so the object
      // is never orphaned without a durable record, even if the Worker dies before the R2 call.
      const inSelection = 'SELECT value FROM json_each(?1)';
      const free = `${selectionBlockedCte(detach)} `;
      const unblocked = `SELECT m.id FROM media_assets m WHERE m.id IN (${inSelection}) AND m.id NOT IN (SELECT id FROM blocked)`;
      const holders = `p.status = 'draft' AND EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = p.id AND pm.media_id IN (${unblocked}))`;
      // A draft that is detached from gets the same revision bump as an edit. The set of touched drafts is
      // the one with a revision row ahead of its own revision, which only the first statement creates.
      const aheadOfRevision = `p.status = 'draft' AND EXISTS (SELECT 1 FROM post_revisions rv WHERE rv.post_id = p.id AND rv.revision = p.revision + 1)`;
      const detachStatements: D1PreparedStatement[] =
        detach !== undefined
          ? [
              db
                .prepare(
                  `${free}INSERT INTO post_revisions (post_id, revision, title, body, entities, status, created_at, media_json)
                 SELECT p.id, p.revision + 1, p.title, p.body, p.entities, p.status, ?2, '[]' FROM posts p WHERE ${holders}`
                )
                .bind(ids, now),
              db
                .prepare(
                  `${free}INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
                 SELECT ?3, 'post.media.change', 'post', p.id, ?2,
                        json_object('revision', p.revision + 1, 'detachedMediaIds',
                          (SELECT json_group_array(pm.media_id) FROM post_media pm
                            WHERE pm.post_id = p.id AND pm.media_id IN (${unblocked})))
                   FROM posts p WHERE ${holders}`
                )
                .bind(ids, now, actor),
              db
                .prepare(
                  `${free}DELETE FROM post_media WHERE media_id IN (${unblocked})
                    AND post_id IN (SELECT id FROM posts WHERE status = 'draft')`
                )
                .bind(ids),
              db.prepare(
                `UPDATE post_media SET position = r.rn
                   FROM (SELECT post_id, media_id, row_number() OVER (PARTITION BY post_id ORDER BY position, media_id) - 1 AS rn
                           FROM post_media
                          WHERE post_id IN (SELECT p.id FROM posts p WHERE ${aheadOfRevision})) r
                  WHERE post_media.post_id = r.post_id AND post_media.media_id = r.media_id AND post_media.position <> r.rn`
              ),
              db
                .prepare(`UPDATE posts AS p SET revision = revision + 1, updated_at = ?1 WHERE ${aheadOfRevision}`)
                .bind(now)
            ]
          : [];
      // detach 'all'. Sent posts keep their snapshot untouched (history; a reader skips a missing asset), so
      // a scheduled publication needs no rewrite either: it simply stops finding the file. What it must not
      // do is go out with nothing at all, so a publication left with no title, no body and no remaining media
      // is cancelled. The three statements below run in this order: the audit row and the publication change
      // select by the job still being pending/retry_wait, the job update closes it last. Claimed and unknown
      // jobs never reach them: those files are blocked in `free`.
      const emptied = `SELECT pu.id FROM publications pu
          JOIN jobs jb ON jb.publication_id = pu.id AND jb.kind = 'publish' AND jb.status IN ('pending', 'retry_wait')
          JOIN post_revisions r ON r.post_id = pu.post_id AND r.revision = pu.post_revision
         WHERE trim(r.title) = '' AND trim(r.body) = ''
           AND EXISTS (SELECT 1 FROM json_each(r.media_json) j WHERE j.value IN (${unblocked}))
           AND NOT EXISTS (SELECT 1 FROM json_each(r.media_json) k JOIN media_assets a ON a.id = k.value
                            WHERE k.value NOT IN (${unblocked}))`;
      const detachEverywhere: D1PreparedStatement[] = [
        db
          .prepare(
            `${free}INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
             SELECT ?3, 'publication.cancel', 'publication', pu.id, ?2,
                    json_object('revision', pu.revision + 1, 'reason', '${MEDIA_DELETED_CANCEL_CODE}')
               FROM publications pu WHERE pu.id IN (${emptied})`
          )
          .bind(ids, now, actor),
        db
          .prepare(
            `${free}UPDATE publications SET last_error_code = '${MEDIA_DELETED_CANCEL_CODE}', revision = revision + 1, updated_at = ?2
              WHERE id IN (${emptied})`
          )
          .bind(ids, now),
        db
          .prepare(
            `${free}UPDATE jobs SET status = 'cancelled', lease_until = NULL, updated_at = ?2
              WHERE kind = 'publish' AND status IN ('pending', 'retry_wait') AND publication_id IN (${emptied})`
          )
          .bind(ids, now),
        // Approved and sent posts hold the file by a plain attachment row too; drafts were handled above.
        db.prepare(`${free}DELETE FROM post_media WHERE media_id IN (${unblocked})`).bind(ids)
      ];
      const results = await db.batch([
        db.prepare(`SELECT id FROM media_assets WHERE id IN (${inSelection})`).bind(ids),
        ...detachStatements,
        ...(detach === 'all' ? detachEverywhere : []),
        db
          .prepare(
            `${free}INSERT OR IGNORE INTO post_media_cleanup (media_id, object_key, attempts, created_at)
             SELECT m.id, m.object_key, 0, ?2 FROM media_assets m
              WHERE m.id IN (${inSelection}) AND m.id NOT IN (SELECT id FROM blocked)`
          )
          .bind(ids, now),
        db
          .prepare(
            `${free}INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
             SELECT ?3, 'media.delete', 'media', m.id, ?2, NULL FROM media_assets m
              WHERE m.id IN (${inSelection}) AND m.id NOT IN (SELECT id FROM blocked)`
          )
          .bind(ids, now, actor),
        db
          .prepare(
            `${free}DELETE FROM post_media_crops
              WHERE media_id IN (${inSelection}) AND media_id NOT IN (SELECT id FROM blocked)`
          )
          .bind(ids),
        db
          .prepare(
            `${free}DELETE FROM post_media_uploads
              WHERE media_id IN (${inSelection}) AND media_id NOT IN (SELECT id FROM blocked)`
          )
          .bind(ids),
        db
          .prepare(
            `${free}DELETE FROM media_derivations
              WHERE media_id IN (${inSelection}) AND media_id NOT IN (SELECT id FROM blocked)`
          )
          .bind(ids),
        db
          .prepare(
            `${free}DELETE FROM media_assets
              WHERE id IN (${inSelection}) AND id NOT IN (SELECT id FROM blocked)`
          )
          .bind(ids),
        db.prepare(`SELECT id FROM media_assets WHERE id IN (${inSelection})`).bind(ids),
        db
          .prepare(
            `SELECT media_id AS mediaId, object_key AS objectKey FROM post_media_cleanup
              WHERE staging = 0 AND media_id IN (${inSelection})`
          )
          .bind(ids)
      ]);
      const before = new Set(((results[0]?.results ?? []) as { id: string }[]).map(({ id }) => id));
      const after = new Set(((results.at(-2)?.results ?? []) as { id: string }[]).map(({ id }) => id));
      const keys = new Map(
        ((results.at(-1)?.results ?? []) as { mediaId: string; objectKey: string }[]).map((row) => [
          row.mediaId,
          row.objectKey
        ])
      );
      const deleted: { mediaId: string; objectKey: string }[] = [];
      const inUse: string[] = [];
      const notFound: string[] = [];
      for (const mediaId of mediaIds) {
        const objectKey = keys.get(mediaId);
        if (!before.has(mediaId)) notFound.push(mediaId);
        else if (after.has(mediaId) || objectKey === undefined) inUse.push(mediaId);
        else deleted.push({ mediaId, objectKey });
      }
      return { deleted, inUse, notFound };
    },

    async finishDeletedAssets(mediaIds) {
      if (mediaIds.length === 0) return;
      await db
        .prepare('DELETE FROM post_media_cleanup WHERE staging = 0 AND media_id IN (SELECT value FROM json_each(?1))')
        .bind(JSON.stringify(mediaIds))
        .run();
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
        // A deleted asset can stay named by old revision snapshots; with no row left it holds nothing.
        .prepare(`SELECT (EXISTS (SELECT 1 FROM media_assets WHERE id = ?1) AND ${isRetainedSql('?1')}) AS referenced`)
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
              AND NOT ${revisionHoldSql('?1')}`
          )
          .bind(mediaId),
        db
          .prepare(
            `DELETE FROM post_media_crops WHERE media_id = ?1
              AND NOT EXISTS (SELECT 1 FROM post_media WHERE media_id = ?1)
              AND NOT ${revisionHoldSql('?1')}`
          )
          .bind(mediaId),
        db
          .prepare(
            `DELETE FROM media_assets WHERE id = ?1 AND in_library = 0
              AND NOT EXISTS (SELECT 1 FROM post_media WHERE media_id = ?1)
              AND NOT ${revisionHoldSql('?1')}
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
