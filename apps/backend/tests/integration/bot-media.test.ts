import { beforeEach, describe, expect, it } from 'vitest';
import { mediaLibraryPageSchema, postSchema } from '@alexeev/contracts';
import { createContainer } from '../../src/app/container';
import { uploadPostMedia } from '../../src/modules/content';
import { testDb } from '../helpers/db';
import { createApi, fakeClock, type Api, OWNER_ID, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { testMediaBucket } from '../helpers/media-bucket';
import { seedDestination, seedDraftPost, seedPublication } from '../helpers/publishing';

// A picture the bot attached itself (a source event's) stays out of «Медиа» and goes with its post, a sent one
// included (owner, 22.10.2026; migration 0099).

// A 2×3 PNG: enough for the upload's signature and dimension checks.
const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 3, 8, 2, 0,
  0, 0, 0, 0, 0, 0
]);
let api: Api;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * 24 * 60 * 60_000 });
  api = createApi({ clock: fakeClock() });
});

async function attach(postId: string, revision: number, hidden: boolean) {
  const container = createContainer(
    { DB: testDb(), MEDIA_BUCKET: testMediaBucket(), OWNER_TELEGRAM_ID: OWNER_ID },
    { clock: fakeClock() }
  );
  const storage = container.mediaStorage;
  if (storage === undefined) throw new Error('no storage');
  return uploadPostMedia(
    { repo: container.postMedia, storage, now: START, newId: container.newId },
    {
      postId,
      revision,
      fileName: 'steam-a.png',
      contentType: 'image/png',
      contentLength: png.byteLength,
      body: new ReadableStream({ start: (c) => (c.enqueue(png), c.close()) }),
      actor: OWNER_ID,
      idempotencyKey: `k-${hidden}`,
      hidden
    }
  );
}

const queued = async (mediaId: string) =>
  (
    await testDb()
      .prepare('SELECT count(*) AS n FROM post_media_cleanup WHERE media_id = ?1')
      .bind(mediaId)
      .first<{ n: number }>()
  )?.n;

describe('a picture the bot attached itself', () => {
  it('is not listed in «Медиа»; an uploaded one is', async () => {
    const post = await seedDraftPost(api);
    const bot = await attach(post.id, post.revision, true);
    const own = await attach(post.id, bot.revision, false);
    const library = mediaLibraryPageSchema.parse(await (await api.request('/api/v1/media')).json());
    const ids = library.items.map((item) => item.id);
    expect(ids).toContain(own.media.id);
    expect(ids).not.toContain(bot.media.id);
  });

  it('goes with its post once the post is deleted, though a sent publication still names it', async () => {
    const draft = await seedDraftPost(api);
    const bot = await attach(draft.id, draft.revision, true);
    const approved = postSchema.parse(
      await (
        await api.request(`/api/v1/posts/${draft.id}/approve`, { method: 'POST', json: { revision: bot.revision } })
      ).json()
    );
    const destination = await seedDestination(api);
    const publication = await seedPublication(api, {
      postId: approved.id,
      revision: approved.revision,
      destinationId: destination.id,
      scheduledAt: new Date(START + 60_000).toISOString()
    });
    await testDb().prepare("UPDATE jobs SET status = 'succeeded' WHERE publication_id = ?1").bind(publication.id).run();
    expect(await queued(bot.media.id)).toBe(0);

    const deleted = await api.request(`/api/v1/posts/${draft.id}/delete`, {
      method: 'POST',
      json: { revision: approved.revision }
    });
    expect(deleted.status).toBe(200);
    // Kept as history (a sent post is soft-deleted), but its picture is queued for removal.
    expect(await queued(bot.media.id)).toBe(1);
  });
});
