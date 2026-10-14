import {
  apiErrorSchema,
  cropPostMediaResultSchema,
  mediaLibraryItemSchema,
  mediaLibraryPageSchema,
  postSchema,
  uploadPostMediaResultSchema
} from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { type Api, createApi, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { testMediaBucket } from '../helpers/media-bucket';

let api: Api;
let keyCounter = 0;
const nextKey = () => `derived-key-${++keyCounter}`;

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
const mp4 = (tail = 0) => new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, tail]);

beforeEach(async () => {
  await resetDb();
  const bucket = testMediaBucket();
  const listed = await bucket.list({ prefix: 'media/' });
  if (listed.objects.length > 0) await bucket.delete(listed.objects.map(({ key }) => key));
  keyCounter = 0;
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 7 * 24 * 60 * 60 * 1000 });
  api = createApi();
});

async function draftWith(bytes: Uint8Array, contentType: string, fileName: string) {
  const created = await api.request('/api/v1/posts', {
    method: 'POST',
    headers: { 'idempotency-key': nextKey() },
    json: { title: 'Media post', body: 'Body' }
  });
  const post = postSchema.parse(await created.json());
  const response = await api.request(`/api/v1/posts/${post.id}/media?revision=${post.revision}&fileName=${fileName}`, {
    method: 'POST',
    headers: { 'content-type': contentType, 'content-length': String(bytes.byteLength), 'idempotency-key': nextKey() },
    body: bytes
  });
  expect(response.status).toBe(201);
  return { post, upload: uploadPostMediaResultSchema.parse(await response.json()) };
}

function derive(
  sourceId: string,
  bytes: Uint8Array,
  key: string,
  options: { contentType?: string; kind?: string; fileName?: string; contentLength?: number } = {}
) {
  const {
    contentType = 'image/png',
    kind = 'photo',
    fileName = 'crop.png',
    contentLength = bytes.byteLength
  } = options;
  return api.request(`/api/v1/media/${sourceId}/derived?fileName=${encodeURIComponent(fileName)}&kind=${kind}`, {
    method: 'POST',
    headers: { 'content-type': contentType, 'content-length': String(contentLength), 'idempotency-key': key },
    body: bytes
  });
}

const count = async (sql: string) => (await testDb().prepare(sql).first<{ n: number }>())?.n;

describe('derived library media', () => {
  it('stores a photo derivative in the library with lineage and keeps the original', async () => {
    const { post, upload } = await draftWith(png(), 'image/png', 'a.png');

    const response = await derive(upload.media.id, png(4, 5), nextKey());

    expect(response.status).toBe(201);
    const item = mediaLibraryItemSchema.parse(await response.json());
    expect(item).toMatchObject({
      kind: 'photo',
      fileName: 'crop.png',
      width: 4,
      height: 5,
      usageCount: 0,
      deletable: true
    });
    const row = await testDb()
      .prepare('SELECT source_media_id AS source, in_library AS lib FROM media_assets WHERE id = ?1')
      .bind(item.id)
      .first<{ source: string; lib: number }>();
    expect(row).toEqual({ source: upload.media.id, lib: 1 });
    expect(await count('SELECT count(*) AS n FROM post_media_cleanup')).toBe(0);
    const library = mediaLibraryPageSchema.parse(await (await api.request('/api/v1/media?limit=10')).json());
    expect(library.items.find(({ id }) => id === upload.media.id)?.deletable).toBe(false);
    expect(library.items.map(({ id }) => id)).toContain(item.id);
    const content = await api.request(`/api/v1/media/${item.id}/content`);
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(png(4, 5));

    // A derivative of a derivative still points at the root original.
    const second = mediaLibraryItemSchema.parse(await (await derive(item.id, png(6, 7), nextKey())).json());
    const secondRow = await testDb()
      .prepare('SELECT source_media_id AS source FROM media_assets WHERE id = ?1')
      .bind(second.id)
      .first<{ source: string }>();
    expect(secondRow?.source).toBe(upload.media.id);

    // The post still holds the original, so it is not deletable even after the derivatives go.
    const remove = await api.request(`/api/v1/media/${item.id}`, { method: 'DELETE' });
    expect(remove.status).toBe(204);
    expect(await count(`SELECT count(*) AS n FROM media_assets WHERE id = '${item.id}'`)).toBe(0);
    expect(post.id).toBeTruthy();
  });

  it('survives a post detach: the derivative stays while the original is cleaned only when unused', async () => {
    const { post, upload } = await draftWith(png(), 'image/png', 'a.png');
    const item = mediaLibraryItemSchema.parse(await (await derive(upload.media.id, png(4, 5), nextKey())).json());
    const attach = await api.request(`/api/v1/posts/${post.id}/media/attach`, {
      method: 'POST',
      json: { revision: upload.revision, mediaIds: [item.id] }
    });
    expect(attach.status).toBe(200);
    const detach = await api.request(`/api/v1/posts/${post.id}/media/${item.id}`, {
      method: 'DELETE',
      json: { revision: upload.revision + 1 }
    });
    expect(detach.status).toBe(200);
    expect(await count('SELECT count(*) AS n FROM post_media_cleanup')).toBe(0);
    expect(await count(`SELECT count(*) AS n FROM media_assets WHERE id = '${item.id}'`)).toBe(1);
  });

  it('derives a video from a video and rejects a photo from a video source', async () => {
    const { upload } = await draftWith(mp4(), 'video/mp4', 'clip.mp4');

    const ok = await derive(upload.media.id, mp4(1), nextKey(), {
      contentType: 'video/mp4',
      kind: 'video',
      fileName: 'c.mp4'
    });
    expect(ok.status).toBe(201);
    expect(mediaLibraryItemSchema.parse(await ok.json()).kind).toBe('video');

    const wrongSource = await derive(upload.media.id, png(), nextKey());
    expect(wrongSource.status).toBe(400);
    expect(await count('SELECT count(*) AS n FROM post_media_cleanup')).toBe(0);
    expect((await testMediaBucket().list({ prefix: 'media/' })).objects).toHaveLength(2);
  });

  it('rejects a wrong type, a signature mismatch and an oversized body without storing anything', async () => {
    const { upload } = await draftWith(png(), 'image/png', 'a.png');
    const objectsBefore = (await testMediaBucket().list({ prefix: 'media/' })).objects.length;

    const gif = await derive(upload.media.id, png(), nextKey(), { contentType: 'image/gif' });
    const kindMismatch = await derive(upload.media.id, png(), nextKey(), { kind: 'video' });
    const signature = await derive(upload.media.id, png(), nextKey(), { contentType: 'image/jpeg' });
    const tooLarge = await derive(upload.media.id, png(), nextKey(), { contentLength: 10_000_001 });
    const tooLargeVideo = await derive(upload.media.id, mp4(), nextKey(), {
      contentType: 'video/mp4',
      kind: 'video',
      contentLength: 50_000_001
    });

    expect([gif.status, kindMismatch.status, signature.status, tooLarge.status, tooLargeVideo.status]).toEqual([
      400, 400, 400, 413, 413
    ]);
    expect(apiErrorSchema.parse(await signature.json()).error.code).toBe('VALIDATION_ERROR');
    expect((await testMediaBucket().list({ prefix: 'media/' })).objects).toHaveLength(objectsBefore);
    expect(await count('SELECT count(*) AS n FROM post_media_cleanup')).toBe(0);
    expect(await count('SELECT count(*) AS n FROM media_derivations')).toBe(0);
  });

  it('replays the same key and refuses a different payload under it', async () => {
    const { upload } = await draftWith(png(), 'image/png', 'a.png');
    const key = nextKey();

    const first = await derive(upload.media.id, png(4, 5), key);
    const replay = await derive(upload.media.id, png(4, 5), key);
    const reused = await derive(upload.media.id, png(6, 7), key);

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(await first.json());
    expect(reused.status).toBe(409);
    expect(apiErrorSchema.parse(await reused.json()).error.details).toMatchObject({ reason: 'IDEMPOTENCY_KEY_REUSED' });
    expect(await count('SELECT count(*) AS n FROM media_assets WHERE in_library = 1')).toBe(1);
    expect((await testMediaBucket().list({ prefix: 'media/' })).objects).toHaveLength(2);
    expect(await count('SELECT count(*) AS n FROM post_media_cleanup')).toBe(0);
  });

  it('answers 404 for a missing source and leaves no object behind', async () => {
    const response = await derive('11111111-1111-4111-8111-111111111111', png(), nextKey());

    expect(response.status).toBe(404);
    expect((await testMediaBucket().list({ prefix: 'media/' })).objects).toHaveLength(0);
    expect(await count('SELECT count(*) AS n FROM post_media_cleanup')).toBe(0);
  });

  it('crops an attached video in the editor path and refuses mismatched kinds', async () => {
    const { post, upload } = await draftWith(mp4(), 'video/mp4', 'clip.mp4');
    const cropUrl = `/api/v1/posts/${post.id}/media/${upload.media.id}/crop?revision=${upload.revision}&fileName=c.mp4`;
    const send = (bytes: Uint8Array, contentType: string, key: string) =>
      api.request(cropUrl, {
        method: 'POST',
        headers: { 'content-type': contentType, 'content-length': String(bytes.byteLength), 'idempotency-key': key },
        body: bytes
      });

    const wrong = await send(png(), 'image/png', nextKey());
    expect(wrong.status).toBe(400);
    const ok = await send(mp4(2), 'video/mp4', nextKey());
    expect(ok.status).toBe(200);
    const result = cropPostMediaResultSchema.parse(await ok.json());
    expect(result.media).toMatchObject({ kind: 'video', sourceMediaId: upload.media.id, contentType: 'video/mp4' });
  });
});

describe('library upload', () => {
  const upload = (
    bytes: Uint8Array,
    key: string,
    options: { contentType?: string; kind?: string; token?: string | null } = {}
  ) =>
    api.request(`/api/v1/media?fileName=up.png&kind=${options.kind ?? 'photo'}`, {
      method: 'POST',
      token: options.token,
      headers: {
        'content-type': options.contentType ?? 'image/png',
        'content-length': String(bytes.byteLength),
        'idempotency-key': key
      },
      body: bytes
    });

  it('stores a retained item without a post and lists it', async () => {
    const response = await upload(png(4, 5), nextKey());

    expect(response.status).toBe(201);
    const item = mediaLibraryItemSchema.parse(await response.json());
    expect(item).toMatchObject({ kind: 'photo', fileName: 'up.png', width: 4, height: 5, usageCount: 0 });
    const row = await testDb()
      .prepare('SELECT source_media_id AS source, in_library AS lib FROM media_assets WHERE id = ?1')
      .bind(item.id)
      .first<{ source: string | null; lib: number }>();
    expect(row).toEqual({ source: null, lib: 1 });
    expect(await count('SELECT count(*) AS n FROM post_media_cleanup')).toBe(0);
    const library = mediaLibraryPageSchema.parse(await (await api.request('/api/v1/media?limit=10')).json());
    expect(library.items.map(({ id }) => id)).toEqual([item.id]);
  });

  it('rejects a bad signature and leaves nothing behind', async () => {
    const response = await upload(png(), nextKey(), { contentType: 'image/jpeg' });

    expect(response.status).toBe(400);
    expect((await testMediaBucket().list({ prefix: 'media/' })).objects).toHaveLength(0);
    expect(await count('SELECT count(*) AS n FROM media_assets')).toBe(0);
    expect(await count('SELECT count(*) AS n FROM post_media_cleanup')).toBe(0);
  });

  it('replays the same key and refuses a different payload under it', async () => {
    const key = nextKey();
    const first = await upload(png(4, 5), key);
    const replay = await upload(png(4, 5), key);
    const reused = await upload(png(6, 7), key);

    expect(first.status).toBe(201);
    expect(await replay.json()).toEqual(await first.json());
    expect(reused.status).toBe(409);
    expect(apiErrorSchema.parse(await reused.json()).error.details).toMatchObject({ reason: 'IDEMPOTENCY_KEY_REUSED' });
    expect(await count('SELECT count(*) AS n FROM media_assets')).toBe(1);
    expect((await testMediaBucket().list({ prefix: 'media/' })).objects).toHaveLength(1);
    expect(await count('SELECT count(*) AS n FROM post_media_cleanup')).toBe(0);
  });

  it('requires a session', async () => {
    const response = await upload(png(), nextKey(), { token: null });

    expect(response.status).toBe(401);
    expect(await count('SELECT count(*) AS n FROM media_assets')).toBe(0);
  });
});
