import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ownerOperationsSettingsSchema } from '@alexeev/contracts';
import { createContainer, type Container } from '../../src/app/container';
import type { AiJob } from '../../src/app/bot/ai-job';
import { runSeriesPublishStep } from '../../src/app/workflows/autopublish-series';
import type { SourceMediaDeps } from '../../src/app/workflows/source-event-media';
import { testDb } from '../helpers/db';
import { createApi, fakeClock, type Api, OWNER_ID, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { testMediaBucket } from '../helpers/media-bucket';
import { uploadPostMedia } from '../../src/modules/content';
import { count, seedDestination } from '../helpers/publishing';

// An event's series published without the owner (owner, 22.10.2026): one step per post, then the series 10 minutes
// apart; off (or over the limit) the owner gets the usual «Серия готова» note, silently.

const SERIES = '00000000-0000-4000-8000-00000000c000';
const POSTS = ['00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c002'];
let api: Api;
let container: Container;
let queued: AiJob[];
let messages: { text: string; silent: boolean }[];

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * 24 * 60 * 60_000 });
  api = createApi({ clock: fakeClock() });
  queued = [];
  messages = [];
  container = createContainer(
    {
      DB: testDb(),
      MEDIA_BUCKET: testMediaBucket(),
      OWNER_TELEGRAM_ID: OWNER_ID,
      AI_JOBS: { send: async (job: AiJob) => void queued.push(job) } as unknown as Queue
    },
    { clock: fakeClock() }
  );
  vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { text?: string; disable_notification?: boolean };
    if (body.text !== undefined) messages.push({ text: body.text, silent: body.disable_notification === true });
    return Promise.resolve(
      Response.json({ ok: true, result: { message_id: 1, date: 0, chat: { id: 1, type: 'private' } } })
    );
  });
  await testDb()
    .prepare(
      `INSERT INTO dota_update_items (source_key, external_id, title, source_url, published_at, detected_at, is_baseline, event_type)
       VALUES ('steam_news', '3001', 'The Dark Carnival', 'https://store.steampowered.com/news/x/3001', ?1, ?1, 0, 'news')`
    )
    .bind(START)
    .run();
  await container.sourceSeries.create({
    id: SERIES,
    externalId: '3001',
    title: 'The Dark Carnival',
    pageUrl: 'https://www.dota2.com/darkcarnival',
    now: START,
    automatic: true,
    posts: POSTS.map((id, index) => ({ id, position: index + 1, topic: `Тема ${index + 1}`, task: 'Повод', media: [] }))
  });
  for (const [index, id] of POSTS.entries()) {
    const generationId = crypto.randomUUID();
    await container.aiWriter.createGeneration({
      id: generationId,
      kind: 'draft',
      format: 'telegram',
      mode: 'automatic',
      source: 'bot',
      task: 'Повод',
      parentGenerationId: null,
      preApprovedPublishAt: null,
      createdAt: START,
      packRevision: 'test'
    });
    await container.aiWriter.addRevision({
      id: crypto.randomUUID(),
      generationId,
      parentId: null,
      provenance: 'AI_DRAFT',
      text: `Пост ${index + 1} о карнавале.`,
      editRatio: null,
      createdAt: START
    });
    await container.aiWriter.finishGeneration({ id: generationId, now: START, status: 'ready', result: 'draft' });
    await container.sourceSeries.finishPost({ id, status: 'ready', generationId, factCheck: 'clean' });
  }
});

const noPictures = (): SourceMediaDeps => ({
  repo: { findSteamAnnouncement: async () => null } as unknown as SourceMediaDeps['repo'],
  postState: async () => null,
  upload: async () => {
    throw new Error('not reached');
  }
});

async function settings(autopublish: { enabled: boolean; destinationId: string | null; dailyLimit: number }) {
  const current = ownerOperationsSettingsSchema.parse(await (await api.request('/api/v1/settings/operations')).json());
  await api.request('/api/v1/settings/operations', {
    method: 'PUT',
    json: { revision: current.revision, timezone: current.timezone, notifications: current.notifications, autopublish }
  });
}

const step = (position: number): Extract<AiJob, { kind: 'series_publish' }> => ({
  id: crypto.randomUUID(),
  kind: 'series_publish',
  chatId: Number(OWNER_ID),
  appOrigin: 'https://s',
  seriesId: SERIES,
  position
});
const run = (job: Extract<AiJob, { kind: 'series_publish' }>) =>
  runSeriesPublishStep(container, job, '123456:PLACEHOLDER', noPictures, 'test', () => {});

describe('publishing an event series without the owner', () => {
  it('approves each post in its own step, then publishes the series 10 minutes apart', async () => {
    const destination = await seedDestination(api);
    await settings({ enabled: true, destinationId: destination.id, dailyLimit: 3 });

    await run(step(1));
    expect(queued).toMatchObject([{ kind: 'series_publish', seriesId: SERIES, position: 2 }]);
    expect(await count('publications')).toBe(0);
    await run(queued[0] as Extract<AiJob, { kind: 'series_publish' }>);
    // The publication has a message of its own.
    expect(queued.at(-1)).toMatchObject({ position: 3 });
    expect(await count('publications')).toBe(0);
    await run(queued.at(-1) as Extract<AiJob, { kind: 'series_publish' }>);

    const rows = (
      await testDb()
        .prepare('SELECT series_position, scheduled_at FROM publications ORDER BY series_position')
        .all<{ series_position: number; scheduled_at: number }>()
    ).results;
    expect(rows.map((row) => row.series_position)).toEqual([1, 2]);
    expect((rows[1]?.scheduled_at ?? 0) - (rows[0]?.scheduled_at ?? 0)).toBe(10 * 60_000);
    expect(messages.at(-1)).toMatchObject({ silent: true, text: expect.stringContaining('Опубликовано без вас') });
    // A series counts once against the daily limit.
    expect(await container.publications.countCreatedBy('autopublish', START - 1)).toBe(1);
  });

  it('attaches the first post’s pictures one per message without stopping the series (QA 23.10.2026)', async () => {
    const destination = await seedDestination(api);
    await settings({ enabled: true, destinationId: destination.id, dailyLimit: 3 });
    const CDN = 'https://cdn.steamstatic.com/apps/dota2/images/dota_react/darkcarnival';
    await testDb()
      .prepare('UPDATE source_series_posts SET media_json = ?1 WHERE id = ?2')
      .bind(JSON.stringify([`${CDN}/a.png`, `${CDN}/b.png`]), POSTS[0])
      .run();
    const storage = container.mediaStorage;
    if (storage === undefined) throw new Error('no storage');
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 3, 8, 2,
      0, 0, 0, 0, 0, 0, 0
    ]);
    const pictures = (): SourceMediaDeps => ({
      ...noPictures(),
      postState: async (post) => {
        const state = await container.postMedia.findPostState(post);
        return state === null ? null : { revision: state.revision, mediaCount: state.media.length };
      },
      upload: (command) =>
        uploadPostMedia(
          { repo: container.postMedia, storage, now: START, newId: container.newId },
          { ...command, actor: OWNER_ID, hidden: true }
        ),
      fetchImpl: (async () =>
        new Response(png, { headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch
    });
    const go = (job: Extract<AiJob, { kind: 'series_publish' }>) =>
      runSeriesPublishStep(container, job, '123456:PLACEHOLDER', pictures, 'test', () => {});

    await go(step(1));
    expect(queued.at(-1)).toMatchObject({ position: 1, from: 1 });
    await go(queued.at(-1) as Extract<AiJob, { kind: 'series_publish' }>);
    // The next post's step drops `from`, and the series goes on.
    expect(queued.at(-1)).toMatchObject({ position: 2 });
    expect(queued.at(-1)).not.toHaveProperty('from');
    await go(queued.at(-1) as Extract<AiJob, { kind: 'series_publish' }>);
    await go(queued.at(-1) as Extract<AiJob, { kind: 'series_publish' }>);

    expect(await count('publications')).toBe(2);
    const row = await testDb()
      .prepare('SELECT post_id FROM source_series_posts WHERE id = ?1')
      .bind(POSTS[0])
      .first<{ post_id: string }>();
    const postId = row?.post_id ?? '';
    expect((await container.postMedia.findPostState(postId))?.media).toHaveLength(2);
  });

  it('while it is off, approves nothing and sends the usual note, silently', async () => {
    await run(step(1));
    expect(queued).toEqual([]);
    expect(await count('posts')).toBe(0);
    // Off, the note keeps its sound.
    expect(messages).toEqual([{ silent: false, text: expect.stringContaining('готова: 2') }]);
  });

  // QA 22.10.2026: a post rewritten after its check (or edited) is never published without the owner.
  it('hands the series to the owner when a post was rewritten after its fact check', async () => {
    const destination = await seedDestination(api);
    await settings({ enabled: true, destinationId: destination.id, dailyLimit: 3 });
    const post = await container.sourceSeries.findPost(POSTS[0] ?? '');
    await container.aiWriter.addRevision({
      id: crypto.randomUUID(),
      generationId: post?.generationId ?? '',
      parentId: (await container.aiWriter.revisions(post?.generationId ?? '')).at(-1)?.id ?? null,
      provenance: 'OWNER_EDITED',
      text: 'Правка владельца.',
      editRatio: 0.5,
      createdAt: START
    });
    await run(step(1));
    expect(queued).toEqual([]);
    expect(await count('posts')).toBe(0);
    expect(messages.at(-1)?.text).toContain('готова: 2');
  });

  // QA 22.10.2026: a post the owner published by hand meanwhile is never published a second time.
  it('publishes nothing when a series post already has a publication', async () => {
    const destination = await seedDestination(api);
    await settings({ enabled: true, destinationId: destination.id, dailyLimit: 3 });
    await run(step(1));
    await run(queued[0] as Extract<AiJob, { kind: 'series_publish' }>);
    const first = await container.sourceSeries.findPost(POSTS[0] ?? '');
    await testDb()
      .prepare(
        `INSERT INTO publications (id, post_id, post_revision, destination_id, scheduled_at, timezone, revision, created_at, updated_at)
         SELECT ?1, id, revision, ?2, ?3, 'Europe/Moscow', 0, ?3, ?3 FROM posts WHERE id = ?4`
      )
      .bind(crypto.randomUUID(), destination.id, START, first?.postId ?? '')
      .run();
    await run(queued.at(-1) as Extract<AiJob, { kind: 'series_publish' }>);
    expect(await count('publications')).toBe(1);
    expect(messages.at(-1)?.text).toContain('пост уже публиковали');
  });
});
