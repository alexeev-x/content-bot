import { approveSourceEventAiDraftResponseSchema, sourceEventSeriesSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createContainer } from '../../src/app/container';
import { seriesPostTask } from '../../src/app/workflows/source-event-series';
import { testDb } from '../helpers/db';
import { createApi, fakeClock, OWNER_ID, OWNER_TOKEN, resetDb, seedSession, START, type Api } from '../helpers/harness';
import { testMediaBucket } from '../helpers/media-bucket';
import { count } from '../helpers/publishing';

// An event with its own dota2.com page becomes a planned series (migration 0092, docs/backend/sources.md «Series»).
const EVENT = 'steam_news:2001';
const SERIES = '00000000-0000-4000-8000-00000000a001';
const FIRST = '00000000-0000-4000-8000-00000000b001';
const SECOND = '00000000-0000-4000-8000-00000000b002';
const IMAGE = 'https://cdn.steamstatic.com/apps/dota2/images/dota_react/darkcarnival/overworld/reward_treasure.png';

let api: Api;
const container = () =>
  createContainer(
    { DB: testDb(), MEDIA_BUCKET: testMediaBucket(), OWNER_TELEGRAM_ID: OWNER_ID },
    { clock: fakeClock() }
  );

async function seed() {
  await testDb()
    .prepare(
      `INSERT INTO dota_update_items (source_key, external_id, title, source_url, published_at, detected_at, is_baseline, event_type)
       VALUES ('steam_news', '2001', 'The Dark Carnival', 'https://store.steampowered.com/news/externalpost/steam_community_announcements/2001', ?1, ?1, 0, 'news')`
    )
    .bind(START)
    .run();
  await container().sourceSeries.create({
    id: SERIES,
    externalId: '2001',
    title: 'The Dark Carnival',
    pageUrl: 'https://www.dota2.com/darkcarnival',
    now: START,
    posts: [
      { id: FIRST, position: 1, topic: 'Новость', task: 'Повод: серия', media: [IMAGE] },
      { id: SECOND, position: 2, topic: 'Автоматоны', task: 'Повод: серия 2', media: [] }
    ]
  });
}

async function writeDraft(text: string): Promise<string> {
  const writer = container().aiWriter;
  const id = crypto.randomUUID();
  await writer.createGeneration({
    id,
    kind: 'draft',
    format: 'telegram',
    mode: 'automatic',
    source: 'bot',
    task: 'Повод: серия',
    parentGenerationId: null,
    preApprovedPublishAt: null,
    createdAt: START,
    packRevision: 'test'
  });
  await writer.addRevision({
    id: crypto.randomUUID(),
    generationId: id,
    parentId: null,
    provenance: 'AI_DRAFT',
    text,
    editRatio: null,
    createdAt: START
  });
  await writer.finishGeneration({ id, now: START, status: 'ready', result: 'draft' });
  return id;
}

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * 24 * 60 * 60_000 });
  api = createApi({ clock: fakeClock() });
  await seed();
});

describe('an event series', () => {
  it('tells the owner once, when no post is writing any more', async () => {
    const series = container().sourceSeries;
    await series.finishPost({ id: FIRST, status: 'ready', generationId: await writeDraft('Пост 1') });
    expect(await series.claimNotice(SERIES, START)).toBeNull();
    await series.finishPost({ id: SECOND, status: 'failed', generationId: null });
    expect(await series.claimNotice(SERIES, START)).toEqual({ title: 'The Dark Carnival', total: 2, ready: 1 });
    expect(await series.claimNotice(SERIES, START)).toBeNull();
    // A finished post never goes back to writing.
    await series.finishPost({ id: FIRST, status: 'failed', generationId: null });
    expect((await series.findPost(FIRST))?.status).toBe('ready');
  });

  it('shows the series in order and approves one post into its own studio post, with its own media queued', async () => {
    const draftId = await writeDraft('Габен открыл карнавал.\n\nПодробности: https://www.dota2.com/darkcarnival');
    await container().sourceSeries.finishPost({ id: FIRST, status: 'ready', generationId: draftId });
    api.aiJobs.deliver = () => Promise.resolve();
    const series = sourceEventSeriesSchema.parse(
      await (await api.request(`/api/v1/sources/events/${EVENT}/series`)).json()
    );
    expect(series.posts.map((post) => [post.position, post.topic, post.status])).toEqual([
      [1, 'Новость', 'ready'],
      [2, 'Автоматоны', 'writing']
    ]);
    expect(series.posts[0]?.draft).toMatchObject({ versionId: draftId, status: 'ready', postId: null });

    const approve = (versionId: string) =>
      api.request(`/api/v1/sources/events/${EVENT}/series/${FIRST}/approve`, { method: 'POST', json: { versionId } });
    const first = await approve(draftId);
    expect(first.status).toBe(201);
    const { postId } = approveSourceEventAiDraftResponseSchema.parse(await first.json());
    expect((await approve(draftId)).status).toBe(200);
    expect(await count('posts')).toBe(1);
    expect(api.aiJobs.sent).toMatchObject([{ kind: 'source_media', postId, urls: [IMAGE] }]);
    // The series post keeps its own post; the event's single-post link is untouched.
    expect((await container().sourceSeries.findPost(FIRST))?.postId).toBe(postId);
    const event = await container().sourceEvents.find({ sourceKey: 'steam_news', externalId: '2001' });
    expect(event?.draft).toBeNull();
    // The link line became the word «Подробности».
    const post = await container().posts.findById(postId);
    expect(post?.body.endsWith('Подробности')).toBe(true);

    expect(
      (
        await api.request(`/api/v1/sources/events/${EVENT}/series/${SECOND}/approve`, {
          method: 'POST',
          json: { versionId: draftId }
        })
      ).status
    ).toBe(404);
  });

  it('rewrites only the version shown, never an approved one, and needs words for its own instruction', async () => {
    const draftId = await writeDraft('Пост серии.');
    await container().sourceSeries.finishPost({ id: FIRST, status: 'ready', generationId: draftId });
    api.aiJobs.deliver = () => Promise.resolve();
    const rewrite = (json: unknown) =>
      api.request(`/api/v1/sources/events/${EVENT}/series/${FIRST}/rewrite`, { method: 'POST', json });
    const stale = await rewrite({ versionId: crypto.randomUUID(), action: 'short' });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { details: { reason: 'STALE_REVISION' } } });
    expect((await rewrite({ versionId: draftId, action: 'custom' })).status).toBe(400);
    await api.request(`/api/v1/sources/events/${EVENT}/series/${FIRST}/approve`, {
      method: 'POST',
      json: { versionId: draftId }
    });
    const approved = await rewrite({ versionId: draftId, action: 'again' });
    expect(approved.status).toBe(409);
    expect(await approved.json()).toMatchObject({ error: { details: { reason: 'APPROVED' } } });
  });

  it('keeps each post task within the writer limit, the request before the facts', () => {
    const task = seriesPostTask({
      title: 'The Dark Carnival',
      pageUrl: 'https://www.dota2.com/darkcarnival',
      position: 2,
      total: 4,
      topic: 'Автоматоны',
      brief: 'Пять героев-автоматонов.',
      facts: ['x'.repeat(5_000)]
    });
    expect(task.length).toBeLessThanOrEqual(4_000);
    expect(task).toContain('Ссылка на источник: https://www.dota2.com/darkcarnival');
    expect(task).toContain('Это не первый пост серии');
    expect(task.endsWith('>>>')).toBe(true);
  });
});
