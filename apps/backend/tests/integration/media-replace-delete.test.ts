import {
  apiErrorSchema,
  attachPostMediaResultSchema,
  cropPostMediaResultSchema,
  mediaLibraryItemSchema,
  mediaLibraryPageSchema,
  mediaUsageSchema,
  postSchema,
  uploadPostMediaResultSchema,
  bulkDeleteMediaResultSchema
} from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { type Api, createApi, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { meteredDb } from '../helpers/metered-db';
import { testMediaBucket } from '../helpers/media-bucket';
import { createR2MediaStorage } from '../../src/app/r2-media-storage';
import {
  createD1PostMediaRepository,
  createD1PostRepository,
  processPostMediaCleanup
} from '../../src/modules/content';

let api: Api;
let keyCounter = 0;
const nextKey = () => `replace-key-${++keyCounter}`;

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

const count = async (sql: string) => (await testDb().prepare(sql).first<{ n: number }>())?.n;
const objects = async () => (await testMediaBucket().list({ prefix: 'media/' })).objects.length;

async function createDraft() {
  const created = await api.request('/api/v1/posts', {
    method: 'POST',
    headers: { 'idempotency-key': nextKey() },
    json: { title: 'Media post', body: 'Body' }
  });
  return postSchema.parse(await created.json());
}

async function uploadTo(postId: string, revision: number, bytes: Uint8Array, name = 'a.png') {
  const response = await api.request(`/api/v1/posts/${postId}/media?revision=${revision}&fileName=${name}`, {
    method: 'POST',
    headers: { 'content-type': 'image/png', 'content-length': String(bytes.byteLength), 'idempotency-key': nextKey() },
    body: bytes
  });
  expect(response.status).toBe(201);
  return uploadPostMediaResultSchema.parse(await response.json());
}

async function attachTo(postId: string, revision: number, mediaIds: string[]) {
  const response = await api.request(`/api/v1/posts/${postId}/media/attach`, {
    method: 'POST',
    json: { revision, mediaIds }
  });
  expect(response.status).toBe(200);
  return attachPostMediaResultSchema.parse(await response.json());
}

async function approve(postId: string, revision: number) {
  const response = await api.request(`/api/v1/posts/${postId}/approve`, { method: 'POST', json: { revision } });
  expect(response.status).toBe(200);
  return postSchema.parse(await response.json());
}

function derive(sourceId: string, bytes: Uint8Array, key: string, mode: 'new' | 'replace' = 'replace') {
  return api.request(`/api/v1/media/${sourceId}/derived?fileName=crop.png&kind=photo&mode=${mode}`, {
    method: 'POST',
    headers: { 'content-type': 'image/png', 'content-length': String(bytes.byteLength), 'idempotency-key': key },
    body: bytes
  });
}

const holders = async (mediaId: string) =>
  (
    await testDb()
      .prepare(`SELECT post_id AS postId, position FROM post_media WHERE media_id = ?1 ORDER BY post_id`)
      .bind(mediaId)
      .all<{ postId: string; position: number }>()
  ).results;
const postRow = (postId: string) =>
  testDb()
    .prepare('SELECT revision, status FROM posts WHERE id = ?1')
    .bind(postId)
    .first<{ revision: number; status: string }>();
const mediaOrder = async (postId: string) =>
  (
    await testDb()
      .prepare('SELECT media_id AS id, position FROM post_media WHERE post_id = ?1 ORDER BY position, media_id')
      .bind(postId)
      .all<{ id: string; position: number }>()
  ).results;
const dangling = () =>
  count(`SELECT count(*) AS n FROM post_media pm LEFT JOIN media_assets m ON m.id = pm.media_id WHERE m.id IS NULL`);
const library = async (query = '') =>
  mediaLibraryPageSchema.parse(await (await api.request(`/api/v1/media?limit=50${query}`)).json()).items;

async function seedPublication(postId: string, revision: number, jobStatus: string, n = 1, scheduledAt = 5) {
  const publicationId = `e0000000-0000-4000-8000-00000000000${n}`;
  await testDb()
    .prepare(
      `INSERT OR IGNORE INTO destinations (id, title, chat_id, kind, created_at, updated_at)
       VALUES ('d0000000-0000-4000-8000-000000000001', 'c', '-100', 'channel', 1, 1)`
    )
    .run();
  await testDb()
    .prepare(
      `INSERT INTO publications (id, post_id, post_revision, destination_id, scheduled_at, timezone, revision, created_at, updated_at)
       VALUES (?3, ?1, ?2, 'd0000000-0000-4000-8000-000000000001', ?4, 'UTC', 0, 5, 5)`
    )
    .bind(postId, revision, publicationId, scheduledAt)
    .run();
  await testDb()
    .prepare(
      `INSERT INTO jobs (id, kind, publication_id, status, run_at, attempts, dedupe_key, publication_scheduled_at, created_at, updated_at)
       VALUES (?2, 'publish', ?3, ?1, ?4, 1, 'publish:' || ?3, ?4, 5, 7000)`
    )
    .bind(jobStatus, `f0000000-0000-4000-8000-00000000000${n}`, publicationId, scheduledAt)
    .run();
  return publicationId;
}

describe('derived mode=replace', () => {
  it('swaps the source in drafts only, bumps their revision, and leaves approved posts and snapshots alone', async () => {
    const a = await createDraft();
    const first = await uploadTo(a.id, a.revision, png(1, 1), 'first.png');
    const source = await uploadTo(a.id, first.revision, png(2, 2), 'source.png');
    const b = await createDraft();
    const bAttached = await attachTo(b.id, b.revision, [source.media.id]);
    const c = await createDraft();
    const cAttached = await attachTo(c.id, c.revision, [source.media.id]);
    const cApproved = await approve(c.id, cAttached.revision);
    const snapshotBefore = await testDb()
      .prepare('SELECT media_json AS json FROM post_revisions WHERE post_id = ?1 AND revision = ?2')
      .bind(c.id, cApproved.revision)
      .first<{ json: string }>();
    await seedPublication(c.id, cApproved.revision, 'pending');

    const response = await derive(source.media.id, png(5, 5), nextKey());

    expect(response.status).toBe(201);
    const item = mediaLibraryItemSchema.parse(await response.json());
    expect(await mediaOrder(a.id)).toEqual([
      { id: first.media.id, position: 0 },
      { id: item.id, position: 1 }
    ]);
    expect(await mediaOrder(b.id)).toEqual([{ id: item.id, position: 0 }]);
    expect(await mediaOrder(c.id)).toEqual([{ id: source.media.id, position: 0 }]);
    expect((await postRow(a.id))?.revision).toBe(source.revision + 1);
    expect((await postRow(b.id))?.revision).toBe(bAttached.revision + 1);
    expect(await postRow(c.id)).toEqual({ revision: cApproved.revision, status: 'approved' });
    const snapshotAfter = await testDb()
      .prepare('SELECT media_json AS json FROM post_revisions WHERE post_id = ?1 AND revision = ?2')
      .bind(c.id, cApproved.revision)
      .first<{ json: string }>();
    expect(snapshotAfter).toEqual(snapshotBefore);
    expect(JSON.parse(snapshotAfter?.json ?? '[]')).toEqual([source.media.id]);
    expect(
      await count(
        `SELECT count(*) AS n FROM post_revisions WHERE post_id = '${a.id}' AND revision = ${source.revision + 1}`
      )
    ).toBe(1);
    expect(await count("SELECT count(*) AS n FROM audit_log WHERE action = 'post.media.replace'")).toBe(2);

    // Only the new file is listed; the original stays readable for the approved post and its publication.
    const ids = (await library()).map(({ id }) => id);
    expect(ids).toContain(item.id);
    expect(ids).not.toContain(source.media.id);
    expect((await api.request(`/api/v1/media/${source.media.id}/content`)).status).toBe(200);
    expect(
      await processPostMediaCleanup(
        { repo: createD1PostMediaRepository(testDb()), storage: createR2MediaStorage(testMediaBucket()) },
        10,
        START + 10 * 60_000
      )
    ).toEqual({ cleaned: 0, failed: 0 });
    expect(await dangling()).toBe(0);
    expect(await objects()).toBe(3);
  });

  it('cleans a replaced source only once nothing references it', async () => {
    const a = await createDraft();
    const original = await uploadTo(a.id, a.revision, png(2, 2), 'o.png');
    // An editor crop: a derivative of the original that only this draft holds.
    const cropResponse = await api.request(
      `/api/v1/posts/${a.id}/media/${original.media.id}/crop?revision=${original.revision}&fileName=c.png`,
      {
        method: 'POST',
        headers: {
          'content-type': 'image/png',
          'content-length': String(png(3, 3).byteLength),
          'idempotency-key': nextKey()
        },
        body: png(3, 3)
      }
    );
    const cropped = cropPostMediaResultSchema.parse(await cropResponse.json());

    const replaced = mediaLibraryItemSchema.parse(await (await derive(cropped.media.id, png(4, 4), nextKey())).json());

    expect(await holders(cropped.media.id)).toEqual([]);
    expect(await holders(replaced.id)).toHaveLength(1);
    expect(await count(`SELECT count(*) AS n FROM post_media_cleanup WHERE media_id = '${cropped.media.id}'`)).toBe(1);
    const cleaned = await processPostMediaCleanup(
      { repo: createD1PostMediaRepository(testDb()), storage: createR2MediaStorage(testMediaBucket()) },
      10,
      START + 10 * 60_000
    );
    expect(cleaned).toEqual({ cleaned: 1, failed: 0 });
    expect(await count(`SELECT count(*) AS n FROM media_assets WHERE id = '${cropped.media.id}'`)).toBe(0);
    // The root original stays while the new crop points at it; the new file is readable.
    expect(await count(`SELECT count(*) AS n FROM media_assets WHERE id = '${original.media.id}'`)).toBe(1);
    expect((await api.request(`/api/v1/media/${replaced.id}/content`)).status).toBe(200);
    expect(await objects()).toBe(2);
    expect(await dangling()).toBe(0);
  });

  it('replays the same key without a second swap and refuses a different mode under it', async () => {
    const a = await createDraft();
    const source = await uploadTo(a.id, a.revision, png(2, 2));
    const key = nextKey();

    const first = await derive(source.media.id, png(5, 5), key);
    const replay = await derive(source.media.id, png(5, 5), key);
    const otherMode = await derive(source.media.id, png(5, 5), key, 'new');

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(await first.json());
    expect(otherMode.status).toBe(409);
    expect((await postRow(a.id))?.revision).toBe(source.revision + 1);
    expect(await count('SELECT count(*) AS n FROM media_assets WHERE in_library = 1')).toBe(1);
    expect(await objects()).toBe(2);
    // The source is gone from the listing, so replacing it again with a new key is refused.
    const again = await derive(source.media.id, png(6, 6), nextKey());
    expect(again.status).toBe(404);
    expect(await objects()).toBe(2);
  });

  it('works for a source no draft holds and for mode=new it keeps the source listed', async () => {
    const a = await createDraft();
    const source = await uploadTo(a.id, a.revision, png(2, 2));
    const asNew = mediaLibraryItemSchema.parse(
      await (await derive(source.media.id, png(3, 3), nextKey(), 'new')).json()
    );
    expect((await library()).map(({ id }) => id)).toEqual(expect.arrayContaining([source.media.id, asNew.id]));
    expect((await postRow(a.id))?.revision).toBe(source.revision);

    const replaced = mediaLibraryItemSchema.parse(await (await derive(asNew.id, png(4, 4), nextKey())).json());

    expect((await library()).map(({ id }) => id).sort()).toEqual([replaced.id, source.media.id].sort());
    expect(await count(`SELECT count(*) AS n FROM post_media_cleanup WHERE media_id = '${asNew.id}'`)).toBe(1);
  });

  it('never leaves a draft pointing at a missing file when replace races attach or approve', async () => {
    for (let round = 0; round < 4; round += 1) {
      const a = await createDraft();
      const source = await uploadTo(a.id, a.revision, png(2 + round, 2));
      const b = await createDraft();
      const asNew = mediaLibraryItemSchema.parse(
        await (await derive(source.media.id, png(9, 9 + round), nextKey(), 'new')).json()
      );
      const cropBytes = png(5 + round, 5);
      const [replace, attach, approveResult] = await Promise.all([
        derive(asNew.id, cropBytes, nextKey()),
        api.request(`/api/v1/posts/${b.id}/media/attach`, {
          method: 'POST',
          json: { revision: b.revision, mediaIds: [asNew.id] }
        }),
        api.request(`/api/v1/posts/${a.id}/approve`, { method: 'POST', json: { revision: source.revision } })
      ]);
      expect([201, 404, 503]).toContain(replace.status);
      expect([200, 404, 409]).toContain(attach.status);
      expect([200, 409]).toContain(approveResult.status);
      await processPostMediaCleanup(
        { repo: createD1PostMediaRepository(testDb()), storage: createR2MediaStorage(testMediaBucket()) },
        50,
        START + 10 * 60_000
      );
      expect(await dangling()).toBe(0);
      const live = (
        await testDb()
          .prepare('SELECT DISTINCT m.object_key AS k FROM post_media pm JOIN media_assets m ON m.id = pm.media_id')
          .all<{ k: string }>()
      ).results;
      for (const { k } of live) expect(await testMediaBucket().head(k)).not.toBeNull();
      const snapshots = (
        await testDb()
          .prepare("SELECT media_json AS j FROM post_revisions WHERE status = 'approved'")
          .all<{ j: string }>()
      ).results;
      for (const { j } of snapshots)
        for (const id of JSON.parse(j) as string[])
          expect(await count(`SELECT count(*) AS n FROM media_assets WHERE id = '${id}'`)).toBe(1);
    }
  });

  it('stays inside the 50 statements of one invocation with many drafts', async () => {
    const owner = await createDraft();
    const source = await uploadTo(owner.id, owner.revision, png(2, 2));
    for (let index = 0; index < 20; index += 1) {
      const draft = await createDraft();
      await attachTo(draft.id, draft.revision, [source.media.id]);
    }
    const { db, meter } = meteredDb(testDb());
    api = createApi({ db });

    const response = await derive(source.media.id, png(5, 5), nextKey());

    expect(response.status).toBe(201);
    expect(meter.statements).toBeLessThanOrEqual(30);
    expect(await holders(source.media.id)).toEqual([]);
    expect(await count("SELECT count(*) AS n FROM audit_log WHERE action = 'post.media.replace'")).toBe(21);
  });
});

describe('media usage', () => {
  it('lists drafts, approved and sent posts, derivatives and the flags', async () => {
    const a = await createDraft();
    const source = await uploadTo(a.id, a.revision, png(2, 2));
    const c = await createDraft();
    const cApproved = await approve(c.id, (await attachTo(c.id, c.revision, [source.media.id])).revision);
    const d = await createDraft();
    const dApproved = await approve(d.id, (await attachTo(d.id, d.revision, [source.media.id])).revision);
    await derive(source.media.id, png(3, 3), nextKey(), 'new');
    await seedPublication(d.id, dApproved.revision, 'succeeded');

    const response = await api.request(`/api/v1/media/${source.media.id}/usage`);

    expect(response.status).toBe(200);
    const usage = mediaUsageSchema.parse(await response.json());
    expect(usage.drafts).toEqual([{ postId: a.id, title: 'Media post' }]);
    expect(usage.approved).toEqual([{ postId: c.id, title: 'Media post' }]);
    expect(usage.sent).toEqual([{ postId: d.id, title: 'Media post', sentAt: new Date(7000).toISOString() }]);
    expect(usage).toMatchObject({ derivatives: 1, deletable: false });
    expect(cApproved.status).toBe('approved');
    expect((await api.request('/api/v1/media/11111111-1111-4111-8111-111111111111/usage')).status).toBe(404);
  });
});

describe('delete with detach=drafts', () => {
  it('removes the file from drafts (revision bump, dense positions) and deletes it', async () => {
    const a = await createDraft();
    const x = await uploadTo(a.id, a.revision, png(1, 1), 'x.png');
    const target = await uploadTo(a.id, x.revision, png(2, 2), 'target.png');
    const y = await uploadTo(a.id, target.revision, png(3, 3), 'y.png');
    const b = await createDraft();
    const bAttached = await attachTo(b.id, b.revision, [target.media.id]);
    const objectsBefore = await objects();

    const plain = await api.request(`/api/v1/media/${target.media.id}`, { method: 'DELETE' });
    expect(plain.status).toBe(409);
    expect(apiErrorSchema.parse(await plain.json()).error.details).toMatchObject({
      reason: 'MEDIA_IN_USE',
      blockedBy: 'DRAFTS'
    });

    const response = await api.request(`/api/v1/media/${target.media.id}?detach=drafts`, { method: 'DELETE' });

    expect(response.status).toBe(204);
    expect(await mediaOrder(a.id)).toEqual([
      { id: x.media.id, position: 0 },
      { id: y.media.id, position: 1 }
    ]);
    expect(await mediaOrder(b.id)).toEqual([]);
    expect((await postRow(a.id))?.revision).toBe(y.revision + 1);
    expect((await postRow(b.id))?.revision).toBe(bAttached.revision + 1);
    expect(await count(`SELECT count(*) AS n FROM media_assets WHERE id = '${target.media.id}'`)).toBe(0);
    expect(await objects()).toBe(objectsBefore - 1);
    expect(await dangling()).toBe(0);
  });

  it('answers 409 with the strongest reason and changes nothing', async () => {
    const a = await createDraft();
    const source = await uploadTo(a.id, a.revision, png(2, 2));
    const approvedPost = await createDraft();
    const approvedAttach = await attachTo(approvedPost.id, approvedPost.revision, [source.media.id]);
    const approved = await approve(approvedPost.id, approvedAttach.revision);
    const revisionBefore = (await postRow(a.id))?.revision;
    const del = () => api.request(`/api/v1/media/${source.media.id}?detach=drafts`, { method: 'DELETE' });
    const reason = async () => apiErrorSchema.parse(await (await del()).json()).error.details?.blockedBy;

    expect(await reason()).toBe('APPROVED');
    await seedPublication(approvedPost.id, approved.revision, 'succeeded');
    expect(await reason()).toBe('PUBLISHED');
    expect(await holders(source.media.id)).toHaveLength(2);
    expect((await postRow(a.id))?.revision).toBe(revisionBefore);

    // A derivative alone blocks too.
    const lone = await createDraft();
    const loneUpload = await uploadTo(lone.id, lone.revision, png(7, 7));
    const crop = mediaLibraryItemSchema.parse(
      await (await derive(loneUpload.media.id, png(8, 8), nextKey(), 'new')).json()
    );
    const blocked = await api.request(`/api/v1/media/${loneUpload.media.id}?detach=drafts`, { method: 'DELETE' });
    expect(blocked.status).toBe(409);
    expect(apiErrorSchema.parse(await blocked.json()).error.details?.blockedBy).toBe('DERIVATIVES');
    expect(await holders(loneUpload.media.id)).toHaveLength(1);
    expect(crop.id).toBeTruthy();
  });

  it('applies the flag to the bulk endpoint and keeps blocked ids untouched', async () => {
    const a = await createDraft();
    const free = await uploadTo(a.id, a.revision, png(2, 2));
    const b = await createDraft();
    const heldUpload = await uploadTo(b.id, b.revision, png(3, 3));
    const c = await createDraft();
    const heldAttach = await attachTo(c.id, c.revision, [heldUpload.media.id]);
    await approve(c.id, heldAttach.revision);

    const response = await api.request('/api/v1/media/delete', {
      method: 'POST',
      json: { ids: [free.media.id, heldUpload.media.id], detach: 'drafts' }
    });

    expect(response.status).toBe(200);
    expect(bulkDeleteMediaResultSchema.parse(await response.json())).toEqual({
      deleted: [free.media.id],
      inUse: [heldUpload.media.id]
    });
    expect(await holders(heldUpload.media.id)).toHaveLength(2);
    expect(await count(`SELECT count(*) AS n FROM media_assets WHERE id = '${free.media.id}'`)).toBe(0);
    expect((await postRow(b.id))?.revision).toBe(heldUpload.revision);
    const withoutFlag = await api.request('/api/v1/media/delete', {
      method: 'POST',
      json: { ids: [heldUpload.media.id] }
    });
    expect(bulkDeleteMediaResultSchema.parse(await withoutFlag.json()).inUse).toEqual([heldUpload.media.id]);
  });

  it('stays inside the 50 statements with 20 drafts', async () => {
    const owner = await createDraft();
    const source = await uploadTo(owner.id, owner.revision, png(2, 2));
    for (let index = 0; index < 19; index += 1) {
      const draft = await createDraft();
      await attachTo(draft.id, draft.revision, [source.media.id]);
    }
    const { db, meter } = meteredDb(testDb());
    api = createApi({ db });

    const response = await api.request(`/api/v1/media/${source.media.id}?detach=drafts`, { method: 'DELETE' });

    expect(response.status).toBe(204);
    expect(meter.statements).toBeLessThanOrEqual(30);
    expect(await count('SELECT count(*) AS n FROM post_media')).toBe(0);
  });

  it('refuses to detach from more than 20 drafts', async () => {
    const owner = await createDraft();
    const source = await uploadTo(owner.id, owner.revision, png(2, 2));
    for (let index = 0; index < 20; index += 1) {
      const draft = await createDraft();
      await attachTo(draft.id, draft.revision, [source.media.id]);
    }

    const response = await api.request(`/api/v1/media/${source.media.id}?detach=drafts`, { method: 'DELETE' });

    expect(response.status).toBe(409);
    expect(await holders(source.media.id)).toHaveLength(21);
  });
});

describe('delete with detach=all', () => {
  const del = (mediaId: string, detach = 'all') =>
    api.request(`/api/v1/media/${mediaId}?detach=${detach}`, { method: 'DELETE' });
  const jobStatus = (n = 1) =>
    testDb()
      .prepare(`SELECT status FROM jobs WHERE id = 'f0000000-0000-4000-8000-00000000000${n}'`)
      .first<{ status: string }>()
      .then((row) => row?.status);
  const cleanup = () =>
    processPostMediaCleanup(
      { repo: createD1PostMediaRepository(testDb()), storage: createR2MediaStorage(testMediaBucket()) },
      10,
      START + 10 * 60_000
    );

  async function approvedWithMedia() {
    const draft = await createDraft();
    const upload = await uploadTo(draft.id, draft.revision, png(2, 2));
    const approved = await approve(draft.id, upload.revision);
    return { post: draft, media: upload.media, revision: approved.revision };
  }

  it('lists scheduled, sending and sent publications separately, with the empty flag', async () => {
    const { post, media, revision } = await approvedWithMedia();
    await seedPublication(post.id, revision, 'pending', 1, 9000);
    await seedPublication(post.id, revision, 'retry_wait', 2, 8000);
    await seedPublication(post.id, revision, 'claimed', 3);
    await seedPublication(post.id, revision, 'succeeded', 4);
    await testDb()
      .prepare('UPDATE post_revisions SET title = ?3, body = ?3 WHERE post_id = ?1 AND revision = ?2')
      .bind(post.id, revision, ' ')
      .run();

    const usage = mediaUsageSchema.parse(await (await api.request(`/api/v1/media/${media.id}/usage`)).json());

    expect(usage.scheduled.map(({ scheduledAt, wouldBeEmpty }) => [scheduledAt, wouldBeEmpty])).toEqual([
      [new Date(8000).toISOString(), true],
      [new Date(9000).toISOString(), true]
    ]);
    expect(usage.sending).toMatchObject([{ state: 'sending', postId: post.id }]);
    expect(usage.sent).toMatchObject([{ postId: post.id }]);
    expect(usage.approved).toEqual([]);
    expect(usage).toMatchObject({ detachable: false });
  });

  it('keeps a scheduled publication pending, frees the file, and the sender no longer sees it', async () => {
    const { post, media, revision } = await approvedWithMedia();
    await seedPublication(post.id, revision, 'pending');
    const before = await objects();

    const refused = await del(media.id, 'drafts');
    expect(refused.status).toBe(409);
    expect(apiErrorSchema.parse(await refused.json()).error.details).toMatchObject({ blockedBy: 'SCHEDULED' });

    const response = await del(media.id);

    expect(response.status).toBe(204);
    expect(await jobStatus()).toBe('pending');
    expect(await count(`SELECT count(*) AS n FROM media_assets WHERE id = '${media.id}'`)).toBe(0);
    expect(await dangling()).toBe(0);
    expect(await objects()).toBe(before - 1);
    expect(await count('SELECT count(*) AS n FROM post_media_cleanup')).toBe(0);
    const snapshot = await createD1PostRepository(testDb()).findRevision(post.id, revision);
    expect(snapshot?.media).toEqual([]);
    expect(snapshot?.body).toBe('Body');
  });

  it('cancels a publication that would be left with no media and no text, with a stable code', async () => {
    const { post, media, revision } = await approvedWithMedia();
    await testDb()
      .prepare('UPDATE post_revisions SET title = ?3, body = ?3 WHERE post_id = ?1 AND revision = ?2')
      .bind(post.id, revision, ' ')
      .run();
    const publicationId = await seedPublication(post.id, revision, 'retry_wait');

    const response = await del(media.id);

    expect(response.status).toBe(204);
    expect(await jobStatus()).toBe('cancelled');
    expect(
      await testDb()
        .prepare('SELECT last_error_code AS code, revision FROM publications WHERE id = ?1')
        .bind(publicationId)
        .first()
    ).toEqual({ code: 'MEDIA_DELETED', revision: 1 });
    expect(
      await count(
        `SELECT count(*) AS n FROM audit_log WHERE action = 'publication.cancel' AND entity_id = '${publicationId}'`
      )
    ).toBe(1);
  });

  it('answers 409 and changes nothing while a publication is claimed or unknown', async () => {
    for (const state of ['claimed', 'unknown']) {
      await resetDb();
      await seedSession({ token: OWNER_TOKEN, expiresAt: START + 7 * 24 * 60 * 60 * 1000 });
      const { post, media, revision } = await approvedWithMedia();
      await seedPublication(post.id, revision, 'pending', 1);
      await seedPublication(post.id, revision, state, 2);
      const before = await objects();

      const response = await del(media.id);

      expect(response.status).toBe(409);
      expect(apiErrorSchema.parse(await response.json()).error.details).toMatchObject({
        reason: 'MEDIA_PUBLICATION_IN_FLIGHT',
        blockedBy: 'SENDING'
      });
      expect(await jobStatus(1)).toBe('pending');
      expect(await jobStatus(2)).toBe(state);
      expect(await holders(media.id)).toHaveLength(1);
      expect(await count(`SELECT count(*) AS n FROM media_assets WHERE id = '${media.id}'`)).toBe(1);
      expect(await objects()).toBe(before);
    }
  });

  it('refuses in the same batch when the claim lands first, and deletes when it has not', async () => {
    const { post, media, revision } = await approvedWithMedia();
    await seedPublication(post.id, revision, 'pending');
    await testDb()
      .prepare(
        `UPDATE jobs SET status = 'claimed', lease_until = 99999999999 WHERE id = 'f0000000-0000-4000-8000-000000000001'`
      )
      .run();
    expect((await del(media.id)).status).toBe(409);
    await testDb().prepare(`UPDATE jobs SET status = 'retry_wait', lease_until = NULL`).run();
    expect((await del(media.id)).status).toBe(204);
  });

  it('keeps the history of a sent post readable and reclaims the bytes', async () => {
    const { post, media, revision } = await approvedWithMedia();
    const publicationId = await seedPublication(post.id, revision, 'succeeded');
    const before = await objects();

    const response = await del(media.id);

    expect(response.status).toBe(204);
    expect(await jobStatus()).toBe('succeeded');
    expect(await objects()).toBe(before - 1);
    expect(await dangling()).toBe(0);
    await cleanup();
    expect(await count('SELECT count(*) AS n FROM post_media_cleanup')).toBe(0);
    const read = await api.request(`/api/v1/posts/${post.id}`);
    expect(read.status).toBe(200);
    expect(postSchema.parse(await read.json()).media).toEqual([]);
    expect((await api.request('/api/v1/posts?limit=10')).status).toBe(200);
    expect((await api.request(`/api/v1/publications/${publicationId}`)).status).toBe(200);
    expect((await api.request('/api/v1/publications?limit=10')).status).toBe(200);
    expect((await api.request(`/api/v1/media/${media.id}/usage`)).status).toBe(404);
  });

  it('applies to the bulk endpoint, detaches drafts too, and stays inside the 50 statements', async () => {
    const { post, media, revision } = await approvedWithMedia();
    await seedPublication(post.id, revision, 'pending');
    for (let index = 0; index < 20; index += 1) {
      const draft = await createDraft();
      await attachTo(draft.id, draft.revision, [media.id]);
    }
    const { db, meter } = meteredDb(testDb());
    api = createApi({ db });

    const response = await api.request('/api/v1/media/delete', {
      method: 'POST',
      json: { ids: [media.id], detach: 'all' }
    });

    expect(response.status).toBe(200);
    expect(bulkDeleteMediaResultSchema.parse(await response.json())).toEqual({ deleted: [media.id], inUse: [] });
    expect(meter.statements).toBeLessThanOrEqual(40);
    expect(await count('SELECT count(*) AS n FROM post_media')).toBe(0);
    expect(await jobStatus()).toBe('pending');
  });
});

describe('replaced original retention', () => {
  const cleanup = () =>
    processPostMediaCleanup(
      { repo: createD1PostMediaRepository(testDb()), storage: createR2MediaStorage(testMediaBucket()) },
      10,
      START + 10 * 60_000
    );

  async function replacedAfterLibraryAttach() {
    const a = await createDraft();
    const b = await createDraft();
    const source = await uploadTo(a.id, a.revision, png(2, 2));
    await attachTo(b.id, b.revision, [source.media.id]);
    const crop = mediaLibraryItemSchema.parse(await (await derive(source.media.id, png(4, 4), nextKey())).json());
    return { a, b, source, crop };
  }

  it('reclaims a library-attached original once its crop is deleted', async () => {
    const { source, crop } = await replacedAfterLibraryAttach();
    const removed = await api.request(`/api/v1/media/${crop.id}?detach=drafts`, { method: 'DELETE' });
    expect(removed.status).toBe(204);
    expect(await count(`SELECT count(*) AS n FROM post_media_cleanup WHERE media_id = '${source.media.id}'`)).toBe(1);
    await cleanup();
    expect(await count(`SELECT count(*) AS n FROM media_assets WHERE id = '${source.media.id}'`)).toBe(0);
    expect(await objects()).toBe(0);
  });

  it('keeps it while a publication snapshot names it', async () => {
    const { b, source, crop } = await replacedAfterLibraryAttach();
    const revision = (await postRow(b.id))?.revision ?? 0;
    await testDb()
      .prepare(`UPDATE post_revisions SET media_json = ?3 WHERE post_id = ?1 AND revision = ?2`)
      .bind(b.id, revision, JSON.stringify([source.media.id]))
      .run();
    await seedPublication(b.id, revision, 'succeeded');
    await api.request(`/api/v1/media/${crop.id}?detach=drafts`, { method: 'DELETE' });
    await cleanup();
    expect(await count(`SELECT count(*) AS n FROM media_assets WHERE id = '${source.media.id}'`)).toBe(1);
    expect((await api.request(`/api/v1/media/${source.media.id}/content`)).status).toBe(200);
  });

  it('answers 404 to unhide of an unretained file', async () => {
    const a = await createDraft();
    const upload = await uploadTo(a.id, a.revision, png(2, 2));
    await testDb().prepare('DELETE FROM post_media WHERE media_id = ?1').bind(upload.media.id).run();
    await testDb().prepare('DELETE FROM post_revisions WHERE post_id = ?1').bind(a.id).run();
    await testDb()
      .prepare('UPDATE media_assets SET in_library = 0, library_state = 1 WHERE id = ?1')
      .bind(upload.media.id)
      .run();
    expect((await api.request(`/api/v1/media/${upload.media.id}/unhide`, { method: 'POST' })).status).toBe(404);
  });

  it('answers 404 to a replace of an already replaced source', async () => {
    const a = await createDraft();
    const source = await uploadTo(a.id, a.revision, png(2, 2));
    expect((await derive(source.media.id, png(4, 4), nextKey())).status).toBe(201);
    expect((await derive(source.media.id, png(5, 5), nextKey())).status).toBe(404);
  });

  it('does not list a publication whose job failed as approved usage', async () => {
    const a = await createDraft();
    const upload = await uploadTo(a.id, a.revision, png(2, 2));
    const revision = (await postRow(a.id))?.revision ?? 0;
    await testDb()
      .prepare(`UPDATE post_revisions SET media_json = ?3 WHERE post_id = ?1 AND revision = ?2`)
      .bind(a.id, revision, JSON.stringify([upload.media.id]))
      .run();
    await seedPublication(a.id, revision, 'failed');
    const usage = mediaUsageSchema.parse(await (await api.request(`/api/v1/media/${upload.media.id}/usage`)).json());
    expect(usage.approved).toEqual([]);
    expect(usage.deletable).toBe(false);
  });
});
