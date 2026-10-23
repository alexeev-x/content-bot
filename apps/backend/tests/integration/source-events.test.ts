import {
  approveSourceEventAiDraftResponseSchema,
  sourceEventAiDraftSchema,
  sourceEventPageSchema,
  sourceEventSchema
} from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPublishActions } from '../../src/app/bot/publish-actions';
import { createContainer, type Container } from '../../src/app/container';
import { processDotaUpdates } from '../../src/app/workflows/process-dota-updates';
import { attachSourceEventImages } from '../../src/app/workflows/source-event-media';
import { uploadPostMedia } from '../../src/modules/content';
import type { AiJob } from '../../src/app/bot/ai-job';
import { createD1DotaWatcherRepository, type DotaPatchInspection } from '../../src/modules/dota';
import { createLogger } from '../../src/platform/logging/logger';
import { createD1SystemState } from '../../src/app/system-state';
import { testDb } from '../helpers/db';
import { makeTick, fakeTransport, SENT } from '../helpers/dispatch';
import { fakeOwnerMessenger } from '../helpers/fake-owner-messenger';
import {
  createApi,
  fakeClock,
  OWNER_ID,
  OWNER_TOKEN,
  resetDb,
  seedSession,
  START,
  TEST_BOT_TOKEN,
  type Api
} from '../helpers/harness';
import { meteredDb } from '../helpers/metered-db';
import { testMediaBucket } from '../helpers/media-bucket';
import { count, seedDestination, seedDraftPost } from '../helpers/publishing';

const DAY = 24 * 60 * 60_000;
const ORIGIN = 'https://studio.example.com';
const PATCH = 'patch_notes:7.41';
const TREASURE = 'steam_news:1001';
const NEWS = 'steam_news:1002';

let api: Api;

async function sql(statement: string, ...bindings: (string | number | null)[]): Promise<void> {
  await testDb()
    .prepare(statement)
    .bind(...bindings)
    .run();
}

async function seedItem(input: {
  sourceKey: 'steam_news' | 'patch_notes';
  externalId: string;
  title: string;
  type: 'patch' | 'treasure' | 'news';
  excerpt?: string | null;
  publishedAt: number;
  baseline?: boolean;
}): Promise<void> {
  const url =
    input.sourceKey === 'patch_notes'
      ? `https://www.dota2.com/patches/${input.externalId}`
      : `https://store.steampowered.com/news/externalpost/steam_community_announcements/${input.externalId}`;
  await sql(
    `INSERT INTO dota_update_items (source_key, external_id, title, source_url, published_at, detected_at, is_baseline, excerpt, event_type)
     VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?7, ?8)`,
    input.sourceKey,
    input.externalId,
    input.title,
    url,
    input.publishedAt,
    input.baseline === true ? 1 : 0,
    input.excerpt ?? null,
    input.type
  );
  if (input.sourceKey === 'patch_notes') {
    await sql(
      `INSERT INTO dota_patch_analyses (source_key, external_id, parse_status, facts_json, parsed_at)
       VALUES ('patch_notes', ?1, 'complete', ?2, ?3)`,
      input.externalId,
      JSON.stringify([
        { id: 'a', entityType: 'hero', entityName: 'Axe', section: 'hero', change: 'x' },
        { id: 'b', entityType: 'hero', entityName: 'Pudge', section: 'ability', change: 'y' },
        { id: 'c', entityType: 'item', entityName: 'Blink Dagger', section: 'item', change: 'z' },
        { id: 'd', entityType: 'hero', entityName: 'Pudge', section: 'talent', change: 'w' }
      ]),
      input.publishedAt
    );
  }
}

async function seedEvents(): Promise<void> {
  await seedItem({
    sourceKey: 'patch_notes',
    externalId: '7.41',
    title: 'Dota 7.41',
    type: 'patch',
    publishedAt: START - 1000
  });
  await seedItem({
    sourceKey: 'steam_news',
    externalId: '1001',
    title: 'Treasure of the Beacon',
    type: 'treasure',
    excerpt: 'Collect the new sets. More inside.',
    publishedAt: START - 2000
  });
  await seedItem({
    sourceKey: 'steam_news',
    externalId: '1002',
    title: 'Qualifiers update',
    type: 'news',
    excerpt: 'Teams are set.',
    publishedAt: START - 3000
  });
  await seedItem({
    sourceKey: 'steam_news',
    externalId: '0999',
    title: 'Old',
    type: 'news',
    publishedAt: START - 9000,
    baseline: true
  });
}

const get = async (path: string) => api.request(`/api/v1/sources/events${path}`);
const post = async (id: string, action: string) =>
  api.request(`/api/v1/sources/events/${encodeURIComponent(id)}/${action}`, { method: 'POST' });

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * DAY });
  api = createApi({ clock: fakeClock() });
  await seedEvents();
});

describe('GET /api/v1/sources/events', () => {
  it('lists real events newest first with type, summary, facts and watch hits; baseline history is not an event', async () => {
    await sql(
      "INSERT INTO dota_watches (id, entity_type, entity_name, entity_key, created_at) VALUES (?1, 'hero', 'Pudge', 'pudge', 1)",
      crypto.randomUUID()
    );
    const response = await get('');
    expect(response.status).toBe(200);
    const page = sourceEventPageSchema.parse(await response.json());
    expect(page).toMatchObject({ page: 1, totalCount: 3, nextCursor: null });
    expect(page.items.map((item) => item.id)).toEqual([PATCH, TREASURE, NEWS]);
    const [patch, treasure] = page.items;
    expect(patch).toMatchObject({
      type: 'patch',
      sourceName: 'Dota 2 patch notes',
      status: 'new',
      draft: null,
      publication: null,
      summary: 'Изменено героев: 2, предметов: 1.',
      facts: [
        { kind: 'hero', name: 'Axe' },
        { kind: 'hero', name: 'Pudge' },
        { kind: 'item', name: 'Blink Dagger' }
      ],
      watchHits: [{ kind: 'hero', name: 'Pudge' }]
    });
    expect(treasure).toMatchObject({ type: 'treasure', summary: 'Collect the new sets.', facts: [], watchHits: [] });
  });

  it('filters by type and status and paginates by number', async () => {
    expect(sourceEventPageSchema.parse(await (await get('?type=treasure')).json()).items.map((i) => i.id)).toEqual([
      TREASURE
    ]);
    const second = sourceEventPageSchema.parse(await (await get('?page=2&limit=2')).json());
    expect(second).toMatchObject({ page: 2, totalCount: 3 });
    expect(second.items.map((item) => item.id)).toEqual([NEWS]);
    expect(sourceEventPageSchema.parse(await (await get('?status=hidden')).json()).totalCount).toBe(0);
    expect((await get('?status=bogus')).status).toBe(400);
  });

  it('requires the owner session', async () => {
    expect((await api.request('/api/v1/sources/events', { token: null })).status).toBe(401);
  });
  it('one table: active hides the skipped ones, hidden lists only them, past lists the seeded Steam history', async () => {
    await post(NEWS, 'hide');
    const ids = async (query: string) =>
      sourceEventPageSchema.parse(await (await get(query)).json()).items.map((item) => item.id);
    expect(await ids('')).toEqual([PATCH, TREASURE]);
    expect(await ids('?view=hidden')).toEqual([NEWS]);
    const past = sourceEventPageSchema.parse(await (await get('?view=past')).json());
    expect(past.items).toMatchObject([{ id: 'steam_news:0999', isPast: true, aiRequested: false, status: 'new' }]);
  });
});

describe('POST /api/v1/sources/events/{id}/ai-draft', () => {
  const aiDraft = (target: Api, id: string) =>
    target.request(`/api/v1/sources/events/${encodeURIComponent(id)}/ai-draft`, { method: 'POST' });

  it('queues the AI writer for a past announcement, which becomes an event waiting for the bot', async () => {
    // No bot token: the consumer stops at once, so the test never reaches Telegram or Steam.
    const offline = createApi({ clock: fakeClock(), botToken: null });
    const response = await aiDraft(offline, 'steam_news:0999');
    expect(response.status).toBe(202);
    expect(sourceEventSchema.parse(await response.json())).toMatchObject({ isPast: false, aiRequested: true });
    expect(offline.aiJobs.sent).toMatchObject([{ kind: 'source_event', externalId: '0999', chatId: Number(OWNER_ID) }]);
    await offline.settle();
    expect(sourceEventPageSchema.parse(await (await get('?view=past')).json()).totalCount).toBe(0);
  });

  it('refuses a patch and a hidden event, 404s an unknown one', async () => {
    const offline = createApi({ clock: fakeClock(), botToken: null });
    const patch = await aiDraft(offline, PATCH);
    expect(patch.status).toBe(409);
    expect(await patch.json()).toMatchObject({ error: { code: 'CONFLICT', details: { reason: 'NOT_AI_SOURCE' } } });
    await post(NEWS, 'hide');
    const hidden = await aiDraft(offline, NEWS);
    expect(await hidden.json()).toMatchObject({ error: { details: { reason: 'EVENT_HIDDEN' } } });
    expect((await aiDraft(offline, 'steam_news:404')).status).toBe(404);
    expect(offline.aiJobs.sent).toHaveLength(0);
  });
});

describe('POST /api/v1/sources/events/{id}/draft', () => {
  it('creates one template draft and is idempotent however often it is called', async () => {
    const first = await post(PATCH, 'draft');
    expect(first.status).toBe(201);
    const created = (await first.json()) as { event: unknown; created: boolean };
    const event = sourceEventSchema.parse(created.event);
    expect(created.created).toBe(true);
    expect(event).toMatchObject({ status: 'drafted', draft: { title: 'Патч 7.41: что изменилось' } });

    const again = await post(PATCH, 'draft');
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ created: false, event: { draft: { postId: event.draft?.postId } } });
    expect(await count('posts')).toBe(1);

    const posts = await testDb().prepare('SELECT body FROM posts').all<{ body: string }>();
    expect(posts.results[0]?.body).toContain('— Axe (герой)');
    expect(posts.results[0]?.body).toContain('Источник: https://www.dota2.com/patches/7.41');
  });

  it('a soft-deleted draft counts as no draft: the event is new again and gets one fresh post', async () => {
    const first = (await (await post(PATCH, 'draft')).json()) as { event: { draft: { postId: string } } };
    const oldId = first.event.draft.postId;
    await sql('UPDATE posts SET deleted_at = ?1 WHERE id = ?2', START, oldId);

    const listed = sourceEventPageSchema.parse(await (await get('?type=patch')).json());
    expect(listed.items[0]).toMatchObject({ status: 'new', draft: null });

    const [a, b] = await Promise.all([post(PATCH, 'draft'), post(PATCH, 'draft')]);
    expect([a.status, b.status].every((status) => [200, 201, 409].includes(status))).toBe(true);
    const again = await post(PATCH, 'draft');
    const body = (await again.json()) as { created: boolean; event: { status: string; draft: { postId: string } } };
    expect(body.event.status).toBe('drafted');
    expect(body.event.draft.postId).not.toBe(oldId);
    expect(await count('posts')).toBe(2);
    expect(await count('posts', `id = '${oldId}' AND deleted_at IS NOT NULL`)).toBe(1);
    const link = await testDb()
      .prepare('SELECT draft_post_id FROM dota_update_items WHERE external_id = ?1')
      .bind('7.41')
      .first<{ draft_post_id: string }>();
    expect(link?.draft_post_id).toBe(body.event.draft.postId);
  });

  it('a concurrent pair leaves one draft', async () => {
    const [a, b] = await Promise.all([post(TREASURE, 'draft'), post(TREASURE, 'draft')]);
    expect([a.status, b.status].every((status) => [200, 201, 409].includes(status))).toBe(true);
    expect(await count('posts')).toBe(1);
  });

  it('refuses a hidden event, 404s an unknown one, rejects a malformed id', async () => {
    await post(NEWS, 'hide');
    const hidden = await post(NEWS, 'draft');
    expect(hidden.status).toBe(409);
    expect(await hidden.json()).toMatchObject({ error: { code: 'CONFLICT', details: { reason: 'EVENT_HIDDEN' } } });
    expect((await post('steam_news:404', 'draft')).status).toBe(404);
    expect((await post('0999', 'draft')).status).toBe(400);
    expect((await post('steam_news:0999', 'draft')).status).toBe(404);
  });
});

const newsEvent = async () => sourceEventPageSchema.parse(await (await get('?type=news')).json()).items[0];

describe('hide and unhide', () => {
  it('are idempotent and move the event to and from «hidden»', async () => {
    for (let i = 0; i < 2; i += 1) {
      const hidden = sourceEventSchema.parse(await (await post(NEWS, 'hide')).json());
      expect(hidden.status).toBe('hidden');
    }
    expect(sourceEventPageSchema.parse(await (await get('?status=hidden')).json()).items.map((i) => i.id)).toEqual([
      NEWS
    ]);
    for (let i = 0; i < 2; i += 1) {
      expect(sourceEventSchema.parse(await (await post(NEWS, 'unhide')).json()).status).toBe('new');
    }
    expect((await post('steam_news:404', 'hide')).status).toBe(404);
  });

  it('a draft that was sent shows as published with its publication status', async () => {
    const created = (await (await post(NEWS, 'draft')).json()) as { event: { draft: { postId: string } } };
    const postId = created.event.draft.postId;
    await seedDestination(api);
    const pub = await api.request(`/api/v1/posts/${postId}`);
    const body = (await pub.json()) as { revision: number };
    expect(
      (await api.request(`/api/v1/posts/${postId}/approve`, { method: 'POST', json: { revision: body.revision } }))
        .status
    ).toBe(200);
    const destinations = (await (await api.request('/api/v1/destinations')).json()) as { items: { id: string }[] };
    const publication = await api.request('/api/v1/publications', {
      method: 'POST',
      headers: { 'idempotency-key': 'src-1' },
      json: {
        postId,
        revision: body.revision + 1,
        destinationId: destinations.items[0]?.id,
        scheduledAt: new Date(START).toISOString(),
        timezone: 'UTC'
      }
    });
    expect(publication.status).toBe(202);
    expect(await newsEvent()).toMatchObject({ publication: { status: 'queued' } });
    await sql("UPDATE jobs SET status = 'succeeded'");
    expect(await newsEvent()).toMatchObject({ status: 'published', publication: { status: 'sent' } });
  });
});

describe('the Cron workflow: auto-draft and one owner notice per event', () => {
  let container: Container;

  function deps(
    overrides: Partial<Parameters<typeof processDotaUpdates>[0]> & { messenger: ReturnType<typeof fakeOwnerMessenger> }
  ) {
    const clock = fakeClock();
    const publishActions = createPublishActions(container, {
      actor: OWNER_ID,
      requestId: 'test',
      timezone: () => Promise.resolve('UTC')
    });
    const inspection: DotaPatchInspection = {
      summary: null,
      analysis: {
        status: 'complete',
        unknownNoteCount: 0,
        unresolvedEntityCount: 0,
        truncatedFactCount: 0,
        facts: [{ id: 'a', entityType: 'hero', entityName: 'Axe', section: 'hero', change: 'x' }]
      }
    };
    return {
      sync: () => Promise.resolve({ inserted: 0, fetched: 2 }),
      inspectPatch: () => Promise.resolve(inspection),
      repo: container.dotaRepository,
      posts: container.posts,
      idempotency: container.idempotency,
      actor: OWNER_ID,
      now: () => clock.now(),
      newId: () => crypto.randomUUID(),
      ownerChatId: OWNER_ID,
      readAppOrigin: () => Promise.resolve(ORIGIN),
      watchedKeys: () => container.sourceEvents.watchedKeys(),
      publishButtons: (post: { id: string; revision: number }) => publishActions.buttons(post),
      budget: { limit: 50, used: () => 0, remaining: () => 50, charge: () => {} },
      logger: createLogger(() => {}),
      ...overrides
    } satisfies Parameters<typeof processDotaUpdates>[0];
  }

  beforeEach(async () => {
    container = createContainer(
      {
        DB: testDb(),
        MEDIA_BUCKET: testMediaBucket(),
        OWNER_TELEGRAM_ID: OWNER_ID,
        TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN
      },
      { clock: fakeClock() }
    );
    await seedDestination(api, { title: 'Main channel' });
  });

  // Steam announcements go to the AI writer through the queue (owner, 21.10.2026); a patch keeps its template.
  function aiQueue(refuse = 0) {
    const jobs: AiJob[] = [];
    let refusals = refuse;
    return {
      jobs,
      enqueueAiJob: (job: AiJob) => {
        if (refusals > 0) {
          refusals -= 1;
          return Promise.reject(new Error('queue down'));
        }
        jobs.push(job);
        return Promise.resolve();
      }
    };
  }
  const requested = (jobs: AiJob[]) => jobs.map((job) => (job.kind === 'source_event' ? job.externalId : job.kind));

  it('drafts the patch once with one notice and asks the AI writer once per announcement; a rerun changes nothing', async () => {
    const messenger = fakeOwnerMessenger();
    const queue = aiQueue();
    const first = await processDotaUpdates(deps({ messenger, enqueueAiJob: queue.enqueueAiJob }));
    expect(first).toMatchObject({ draftsCreated: 1, draftAlertsSent: 1, aiDraftsRequested: 2 });
    expect(await count('posts')).toBe(1);
    expect(requested(queue.jobs)).toEqual(['1002', '1001']);
    expect(queue.jobs[0]).toMatchObject({ chatId: Number(OWNER_ID), appOrigin: ORIGIN });
    expect(messenger.sent).toHaveLength(1);
    const [patchNotice] = messenger.sent;
    expect(patchNotice?.markup?.inline_keyboard.flat().map((button) => button.text)).toEqual([
      'Опубликовать сейчас → Main channel',
      '🕒 Запланировать → Main channel',
      'Открыть в Студии'
    ]);

    const second = await processDotaUpdates(deps({ messenger, enqueueAiJob: queue.enqueueAiJob }));
    expect(second).toMatchObject({ draftsCreated: 0, draftAlertsSent: 0, aiDraftsRequested: 0 });
    expect(await count('posts')).toBe(1);
    expect(queue.jobs).toHaveLength(2);
    expect(messenger.sent).toHaveLength(1);
  });

  it('a queue refusal gives the claim back: the next tick asks again, once', async () => {
    const messenger = fakeOwnerMessenger();
    const queue = aiQueue(2);
    expect(await processDotaUpdates(deps({ messenger, enqueueAiJob: queue.enqueueAiJob }))).toMatchObject({
      aiDraftsRequested: 0
    });
    await processDotaUpdates(deps({ messenger, enqueueAiJob: queue.enqueueAiJob }));
    await processDotaUpdates(deps({ messenger, enqueueAiJob: queue.enqueueAiJob }));
    expect(requested(queue.jobs)).toEqual(['1002', '1001']);
  });

  it('a template draft made from the screen first is announced once and gets no AI request', async () => {
    await post(TREASURE, 'draft');
    const messenger = fakeOwnerMessenger();
    const queue = aiQueue();
    for (let tick = 0; tick < 3; tick += 1)
      await processDotaUpdates(deps({ messenger, enqueueAiJob: queue.enqueueAiJob }));
    expect(await count('posts')).toBe(2);
    expect(messenger.sent).toHaveLength(2);
    expect(requested(queue.jobs)).toEqual(['1002']);
  });

  it('with the source alerts preference off the patch is drafted but never announced, and not later either', async () => {
    const messenger = fakeOwnerMessenger();
    const off = {
      warningsEnabled: true,
      publicationAlerts: true,
      sourceAlerts: false,
      automationAlerts: true,
      recoveryAlerts: true,
      dotaWatchlistAlerts: true,
      scheduleNotices: true,
      sentNotices: true,
      dailyReport: false,
      dailyReportHour: 9
    };
    await processDotaUpdates(deps({ messenger, readNotificationPreferences: () => Promise.resolve(off) }));
    await processDotaUpdates(deps({ messenger }));
    expect(await count('posts')).toBe(1);
    expect(messenger.sent).toHaveLength(0);
  });

  it('a hidden event gets no draft, no notice and no AI request', async () => {
    await post(PATCH, 'hide');
    await post(TREASURE, 'hide');
    const messenger = fakeOwnerMessenger();
    const queue = aiQueue();
    await processDotaUpdates(deps({ messenger, enqueueAiJob: queue.enqueueAiJob }));
    expect(await count('posts')).toBe(0);
    expect(messenger.sent).toHaveLength(0);
    expect(requested(queue.jobs)).toEqual(['1002']);
  });

  it('stops when the invocation budget is spent, and loses nothing', async () => {
    const messenger = fakeOwnerMessenger();
    const queue = aiQueue();
    const budget = { limit: 50, used: () => 45, remaining: () => 5, charge: () => {} };
    const starved = await processDotaUpdates(deps({ messenger, budget, enqueueAiJob: queue.enqueueAiJob }));
    expect(starved).toMatchObject({ draftsCreated: 0, draftAlertsSent: 0, aiDraftsRequested: 0 });
    expect(await count('posts')).toBe(0);
    await processDotaUpdates(deps({ messenger, enqueueAiJob: queue.enqueueAiJob }));
    expect(await count('posts')).toBe(1);
    expect(queue.jobs).toHaveLength(2);
  });
});

describe('an AI draft of a Steam announcement', () => {
  const repo = () => createD1DotaWatcherRepository(testDb());
  const GENERATION = '00000000-0000-4000-8000-000000000001';
  const CHILD = '00000000-0000-4000-8000-000000000002';
  const POST = '00000000-0000-4000-8000-0000000000aa';
  const row = (externalId: string) =>
    testDb()
      .prepare(
        'SELECT is_baseline, ai_job_id, draft_post_id, owner_alert_claimed_at FROM dota_update_items WHERE external_id = ?1'
      )
      .bind(externalId)
      .first<{
        is_baseline: number;
        ai_job_id: string | null;
        draft_post_id: string | null;
        owner_alert_claimed_at: number | null;
      }>();

  it('a replay makes a past announcement an event; its approved draft becomes the event post, once', async () => {
    const job = crypto.randomUUID();
    expect(await repo().claimAiDraft({ externalId: '0999', jobId: job, replay: false, now: START })).toBe(false);
    expect(await repo().claimAiDraft({ externalId: '0999', jobId: job, replay: true, now: START })).toBe(true);
    expect(await row('0999')).toMatchObject({ is_baseline: 0, ai_job_id: job });
    await repo().setAiGeneration({ externalId: '0999', jobId: job, generationId: GENERATION });

    // The owner approved a rewrite of that draft: the chain reaches the event.
    expect(await repo().linkAiPost({ generationIds: [CHILD, GENERATION], postId: POST, now: START })).toBe('0999');
    expect(await row('0999')).toMatchObject({ draft_post_id: POST, owner_alert_claimed_at: START });
    expect(await repo().linkAiPost({ generationIds: [GENERATION], postId: POST, now: START })).toBeNull();
    // A draft that never went out (a template from an earlier detection) gives way to the approved AI post.
    const other = '00000000-0000-4000-8000-0000000000bb';
    expect(await repo().linkAiPost({ generationIds: [GENERATION], postId: other, now: START })).toBe('0999');
    expect(await row('0999')).toMatchObject({ draft_post_id: other });
  });

  it('a draft from an older job is not recorded once a replay took the event', async () => {
    const old = crypto.randomUUID();
    await repo().claimAiDraft({ externalId: '1002', jobId: old, replay: false, now: START });
    // A request still writing locks the event; once it ends (or 15 minutes pass) a replay takes it.
    expect(
      await repo().claimAiDraft({ externalId: '1002', jobId: crypto.randomUUID(), replay: true, now: START })
    ).toBe(false);
    await repo().finishAiDraft({ externalId: '1002', jobId: old });
    await repo().claimAiDraft({ externalId: '1002', jobId: crypto.randomUUID(), replay: true, now: START });
    await repo().setAiGeneration({ externalId: '1002', jobId: old, generationId: GENERATION });
    expect(await repo().linkAiPost({ generationIds: [GENERATION], postId: POST, now: START })).toBeNull();
  });

  it('a hidden announcement is never replayed', async () => {
    await post(NEWS, 'hide');
    expect(
      await repo().claimAiDraft({ externalId: '1002', jobId: crypto.randomUUID(), replay: true, now: START })
    ).toBe(false);
  });
});

describe('the Cron tick that runs the watcher', () => {
  it('stays within 50 statements and round trips with drafts, notices and buttons', async () => {
    await createD1SystemState(testDb()).rememberAppOrigin(ORIGIN, START);
    await seedDestination(api);
    const { db, meter } = meteredDb(testDb());
    const messenger = fakeOwnerMessenger();
    const tick = makeTick({
      clock: fakeClock(),
      transport: fakeTransport(SENT),
      db,
      ownerMessenger: messenger,
      scheduledTime: START + 5 * 60_000
    });
    await tick.run();
    expect(await count('posts')).toBeGreaterThanOrEqual(1);
    // Statements plus the Telegram sends plus the two feed fetches of a real sync.
    expect(meter.statements + messenger.sent.length + 2).toBeLessThanOrEqual(50);
    expect(meter.roundTrips).toBeLessThanOrEqual(50);
    // What the first slot had no budget left to announce goes out in the next slots, each within the limit.
    for (let slot = 2; slot <= 6 && messenger.sent.length < 1; slot += 1) {
      const later = meteredDb(testDb());
      const before = messenger.sent.length;
      await makeTick({
        clock: fakeClock(),
        transport: fakeTransport(SENT),
        db: later.db,
        ownerMessenger: messenger,
        scheduledTime: START + slot * 5 * 60_000
      }).run();
      expect(later.meter.statements + (messenger.sent.length - before) + 2).toBeLessThanOrEqual(50);
    }
    expect(messenger.sent).toHaveLength(1);
    expect(await count('posts')).toBe(1);
  });
});

describe("an event post's images", () => {
  // A 2×3 PNG: enough for the upload's signature and dimension checks.
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 3, 8, 2,
    0, 0, 0, 0, 0, 0, 0
  ]);
  const CDN = 'https://clan.akamai.steamstatic.com/images/3703047';

  it('attaches only Steam CDN images, once however often the job runs', async () => {
    const container = createContainer(
      { DB: testDb(), MEDIA_BUCKET: testMediaBucket(), OWNER_TELEGRAM_ID: OWNER_ID },
      { clock: fakeClock() }
    );
    const post = await seedDraftPost(api);
    const storage = container.mediaStorage;
    if (storage === undefined) throw new Error('no storage');
    const fetched: string[] = [];
    const deps = {
      repo: container.dotaRepository,
      postState: async (id: string) => {
        const state = await container.postMedia.findPostState(id);
        return state === null ? null : { revision: state.revision, mediaCount: state.media.length };
      },
      upload: (command: Parameters<typeof uploadPostMedia>[1]) =>
        uploadPostMedia({ repo: container.postMedia, storage, now: START, newId: container.newId }, command),
      fetchAnnouncement: () =>
        Promise.resolve({
          text: 'x',
          pages: [],
          images: [`${CDN}/${'a'.repeat(40)}.png`, 'https://evil.example/x.png', `${CDN}/${'b'.repeat(40)}.png`]
        }),
      fetchImpl: ((url: string) => {
        fetched.push(url);
        return Promise.resolve(new Response(png, { headers: { 'content-type': 'image/png' } }));
      }) as unknown as typeof fetch
    };
    const run = () =>
      attachSourceEventImages(
        { ...deps, upload: (command) => deps.upload({ ...command, actor: OWNER_ID }) },
        { postId: post.id, externalId: '1001' }
      );
    expect(await run()).toEqual({ attached: 2, found: 3 });
    expect(await run()).toEqual({ attached: 2, found: 3 });
    expect(fetched.every((url) => url.startsWith(CDN))).toBe(true);
    expect((await container.postMedia.findPostState(post.id))?.media).toHaveLength(2);

    // A series planned before 22.10.2026 may list a 47 MB video: it is never downloaded (photos only, owner).
    fetched.length = 0;
    const skipped: string[] = [];
    const video = `${CDN}/darkcarnival/automatons/morphling_automaton_gameplay.mp4`;
    await attachSourceEventImages(
      { ...deps, upload: (command) => deps.upload({ ...command, actor: OWNER_ID }), onSkip: (r) => skipped.push(r) },
      { postId: post.id, externalId: '1001', urls: [video] }
    );
    expect(fetched).toEqual([]);
    expect(skipped).toEqual(['NOT_AN_IMAGE']);

    // A patch gets its drawn picture instead of the announcement's images, or none when it could not be drawn.
    const patch = (picture: { bytes: Uint8Array; contentType: string } | 'failed') =>
      attachSourceEventImages(
        {
          ...deps,
          upload: (command) => deps.upload({ ...command, actor: OWNER_ID }),
          patchPicture: () => Promise.resolve(picture)
        },
        { postId: post.id, externalId: '1001' }
      );
    expect(await patch('failed')).toEqual({ attached: 0, found: 0, pictureFailed: true });
    expect(await patch({ bytes: png, contentType: 'image/png' })).toEqual({ attached: 1, found: 1 });
    expect(fetched).toEqual([]);
    expect((await container.postMedia.findPostState(post.id))?.media).toHaveLength(3);
  });
});

describe('an AI draft approved in the studio', () => {
  it('shows the bot draft and makes one post, linked to the event, with its images queued', async () => {
    const container = createContainer(
      { DB: testDb(), MEDIA_BUCKET: testMediaBucket(), OWNER_TELEGRAM_ID: OWNER_ID },
      { clock: fakeClock() }
    );
    const draftId = crypto.randomUUID();
    await container.aiWriter.createGeneration({
      id: draftId,
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
      generationId: draftId,
      parentId: null,
      provenance: 'AI_DRAFT',
      text: 'Габен вернул аркану на дровку.',
      editRatio: null,
      createdAt: START
    });
    await container.aiWriter.finishGeneration({ id: draftId, now: START, status: 'ready', result: 'draft' });
    await sql("UPDATE dota_update_items SET ai_generation_id = ?1 WHERE external_id = '1001'", draftId);

    // The images job is checked as sent; running it would reach Steam.
    api.aiJobs.deliver = () => Promise.resolve();
    const shown = sourceEventAiDraftSchema.parse(
      await (await api.request(`/api/v1/sources/events/${TREASURE}/ai-draft`)).json()
    );
    expect(shown).toMatchObject({
      versionId: draftId,
      status: 'ready',
      text: 'Габен вернул аркану на дровку.',
      postId: null
    });

    const approve = () =>
      api.request(`/api/v1/sources/events/${TREASURE}/ai-draft/approve`, {
        method: 'POST',
        json: { versionId: draftId }
      });
    const first = await approve();
    expect(first.status).toBe(201);
    const { postId } = approveSourceEventAiDraftResponseSchema.parse(await first.json());
    const again = await approve();
    expect(again.status).toBe(200);
    expect(approveSourceEventAiDraftResponseSchema.parse(await again.json()).postId).toBe(postId);
    expect(await count('posts')).toBe(1);
    expect(
      sourceEventSchema.parse(
        await (
          await get('')
        )
          .json()
          .then((page) => sourceEventPageSchema.parse(page).items.find((item) => item.id === TREASURE))
      )
    ).toMatchObject({
      status: 'drafted',
      draft: { postId }
    });
    expect(api.aiJobs.sent).toMatchObject([{ kind: 'source_media', postId, externalId: '1001' }]);

    const foreign = await api.request(`/api/v1/sources/events/${TREASURE}/ai-draft/approve`, {
      method: 'POST',
      json: { versionId: crypto.randomUUID() }
    });
    expect(foreign.status).toBe(404);
  });
});
