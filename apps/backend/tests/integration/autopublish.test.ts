import { Api as BotApi } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runAiJob } from '../../src/app/bot/ai-writer';
import { createD1AiRepository, type AiTextProvider, updateAiSettings } from '../../src/modules/ai';
import { writerAnswer } from '../helpers/writer-answer';
import { ownerOperationsSettingsSchema } from '@alexeev/contracts';
import { createContainer, type Container } from '../../src/app/container';
import { createWriterDeps } from '../../src/app/bot/writer-deps';
import {
  autopublishSourceEvent,
  AUTOPUBLISH_ACTOR,
  publishQueuedPatchPost
} from '../../src/app/workflows/autopublish-source-event';
import type { SourceMediaDeps } from '../../src/app/workflows/source-event-media';
import { testDb } from '../helpers/db';
import { createApi, fakeClock, type Api, OWNER_ID, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { testMediaBucket } from '../helpers/media-bucket';
import { uploadPostMedia } from '../../src/modules/content';
import { count, seedDestination } from '../helpers/publishing';

// Valve's news without the owner (owner, 21–22.10.2026): only while switched on with a channel, under the daily
// limit, and once per event; an event post whose pictures did not arrive goes to the owner instead.

let api: Api;
let container: Container;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * 24 * 60 * 60_000 });
  api = createApi({ clock: fakeClock() });
  container = createContainer(
    { DB: testDb(), MEDIA_BUCKET: testMediaBucket(), OWNER_TELEGRAM_ID: OWNER_ID },
    { clock: fakeClock() }
  );
});

async function settings(autopublish: { enabled: boolean; destinationId: string | null; dailyLimit: number }) {
  const current = ownerOperationsSettingsSchema.parse(await (await api.request('/api/v1/settings/operations')).json());
  const response = await api.request('/api/v1/settings/operations', {
    method: 'PUT',
    json: { revision: current.revision, timezone: current.timezone, notifications: current.notifications, autopublish }
  });
  expect(response.status).toBe(200);
}

async function draft(text: string): Promise<string> {
  const id = crypto.randomUUID();
  await container.aiWriter.createGeneration({
    id,
    kind: 'draft',
    format: 'telegram',
    mode: 'automatic',
    source: 'bot',
    task: 'Повод: анонс',
    parentGenerationId: null,
    preApprovedPublishAt: null,
    createdAt: START,
    packRevision: 'test'
  });
  await container.aiWriter.addRevision({
    id: crypto.randomUUID(),
    generationId: id,
    parentId: null,
    provenance: 'AI_DRAFT',
    text,
    editRatio: null,
    createdAt: START
  });
  await container.aiWriter.finishGeneration({ id, now: START, status: 'ready', result: 'draft' });
  return id;
}

/** The announcement's pictures: none by default; `failing` lists some that never arrive. */
const media = (failing = false): SourceMediaDeps => ({
  repo: { findSteamAnnouncement: async () => ({ publishedAt: START }) } as unknown as SourceMediaDeps['repo'],
  postState: async () => ({ revision: 0, mediaCount: 0 }),
  upload: async () => {
    throw new Error('not reached');
  },
  fetchAnnouncement: async () => ({
    text: 'x',
    pages: [],
    images: failing ? ['https://clan.akamai.steamstatic.com/images/1/a.png'] : []
  }),
  fetchImpl: (async () => new Response(null, { status: 404 })) as unknown as typeof fetch
});

const run = async (externalId: string, text: string, deps = media()) => {
  const id = await draft(text);
  return autopublishSourceEvent(container, await createWriterDeps(container, 'test'), deps, {
    externalId,
    rootId: id,
    versionId: id,
    requestId: 'test'
  });
};

describe('automatic publishing of an event post', () => {
  it('does nothing while it is off', async () => {
    expect(await run('1001', 'Габен выпустил патч.')).toEqual({ kind: 'skipped', reason: 'off' });
    expect(await count('publications')).toBe(0);
  });

  it('approves the post and publishes it now to the chosen channel, once per event, within the daily limit', async () => {
    const destination = await seedDestination(api);
    await settings({ enabled: true, destinationId: destination.id, dailyLimit: 1 });

    const first = await run('1001', 'Габен выпустил патч.');
    expect(first).toMatchObject({ kind: 'published', title: expect.any(String) });
    expect(await count('posts', "status = 'approved'")).toBe(1);
    expect(await count('publications', `destination_id = '${destination.id}'`)).toBe(1);
    expect(
      await count('audit_log', `action = 'publication.create' AND actor_telegram_id = '${AUTOPUBLISH_ACTOR}'`)
    ).toBe(1);
    expect(await count('ai_text_revisions', "provenance = 'OWNER_PREAPPROVED'")).toBe(1);

    // Over the limit: the next event's draft goes to the owner.
    expect(await run('1002', 'Ещё одна новость.')).toEqual({ kind: 'skipped', reason: 'limit' });
    expect(await count('publications')).toBe(1);
  });

  it('leaves a draft over a post’s 4 096 characters to the owner, saying why (owner, 23.10.2026)', async () => {
    const destination = await seedDestination(api);
    await settings({ enabled: true, destinationId: destination.id, dailyLimit: 3 });
    expect(await run('1001', `Хотфикс. ${'Исправили баг. '.repeat(300)}`)).toEqual({
      kind: 'skipped',
      reason: 'too_long'
    });
    expect(await count('posts')).toBe(0);
  });

  it('does nothing while the chosen channel is disabled', async () => {
    const destination = await seedDestination(api);
    await settings({ enabled: true, destinationId: destination.id, dailyLimit: 3 });
    await testDb().prepare('UPDATE destinations SET enabled = 0 WHERE id = ?1').bind(destination.id).run();
    expect(await run('1004', 'Новость.')).toEqual({ kind: 'skipped', reason: 'channel' });
    expect(await count('posts')).toBe(0);
  });

  it('leaves an event post whose pictures did not arrive to the owner', async () => {
    const destination = await seedDestination(api);
    await settings({ enabled: true, destinationId: destination.id, dailyLimit: 3 });
    expect(await run('1003', 'Новая сокровищница.', media(true))).toMatchObject({ kind: 'held', reason: 'no_images' });
    expect(await count('publications')).toBe(0);
  });

  it('queues a patch post for its picture, then publishes it once with the picture or, failing it, without', async () => {
    const destination = await seedDestination(api);
    await settings({ enabled: true, destinationId: destination.id, dailyLimit: 3 });
    const queued: string[] = [];
    const id = await draft('Патч 7.41b вышел.');
    const outcome = await autopublishSourceEvent(container, await createWriterDeps(container, 'test'), media(), {
      externalId: '1005',
      rootId: id,
      versionId: id,
      requestId: 'test',
      queuePicture: async (postId) => {
        queued.push(postId);
      }
    });
    expect(outcome).toMatchObject({ kind: 'queued' });
    expect(queued).toHaveLength(1);
    expect(await count('publications')).toBe(0);

    const postId = queued[0] ?? '';
    const drawn = vi.fn(async () => 'failed' as const);
    const job = () =>
      publishQueuedPatchPost(
        container,
        { ...media(), patchPicture: drawn },
        { postId, externalId: '1005', requestId: 'test' }
      );
    expect(await job()).toMatchObject({ kind: 'published', pictureFailed: true });
    // A redelivered job never doubles the publication (the event's idempotency key).
    expect(await job()).toMatchObject({ kind: 'published' });
    expect(await count('publications')).toBe(1);
  });

  it('attaches three pictures one per message and publishes only after the last (QA 23.10.2026)', async () => {
    const destination = await seedDestination(api);
    await settings({ enabled: true, destinationId: destination.id, dailyLimit: 3 });
    const queued: string[] = [];
    const id = await draft('Новая сокровищница.');
    await autopublishSourceEvent(container, await createWriterDeps(container, 'test'), media(), {
      externalId: '1006',
      rootId: id,
      versionId: id,
      requestId: 'test',
      queuePicture: async (postId) => {
        queued.push(postId);
      }
    });
    const postId = queued[0] ?? '';
    const storage = container.mediaStorage;
    if (storage === undefined) throw new Error('no storage');
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 3, 8, 2,
      0, 0, 0, 0, 0, 0, 0
    ]);
    const pictures: SourceMediaDeps = {
      ...media(),
      postState: async (post) => {
        const state = await container.postMedia.findPostState(post);
        return state === null ? null : { revision: state.revision, mediaCount: state.media.length };
      },
      upload: (command) =>
        uploadPostMedia(
          { repo: container.postMedia, storage, now: START, newId: container.newId },
          { ...command, actor: OWNER_ID, hidden: true }
        ),
      fetchAnnouncement: async () => ({
        text: 'x',
        pages: [],
        images: ['a', 'b', 'c'].map((name) => `https://clan.akamai.steamstatic.com/images/1/${name.repeat(40)}.png`)
      }),
      fetchImpl: (async () =>
        new Response(png, { headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch
    };
    const job = (from?: number) =>
      publishQueuedPatchPost(container, pictures, {
        postId,
        externalId: '1006',
        requestId: 'test',
        ...(from === undefined ? {} : { from })
      });

    expect(await job()).toEqual({ kind: 'continue', postId, from: 1 });
    expect(await job(1)).toEqual({ kind: 'continue', postId, from: 2 });
    expect(await count('publications')).toBe(0);
    expect(await job(2)).toMatchObject({ kind: 'published' });
    expect((await container.postMedia.findPostState(postId))?.media).toHaveLength(3);
    expect(await count('publications')).toBe(1);
  });
});

// The bot's side: only a draft whose fact check found nothing goes to the automatic publishing; any other is the
// owner's to approve, as before.
describe('the event job in the bot', () => {
  const answer = writerAnswer({
    hooks: ['Габен выпустил патч.', 'Новый патч.', 'Патч вышел.'],
    text: 'Габен выпустил патч 7.42.',
    topic: 'Патч',
    device: 'новость',
    ending: 'патч'
  });
  const runEvent = async (
    factCheck: string,
    automatic = true,
    published: string | { held: string } = 'Опубликовано без вас: «Патч»'
  ) => {
    const answers = [answer, factCheck, answer];
    const provider: AiTextProvider = {
      provider: 'openai',
      complete: () =>
        Promise.resolve({
          text: answers.shift() ?? '',
          model: 'gpt-6.1-sol',
          usage: { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 10 }
        })
    };
    await updateAiSettings(
      { repo: createD1AiRepository(testDb()), clock: fakeClock() },
      {
        revision: 0,
        provider: 'openai',
        enabled: true,
        draftModel: 'gpt-6.1-sol',
        cheapModel: 'gpt-6-luna',
        videoReviews: false,
        prices: [],
        monthlyBudgetUsd: 5,
        dailyCapUsd: 1,
        warnAtPercent: 80
      }
    );
    const withModel = createContainer(
      { DB: testDb(), MEDIA_BUCKET: testMediaBucket(), OWNER_TELEGRAM_ID: OWNER_ID },
      { clock: fakeClock(), aiProvider: provider }
    );
    const edits: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { text?: string };
      if (body.text !== undefined) edits.push(body.text);
      return Promise.resolve(Response.json({ ok: true, result: true }));
    });
    const asked: string[] = [];
    await runAiJob(
      {
        id: crypto.randomUUID(),
        chatId: Number(OWNER_ID),
        messageId: 5,
        appOrigin: 'https://s',
        kind: 'event',
        externalId: '1001',
        automatic
      },
      {
        api: new BotApi('123456:PLACEHOLDER'),
        clock: fakeClock(),
        claim: () => Promise.resolve(true),
        finish: () => Promise.resolve(),
        writer: () => createWriterDeps(withModel, 'test'),
        onError: () => {},
        sourceEvents: {
          task: async () => ({ task: 'Повод: патч 7.42', facts: null }),
          generated: async () => {},
          finished: async () => {}
        },
        autopublish: async (_job, draft) => {
          asked.push(draft.versionId);
          return published;
        }
      }
    );
    vi.restoreAllMocks();
    return { asked, edits };
  };

  it('publishes a clean draft, and shows the note instead of the draft', async () => {
    const { asked, edits } = await runEvent(JSON.stringify({ problems: [] }));
    expect(asked).toHaveLength(1);
    expect(edits.at(-1)).toBe('Опубликовано без вас: «Патч»');
  });

  it('never publishes a replay the owner asked for with «Написать через ИИ», however clean', async () => {
    const { asked } = await runEvent(JSON.stringify({ problems: [] }), false);
    expect(asked).toHaveLength(0);
  });

  it('never publishes a draft the fact check found claims in; the owner gets it', async () => {
    const { asked, edits } = await runEvent(
      JSON.stringify({ problems: [{ quote: 'Габен выпустил патч 7.42.', why: 'нет в фактах' }] })
    );
    expect(asked).toHaveLength(0);
    expect(edits.at(-1)).toContain('Габен выпустил патч 7.42.');
    expect(edits.at(-1)).toContain('Не опубликовано без вас: проверка фактов');
  });

  it('says under the draft why it did not go out alone when the publishing skipped it', async () => {
    // Owner, 23.10.2026: «почему он автоматом дальше не идёт?» — the daily limit, said nowhere.
    const { asked, edits } = await runEvent(JSON.stringify({ problems: [] }), true, {
      held: 'дневной лимит автопубликаций исчерпан'
    });
    expect(asked).toHaveLength(1);
    expect(edits.at(-1)).toContain('Не опубликовано без вас: дневной лимит автопубликаций исчерпан.');
  });
});
