import {
  apiErrorSchema,
  attachPostMediaResultSchema,
  cropPostMediaResultSchema,
  mediaLibraryPageSchema,
  postSchema,
  uploadPostMediaResultSchema
} from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { type Api, createApi, OWNER_ID, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { testMediaBucket } from '../helpers/media-bucket';
import { createR2MediaStorage } from '../../src/app/r2-media-storage';
import {
  createD1PostMediaRepository,
  createD1PostRepository,
  processPostMediaCleanup,
  cropPostMedia,
  removePostMedia,
  uploadPostMedia
} from '../../src/modules/content';

let api: Api;
let keyCounter = 0;

const png = (width = 2, height = 3): Uint8Array =>
  new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0,
    0,
    0,
    13,
    0x49,
    0x48,
    0x44,
    0x52,
    (width >>> 24) & 0xff,
    (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    (height >>> 24) & 0xff,
    (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,
    height & 0xff,
    8,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    0
  ]);

beforeEach(async () => {
  await resetDb();
  const bucket = testMediaBucket();
  const listed = await bucket.list({ prefix: 'media/' });
  if (listed.objects.length > 0) await bucket.delete(listed.objects.map(({ key }) => key));
  keyCounter = 0;
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 7 * 24 * 60 * 60 * 1000 });
  api = createApi();
});

const nextKey = () => `media-key-${++keyCounter}`;

async function createDraft(): Promise<{ id: string; revision: number }> {
  const response = await api.request('/api/v1/posts', {
    method: 'POST',
    headers: { 'idempotency-key': nextKey() },
    json: { title: 'Media post', body: 'Body' }
  });
  expect(response.status).toBe(201);
  const post = postSchema.parse(await response.json());
  return { id: post.id, revision: post.revision };
}

async function upload(
  postId: string,
  revision: number,
  bytes: Uint8Array,
  idempotencyKey: string,
  contentType = 'image/png',
  fileName = 'image.png',
  contentLength: number | undefined = bytes.byteLength
) {
  const headers = new Headers({ 'content-type': contentType, 'idempotency-key': idempotencyKey });
  if (contentLength !== undefined) headers.set('content-length', String(contentLength));
  return api.request(`/api/v1/posts/${postId}/media?revision=${revision}&fileName=${encodeURIComponent(fileName)}`, {
    method: 'POST',
    headers,
    body: bytes
  });
}

async function crop(
  postId: string,
  mediaId: string,
  revision: number,
  bytes: Uint8Array,
  idempotencyKey: string,
  contentType = 'image/png',
  fileName = 'cropped.png',
  contentLength = bytes.byteLength
) {
  return api.request(
    `/api/v1/posts/${postId}/media/${mediaId}/crop?revision=${revision}&fileName=${encodeURIComponent(fileName)}`,
    {
      method: 'POST',
      headers: {
        'content-type': contentType,
        'content-length': String(contentLength),
        'idempotency-key': idempotencyKey
      },
      body: bytes
    }
  );
}

describe('post media upload', () => {
  it('atomically replaces a photo with its derivative at the same position and retains the ultimate source', async () => {
    const post = await createDraft();
    const original = uploadPostMediaResultSchema.parse(await (await upload(post.id, 0, png(), nextKey())).json());
    const second = uploadPostMediaResultSchema.parse(await (await upload(post.id, 1, png(4, 5), nextKey())).json());

    const response = await crop(post.id, original.media.id, second.revision, png(7, 8), nextKey());

    expect(response.status).toBe(200);
    const result = cropPostMediaResultSchema.parse(await response.json());
    expect(result.revision).toBe(second.revision + 1);
    expect(result.media.id).not.toBe(original.media.id);
    expect(result.media).toMatchObject({
      sourceMediaId: original.media.id,
      kind: 'photo',
      position: original.media.position,
      width: 7,
      height: 8
    });
    const state = await createD1PostMediaRepository(testDb()).findPostState(post.id);
    expect(state?.media.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: result.media.id, position: 0 },
      { id: second.media.id, position: 1 }
    ]);
    const originalContent = await api.request(`/api/v1/media/${original.media.id}/content`);
    expect(originalContent.status).toBe(200);
    expect(new Uint8Array(await originalContent.arrayBuffer())).toEqual(png());
    const library = mediaLibraryPageSchema.parse(await (await api.request('/api/v1/media?kind=photo&limit=10')).json());
    expect(library.items.map(({ id }) => id)).toContain(original.media.id);

    const recroppedResponse = await crop(post.id, result.media.id, result.revision, png(9, 10), nextKey());
    expect(recroppedResponse.status).toBe(200);
    const recropped = cropPostMediaResultSchema.parse(await recroppedResponse.json());
    expect(recropped.media.sourceMediaId).toBe(original.media.id);
    expect(recropped.media.sourceMediaId).not.toBe(result.media.id);
  });

  it('replaces a photo at the ten-item limit without consuming another slot', async () => {
    const post = await createDraft();
    const uploads = [];
    let revision = post.revision;
    for (let index = 0; index < 10; index += 1) {
      const uploaded = uploadPostMediaResultSchema.parse(
        await (await upload(post.id, revision, png(index + 2, index + 3), nextKey())).json()
      );
      uploads.push(uploaded.media);
      revision = uploaded.revision;
    }

    const replaced = await crop(post.id, uploads[4]!.id, revision, png(12, 13), nextKey());

    expect(replaced.status).toBe(200);
    const result = cropPostMediaResultSchema.parse(await replaced.json());
    expect(result.revision).toBe(revision + 1);
    const state = await createD1PostMediaRepository(testDb()).findPostState(post.id);
    expect(state?.media).toHaveLength(10);
    expect(state?.media[4]).toMatchObject({ id: result.media.id, position: 4 });
  });

  it('rejects stale revisions and non-photo targets without changing the attachment', async () => {
    const post = await createDraft();
    const photo = uploadPostMediaResultSchema.parse(await (await upload(post.id, 0, png(), nextKey())).json());
    const animationBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 2, 0, 3, 0]);
    const animation = uploadPostMediaResultSchema.parse(
      await (await upload(post.id, photo.revision, animationBytes, nextKey(), 'image/gif', 'motion.gif')).json()
    );

    const stale = await crop(post.id, photo.media.id, photo.revision, png(5, 6), nextKey());
    const nonPhoto = await crop(post.id, animation.media.id, animation.revision, png(5, 6), nextKey());

    expect(stale.status).toBe(409);
    expect(apiErrorSchema.parse(await stale.json()).error.details?.reason).toBe('STALE_REVISION');
    expect(nonPhoto.status).toBe(400);
    expect(apiErrorSchema.parse(await nonPhoto.json()).error.code).toBe('VALIDATION_ERROR');
    expect((await createD1PostMediaRepository(testDb()).findPostState(post.id))?.media.map(({ id }) => id)).toEqual([
      photo.media.id,
      animation.media.id
    ]);
  });

  it('rejects a bad crop signature and keeps the original attachment and object', async () => {
    const post = await createDraft();
    const original = uploadPostMediaResultSchema.parse(await (await upload(post.id, 0, png(), nextKey())).json());

    const response = await crop(post.id, original.media.id, original.revision, png(), nextKey(), 'image/jpeg');

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('VALIDATION_ERROR');
    const tooLarge = await crop(
      post.id,
      original.media.id,
      original.revision,
      png(),
      nextKey(),
      'image/png',
      'large.png',
      10_000_001
    );
    expect(tooLarge.status).toBe(413);
    expect((await createD1PostMediaRepository(testDb()).findPostState(post.id))?.media.map(({ id }) => id)).toEqual([
      original.media.id
    ]);
    expect((await testMediaBucket().list({ prefix: 'media/' })).objects).toHaveLength(1);
    expect((await testDb().prepare('SELECT count(*) AS n FROM post_media_crops').first<{ n: number }>())?.n).toBe(0);
  });

  it('cleans the staged derivative when the replacement transaction fails before commit', async () => {
    const post = await createDraft();
    const original = uploadPostMediaResultSchema.parse(await (await upload(post.id, 0, png(), nextKey())).json());
    const baseRepo = createD1PostMediaRepository(testDb());
    const failingRepo = new Proxy(baseRepo, {
      get(target, property, receiver) {
        if (property === 'replaceWithCrop')
          return async () => {
            throw new Error('simulated D1 failure');
          };
        return Reflect.get(target, property, receiver) as unknown;
      }
    });
    const bytes = png(5, 6);

    await expect(
      cropPostMedia(
        {
          repo: failingRepo,
          storage: createR2MediaStorage(testMediaBucket()),
          now: START,
          newId: () => crypto.randomUUID()
        },
        {
          postId: post.id,
          mediaId: original.media.id,
          revision: original.revision,
          fileName: 'cropped.png',
          contentType: 'image/png',
          contentLength: bytes.byteLength,
          body: new Response(bytes).body as ReadableStream<Uint8Array>,
          actor: OWNER_ID,
          idempotencyKey: nextKey()
        }
      )
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect((await baseRepo.findPostState(post.id))?.media.map(({ id }) => id)).toEqual([original.media.id]);
    expect((await testMediaBucket().list({ prefix: 'media/' })).objects).toHaveLength(1);
    expect((await testDb().prepare('SELECT count(*) AS n FROM post_media_crops').first<{ n: number }>())?.n).toBe(0);
    expect((await testDb().prepare('SELECT count(*) AS n FROM post_media_cleanup').first<{ n: number }>())?.n).toBe(0);
  });

  it('replays the same crop key and rejects a different payload or an in-flight claim', async () => {
    const post = await createDraft();
    const original = uploadPostMediaResultSchema.parse(await (await upload(post.id, 0, png(), nextKey())).json());
    const idempotencyKey = nextKey();
    const first = await crop(post.id, original.media.id, original.revision, png(5, 6), idempotencyKey);
    const firstBody = cropPostMediaResultSchema.parse(await first.json());
    const replay = await crop(post.id, original.media.id, original.revision, png(5, 6), idempotencyKey);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(firstBody);

    const reused = await crop(post.id, original.media.id, original.revision, png(6, 7), idempotencyKey);
    expect(reused.status).toBe(409);
    expect(apiErrorSchema.parse(await reused.json()).error.details?.reason).toBe('IDEMPOTENCY_KEY_REUSED');

    const activeKey = nextKey();
    const claim = await createD1PostMediaRepository(testDb()).claimCrop(post.id, activeKey, crypto.randomUUID(), START);
    expect(claim).toBe('claimed');
    const inFlight = await crop(post.id, firstBody.media.id, firstBody.revision, png(8, 9), activeKey);
    expect(inFlight.status).toBe(409);
    expect(apiErrorSchema.parse(await inFlight.json()).error.details?.reason).toBe('IN_FLIGHT');
  });

  it('keeps the original through detach and queues it after the final derivative cleanup', async () => {
    const post = await createDraft();
    const original = uploadPostMediaResultSchema.parse(await (await upload(post.id, 0, png(), nextKey())).json());
    const cropBytes = png(5, 6);
    const cropKey = nextKey();
    const cropResponse = await crop(post.id, original.media.id, original.revision, cropBytes, cropKey);
    const cropped = cropPostMediaResultSchema.parse(await cropResponse.json());
    const replayBeforeDetach = await crop(post.id, original.media.id, original.revision, cropBytes, cropKey);
    expect(replayBeforeDetach.status).toBe(200);
    expect(await replayBeforeDetach.json()).toEqual(cropped);
    const detached = await api.request(`/api/v1/posts/${post.id}/media/${cropped.media.id}`, {
      method: 'DELETE',
      json: { revision: cropped.revision }
    });
    expect(detached.status).toBe(200);
    expect((await api.request(`/api/v1/media/${original.media.id}/content`)).status).toBe(200);
    const replayAfterDetach = await crop(post.id, original.media.id, original.revision, cropBytes, cropKey);
    expect(replayAfterDetach.status).toBe(200);
    expect(await replayAfterDetach.json()).toEqual(cropped);
    expect(
      (
        await testDb()
          .prepare('SELECT count(*) AS n FROM post_media_cleanup WHERE media_id = ?1')
          .bind(original.media.id)
          .first<{ n: number }>()
      )?.n
    ).toBe(0);

    const repo = createD1PostMediaRepository(testDb());
    const storage = createR2MediaStorage(testMediaBucket());
    expect((await api.request(`/api/v1/media/${original.media.id}/content`)).status).toBe(200);
    expect(await processPostMediaCleanup({ repo, storage }, 5, START)).toEqual({ cleaned: 1, failed: 0 });
    expect((await api.request(`/api/v1/media/${original.media.id}/content`)).status).toBe(404);
    expect((await crop(post.id, original.media.id, original.revision, cropBytes, cropKey)).status).toBe(409);
    expect(
      (
        await testDb()
          .prepare('SELECT count(*) AS n FROM post_media_crops WHERE media_id = ?1')
          .bind(cropped.media.id)
          .first<{ n: number }>()
      )?.n
    ).toBe(0);
    expect(await processPostMediaCleanup({ repo, storage }, 5, START)).toEqual({ cleaned: 1, failed: 0 });
    expect((await api.request(`/api/v1/media/${original.media.id}/content`)).status).toBe(404);
    expect(
      (
        await testDb()
          .prepare('SELECT count(*) AS n FROM media_assets WHERE id = ?1')
          .bind(original.media.id)
          .first<{ n: number }>()
      )?.n
    ).toBe(0);
  });

  it('streams a validated image into private R2 and attaches it with a guarded revision bump', async () => {
    const post = await createDraft();
    const response = await upload(post.id, post.revision, png(), nextKey());

    expect(response.status).toBe(201);
    const result = uploadPostMediaResultSchema.parse(await response.json());
    expect(result).toMatchObject({
      revision: 1,
      media: { kind: 'photo', contentType: 'image/png', sizeBytes: 33, width: 2, height: 3, position: 0 }
    });
    const row = await testDb()
      .prepare('SELECT post_id, revision, media_json FROM post_revisions WHERE post_id = ?1 AND revision = 1')
      .bind(post.id)
      .first<{ post_id: string; revision: number; media_json: string }>();
    expect(JSON.parse(row?.media_json ?? 'null')).toEqual([]);
    expect(row?.post_id).toBe(post.id);
    const mediaId = result.media.id as string;
    const content = await api.request(`/api/v1/media/${mediaId}/content`);
    expect(content.status).toBe(200);
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(png());
    expect(content.headers.get('cache-control')).toBe('no-store');
  });

  it('lists only retained assets and attaches selected library media atomically without copying it', async () => {
    const source = await createDraft();
    const uploaded = uploadPostMediaResultSchema.parse(
      await (await upload(source.id, source.revision, png(), nextKey())).json()
    );
    const listingResponse = await api.request('/api/v1/media?kind=all&limit=10');
    expect(listingResponse.status).toBe(200);
    const listing = mediaLibraryPageSchema.parse(await listingResponse.json());
    expect(listing.items.map(({ id }) => id)).toContain(uploaded.media.id);

    const target = await createDraft();
    const attachedResponse = await api.request(`/api/v1/posts/${target.id}/media/attach`, {
      method: 'POST',
      json: { revision: target.revision, mediaIds: [uploaded.media.id] }
    });
    expect(attachedResponse.status).toBe(200);
    const attached = attachPostMediaResultSchema.parse(await attachedResponse.json());
    expect(attached.revision).toBe(1);
    expect(attached.media.map(({ id }) => id)).toEqual([uploaded.media.id]);
    const snapshot = await testDb()
      .prepare('SELECT media_json FROM post_revisions WHERE post_id = ?1 AND revision = 1')
      .bind(target.id)
      .first<{ media_json: string }>();
    expect(JSON.parse(snapshot?.media_json ?? 'null')).toEqual([uploaded.media.id]);

    const duplicate = await api.request(`/api/v1/posts/${target.id}/media/attach`, {
      method: 'POST',
      json: { revision: attached.revision, mediaIds: [uploaded.media.id] }
    });
    expect(duplicate.status).toBe(400);
    expect(apiErrorSchema.parse(await duplicate.json()).error.details?.reason).toBe('DUPLICATE_MEDIA_IDS');
  });

  it('allows only one concurrent media-library attach at the same draft revision', async () => {
    const source = await createDraft();
    const first = uploadPostMediaResultSchema.parse(await (await upload(source.id, 0, png(), nextKey())).json());
    const second = uploadPostMediaResultSchema.parse(await (await upload(source.id, 1, png(4, 5), nextKey())).json());
    const firstPage = mediaLibraryPageSchema.parse(
      await (await api.request('/api/v1/media?kind=photo&limit=1')).json()
    );
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = mediaLibraryPageSchema.parse(
      await (await api.request(`/api/v1/media?kind=photo&limit=1&cursor=${firstPage.nextCursor}`)).json()
    );
    expect(firstPage.items[0]?.id).not.toBe(secondPage.items[0]?.id);
    const target = await createDraft();
    const results = await Promise.all(
      [first.media.id, second.media.id].map((mediaId) =>
        api.request(`/api/v1/posts/${target.id}/media/attach`, {
          method: 'POST',
          json: { revision: target.revision, mediaIds: [mediaId] }
        })
      )
    );
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    const row = await testDb()
      .prepare('SELECT revision FROM posts WHERE id = ?1')
      .bind(target.id)
      .first<{ revision: number }>();
    const count = await testDb()
      .prepare('SELECT count(*) AS n FROM post_media WHERE post_id = ?1')
      .bind(target.id)
      .first<{ n: number }>();
    expect(row?.revision).toBe(1);
    expect(count?.n).toBe(1);
  });

  it('uses the cleanup queue ordering index for bounded retry batches', async () => {
    const plan = await testDb()
      .prepare(
        'EXPLAIN QUERY PLAN SELECT media_id, object_key FROM post_media_cleanup WHERE staging = 0 OR (staging = 1 AND created_at <= ?2 - 900000) OR (staging = 2 AND claim_until <= ?2) ORDER BY created_at, media_id LIMIT ?1'
      )
      .bind(5, START)
      .all<{ detail: string }>();

    expect(plan.results.map(({ detail }) => detail).join(' ')).toContain('post_media_cleanup_order_idx');
  });

  it('uses the keyset index for library pages with and without a kind filter', async () => {
    const all = await testDb()
      .prepare(
        `EXPLAIN QUERY PLAN SELECT m.id FROM media_assets m
        WHERE (EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = m.id)
          OR EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = m.id))
        ORDER BY m.created_at DESC, m.id DESC LIMIT ?1`
      )
      .bind(21)
      .all<{ detail: string }>();
    const photos = await testDb()
      .prepare(
        `EXPLAIN QUERY PLAN SELECT m.id FROM media_assets m
        WHERE (EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = m.id)
          OR EXISTS (SELECT 1 FROM post_revisions r, json_each(r.media_json) j WHERE j.value = m.id))
          AND m.kind = 'photo'
        ORDER BY m.created_at DESC, m.id DESC LIMIT ?1`
      )
      .bind(21)
      .all<{ detail: string }>();
    expect(all.results.map(({ detail }) => detail).join(' ')).toContain('media_assets_created_idx');
    expect(photos.results.map(({ detail }) => detail).join(' ')).toContain('media_assets_kind_created_idx');
  });

  it('uses the source index when checking whether a derivative retains its original', async () => {
    const plan = await testDb()
      .prepare(
        'EXPLAIN QUERY PLAN SELECT EXISTS (SELECT 1 FROM media_assets derivative WHERE derivative.source_media_id = ?1)'
      )
      .bind(crypto.randomUUID())
      .all<{ detail: string }>();

    expect(plan.results.map(({ detail }) => detail).join(' ')).toContain('media_assets_source_idx');
  });

  it('hydrates media for the maximum 100-post page without exceeding D1 bind limits', async () => {
    const ids = Array.from({ length: 100 }, () => crypto.randomUUID());
    await testDb().batch(
      ids.map((id, index) =>
        testDb()
          .prepare(
            "INSERT INTO posts (id, title, body, entities, status, revision, created_at, updated_at) VALUES (?1, ?2, ?, '[]', 'draft', 0, ?3, ?3)"
          )
          .bind(id, `Post ${index}`, START + index)
      )
    );
    const mediaId = crypto.randomUUID();
    await testDb()
      .prepare(
        `INSERT INTO media_assets (id, object_key, sha256, kind, file_name, content_type, size_bytes, width, height, duration_ms, created_at)
       VALUES (?1, ?2, ?3, 'photo', 'page.png', 'image/png', 33, 2, 3, NULL, ?4)`
      )
      .bind(mediaId, `media/${mediaId}`, 'a'.repeat(64), START)
      .run();
    await testDb()
      .prepare('INSERT INTO post_media (post_id, media_id, position) VALUES (?1, ?2, 0)')
      .bind(ids[0], mediaId)
      .run();

    const page = await createD1PostRepository(testDb()).list({ view: 'live', limit: 100 });

    expect(page).toHaveLength(100);
    expect(page.flatMap((post) => post.media ?? []).map(({ id }) => id)).toEqual([mediaId]);
  });

  it('returns the first result for the same key and bytes without a second attachment', async () => {
    const post = await createDraft();
    const idempotencyKey = nextKey();
    const first = await upload(post.id, post.revision, png(), idempotencyKey);
    const firstBody = uploadPostMediaResultSchema.parse(await first.json());
    const retry = await upload(post.id, post.revision, png(), idempotencyKey);

    expect(retry.status).toBe(201);
    expect(await retry.json()).toEqual(firstBody);
    const count = await testDb()
      .prepare('SELECT count(*) AS n FROM post_media WHERE post_id = ?1')
      .bind(post.id)
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it('rejects a reused key with different bytes and does not retain the staged object', async () => {
    const post = await createDraft();
    const idempotencyKey = nextKey();
    expect((await upload(post.id, post.revision, png(), idempotencyKey)).status).toBe(201);
    const conflict = await upload(post.id, 1, png(7, 8), idempotencyKey);

    expect(conflict.status).toBe(409);
    expect(apiErrorSchema.parse(await conflict.json()).error.details?.reason).toBe('IDEMPOTENCY_KEY_REUSED');
    const listed = await testMediaBucket().list({ prefix: 'media/' });
    expect(listed.objects).toHaveLength(1);
  });

  it('rejects a reused key when bytes match but canonical metadata differs', async () => {
    const post = await createDraft();
    const idempotencyKey = nextKey();
    expect((await upload(post.id, post.revision, png(), idempotencyKey)).status).toBe(201);
    const conflict = await upload(post.id, 1, png(), idempotencyKey, 'image/png', 'renamed.png');

    expect(conflict.status).toBe(409);
    expect(apiErrorSchema.parse(await conflict.json()).error.details?.reason).toBe('IDEMPOTENCY_KEY_REUSED');
    expect((await testMediaBucket().list({ prefix: 'media/' })).objects).toHaveLength(1);
  });

  it('rejects spoofed content type/signature before creating a D1 attachment', async () => {
    const post = await createDraft();
    const response = await upload(post.id, post.revision, png(), nextKey(), 'image/jpeg');

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('VALIDATION_ERROR');
    const count = await testDb()
      .prepare('SELECT count(*) AS n FROM post_media WHERE post_id = ?1')
      .bind(post.id)
      .first<{ n: number }>();
    expect(count?.n).toBe(0);
    expect((await testMediaBucket().list({ prefix: 'media/' })).objects).toHaveLength(0);
  });

  it('accepts GIF animation and MP4 video signatures with distinct media kinds', async () => {
    const post = await createDraft();
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 2, 0, 3, 0]);
    const mp4 = new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
    const animation = uploadPostMediaResultSchema.parse(
      await (await upload(post.id, 0, gif, nextKey(), 'image/gif', 'animation.gif')).json()
    );
    const video = uploadPostMediaResultSchema.parse(
      await (await upload(post.id, 1, mp4, nextKey(), 'video/mp4', 'clip.mp4')).json()
    );

    expect(animation.media.kind).toBe('animation');
    expect(video.media.kind).toBe('video');
  });

  it('rejects excessive dimensions and declared sizes without retaining staged objects', async () => {
    const post = await createDraft();
    const dimensions = await upload(post.id, post.revision, png(10_001, 1), nextKey());
    const tooLarge = await upload(post.id, post.revision, png(), nextKey(), 'image/png', 'image.png', 10_000_001);

    expect(dimensions.status).toBe(400);
    expect(tooLarge.status).toBe(413);
    expect((await testMediaBucket().list({ prefix: 'media/' })).objects).toHaveLength(0);
    const staging = await testDb()
      .prepare('SELECT media_id, object_key FROM post_media_cleanup')
      .all<{ media_id: string; object_key: string }>();
    expect(staging.results, JSON.stringify(staging.results)).toHaveLength(0);
  });

  it('requires Content-Length and clears its staging marker when the header is missing', async () => {
    const post = await createDraft();
    const response = await api.request(`/api/v1/posts/${post.id}/media?revision=${post.revision}&fileName=image.png`, {
      method: 'POST',
      headers: { 'content-type': 'image/png', 'idempotency-key': nextKey() },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(png());
          controller.close();
        }
      })
    });

    expect(response.status).toBe(400);
    expect((await testMediaBucket().list({ prefix: 'media/' })).objects).toHaveLength(0);
    expect((await testDb().prepare('SELECT count(*) AS n FROM post_media_cleanup').first<{ n: number }>())?.n).toBe(0);
  });

  it('rejects stale revisions and protects private content from unauthenticated reads', async () => {
    const post = await createDraft();
    const attached = await upload(post.id, post.revision, png(), nextKey());
    const mediaId = uploadPostMediaResultSchema.parse(await attached.json()).media.id;
    const stale = await upload(post.id, post.revision, png(), nextKey());
    const privateRead = await api.request(`/api/v1/media/${mediaId}/content`, { token: null });

    expect(stale.status).toBe(409);
    expect(apiErrorSchema.parse(await stale.json()).error.details?.reason).toBe('STALE_REVISION');
    expect(privateRead.status).toBe(401);
  });

  it('stores ordered identity in the approval snapshot and rejects later mutations', async () => {
    const post = await createDraft();
    const attached = await upload(post.id, post.revision, png(), nextKey());
    const result = uploadPostMediaResultSchema.parse(await attached.json());
    const approved = await api.request(`/api/v1/posts/${post.id}/approve`, {
      method: 'POST',
      json: { revision: result.revision }
    });

    expect(approved.status).toBe(200);
    const approvalDto = postSchema.parse(await approved.json());
    expect(approvalDto.media.map(({ id }) => id)).toEqual([result.media.id]);
    const revision = await testDb()
      .prepare('SELECT media_json FROM post_revisions WHERE post_id = ?1 AND revision = ?2')
      .bind(post.id, result.revision + 1)
      .first<{ media_json: string }>();
    expect(JSON.parse(revision?.media_json ?? 'null')).toEqual([result.media.id]);
    const mutation = await upload(post.id, result.revision + 1, png(), nextKey());
    expect(mutation.status).toBe(409);
  });

  it('reorders attachments and deletes an attachment with revision guards', async () => {
    const post = await createDraft();
    const first = uploadPostMediaResultSchema.parse(await (await upload(post.id, 0, png(), nextKey())).json());
    const second = uploadPostMediaResultSchema.parse(await (await upload(post.id, 1, png(4, 5), nextKey())).json());
    const reordered = await api.request(`/api/v1/posts/${post.id}/media/order`, {
      method: 'PATCH',
      json: { revision: 2, mediaIds: [second.media.id, first.media.id] }
    });

    expect(reordered.status).toBe(200);
    expect(await reordered.json()).toEqual({ revision: 3 });
    const read = postSchema.parse(await (await api.request(`/api/v1/posts/${post.id}`)).json());
    expect(read.media.map(({ id }) => id)).toEqual([second.media.id, first.media.id]);
    const removed = await api.request(`/api/v1/posts/${post.id}/media/${first.media.id}`, {
      method: 'DELETE',
      json: { revision: 3 }
    });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ revision: 4 });
    const replayRows = await testDb()
      .prepare('SELECT count(*) AS n FROM post_media_uploads WHERE media_id = ?1')
      .bind(first.media.id)
      .first<{ n: number }>();
    expect(replayRows?.n).toBe(0);
    expect((await api.request(`/api/v1/media/${first.media.id}/content`)).status).toBe(404);
    expect(
      (
        await testDb()
          .prepare('SELECT count(*) AS n FROM post_media_cleanup WHERE media_id = ?1')
          .bind(first.media.id)
          .first<{ n: number }>()
      )?.n
    ).toBe(1);
    expect((await testMediaBucket().list({ prefix: 'media/' })).objects).toHaveLength(2);
  });

  it('returns success after detach commits even when cleanup queue reads fail', async () => {
    const post = await createDraft();
    const attached = uploadPostMediaResultSchema.parse(await (await upload(post.id, 0, png(), nextKey())).json());
    const baseRepo = createD1PostMediaRepository(testDb());
    const failingRepo = new Proxy(baseRepo, {
      get(target, property, receiver) {
        if (property === 'claimCleanup')
          return async () => {
            throw new Error('simulated cleanup queue read failure');
          };
        return Reflect.get(target, property, receiver) as unknown;
      }
    });

    await expect(
      removePostMedia(
        { repo: failingRepo, now: START },
        { postId: post.id, mediaId: attached.media.id, revision: attached.revision, actor: OWNER_ID }
      )
    ).resolves.toEqual({ revision: attached.revision + 1 });
    expect(
      (
        await testDb()
          .prepare('SELECT count(*) AS n FROM post_media WHERE post_id = ?1')
          .bind(post.id)
          .first<{ n: number }>()
      )?.n
    ).toBe(0);
    expect(
      (await testDb().prepare('SELECT revision FROM posts WHERE id = ?1').bind(post.id).first<{ revision: number }>())
        ?.revision
    ).toBe(attached.revision + 1);
  });

  it('does not report an upload as attached if cleanup claims its stale staging row after R2 put', async () => {
    const post = await createDraft();
    const repo = createD1PostMediaRepository(testDb());
    const bucket = testMediaBucket();
    const baseStorage = createR2MediaStorage(bucket);
    const storage = {
      ...baseStorage,
      async put(objectKey: string, body: ReadableStream<Uint8Array>, contentType: string) {
        await baseStorage.put(objectKey, body, contentType);
        await processPostMediaCleanup({ repo, storage: baseStorage }, 5, START + 900_001);
      }
    };
    const bytes = png();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      }
    });

    await expect(
      uploadPostMedia(
        { repo, storage, now: START, newId: () => crypto.randomUUID() },
        {
          postId: post.id,
          revision: 0,
          fileName: 'race.png',
          contentType: 'image/png',
          contentLength: bytes.byteLength,
          body,
          actor: OWNER_ID,
          idempotencyKey: nextKey()
        }
      )
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(
      (
        await testDb()
          .prepare('SELECT count(*) AS n FROM post_media WHERE post_id = ?1')
          .bind(post.id)
          .first<{ n: number }>()
      )?.n
    ).toBe(0);
    expect((await testDb().prepare('SELECT count(*) AS n FROM media_assets').first<{ n: number }>())?.n).toBe(0);
    expect((await bucket.list({ prefix: 'media/' })).objects).toHaveLength(0);
  });

  it('allows only one concurrent different upload at the same post revision', async () => {
    const post = await createDraft();
    const outcomes = await Promise.all([
      upload(post.id, 0, png(), nextKey()),
      upload(post.id, 0, png(4, 5), nextKey())
    ]);

    expect(outcomes.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(
      (
        await testDb()
          .prepare('SELECT count(*) AS n FROM post_media WHERE post_id = ?1')
          .bind(post.id)
          .first<{ n: number }>()
      )?.n
    ).toBe(1);
    expect((await testMediaBucket().list({ prefix: 'media/' })).objects).toHaveLength(1);
  });

  it('queues and removes private objects when lifecycle deletes a post', async () => {
    const post = await createDraft();
    const uploaded = uploadPostMediaResultSchema.parse(await (await upload(post.id, 0, png(), nextKey())).json());
    const staging = await testDb()
      .prepare('SELECT media_id, object_key FROM post_media_cleanup')
      .all<{ media_id: string; object_key: string }>();
    expect(staging.results, JSON.stringify(staging.results)).toHaveLength(0);
    const removed = await api.request(`/api/v1/posts/${post.id}/delete`, {
      method: 'POST',
      json: { revision: uploaded.revision }
    });
    expect(removed.status).toBe(200);
    expect((await testDb().prepare('SELECT count(*) AS n FROM post_media_cleanup').first<{ n: number }>())?.n).toBe(1);

    const cleanup = await processPostMediaCleanup(
      { repo: createD1PostMediaRepository(testDb()), storage: createR2MediaStorage(testMediaBucket()) },
      5,
      START
    );
    expect(cleanup).toEqual({ cleaned: 1, failed: 0 });
    expect((await testDb().prepare('SELECT count(*) AS n FROM media_assets').first<{ n: number }>())?.n).toBe(0);
    expect((await testMediaBucket().list({ prefix: 'media/' })).objects).toHaveLength(0);
  });

  it('retains a cleanup marker after R2 failure and retries it on a later pass', async () => {
    const bucket = testMediaBucket();
    const repo = createD1PostMediaRepository(testDb());
    const mediaId = crypto.randomUUID();
    const objectKey = `media/${mediaId}`;
    await repo.registerStaging(mediaId, objectKey, START);
    await bucket.put(objectKey, png(), { httpMetadata: { contentType: 'image/png' } });
    const storage = createR2MediaStorage(bucket);
    const failingStorage = {
      ...storage,
      delete: async () => {
        throw new Error('simulated R2 failure');
      }
    };

    expect(await processPostMediaCleanup({ repo, storage: failingStorage }, 5, START + 900_001)).toEqual({
      cleaned: 0,
      failed: 1
    });
    expect(
      (
        await testDb()
          .prepare('SELECT attempts FROM post_media_cleanup WHERE media_id = ?1')
          .bind(mediaId)
          .first<{ attempts: number }>()
      )?.attempts
    ).toBe(1);
    expect(await processPostMediaCleanup({ repo, storage }, 5, START + 900_001)).toEqual({ cleaned: 1, failed: 0 });
    expect(await bucket.get(objectKey)).toBeNull();
    expect(
      (
        await testDb()
          .prepare('SELECT count(*) AS n FROM post_media_cleanup WHERE media_id = ?1')
          .bind(mediaId)
          .first<{ n: number }>()
      )?.n
    ).toBe(0);
  });

  it('does not collect a fresh in-flight staging object before its grace period', async () => {
    const bucket = testMediaBucket();
    const storage = createR2MediaStorage(bucket);
    const repo = createD1PostMediaRepository(testDb());
    const mediaId = crypto.randomUUID();
    const objectKey = `media/${mediaId}`;
    await repo.registerStaging(mediaId, objectKey, START);
    await bucket.put(objectKey, png(), { httpMetadata: { contentType: 'image/png' } });

    expect(await processPostMediaCleanup({ repo, storage }, 5, START + 899_999)).toEqual({ cleaned: 0, failed: 0 });
    expect(await bucket.get(objectKey)).not.toBeNull();
    expect(await processPostMediaCleanup({ repo, storage }, 5, START + 900_000)).toEqual({ cleaned: 1, failed: 0 });
    expect(await bucket.get(objectKey)).toBeNull();
  });
});
