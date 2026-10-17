import { sourceEventPageSchema, sourceEventSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPublishActions } from '../../src/app/bot/publish-actions';
import { createContainer, type Container } from '../../src/app/container';
import { processDotaUpdates } from '../../src/app/workflows/process-dota-updates';
import type { DotaPatchInspection } from '../../src/modules/dota';
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
import { count, seedDestination } from '../helpers/publishing';

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

  it('drafts each new event once and sends one notice with the publish keyboard; a rerun changes nothing', async () => {
    const messenger = fakeOwnerMessenger();
    const first = await processDotaUpdates(deps({ messenger }));
    expect(first).toMatchObject({ draftsCreated: 2, draftAlertsSent: 2 });
    expect(await count('posts')).toBe(2);
    expect(messenger.sent).toHaveLength(2);
    const [newsNotice, treasureNotice] = messenger.sent;
    expect(newsNotice?.html).toBe('<b>Новость: Qualifiers update — черновик готов</b>');
    expect(treasureNotice?.html).toBe('<b>Сокровищница: Treasure of the Beacon — черновик готов</b>');
    const labels = newsNotice?.markup?.inline_keyboard.flat().map((button) => button.text);
    expect(labels).toEqual([
      'Опубликовать сейчас → Main channel',
      '🕒 Запланировать → Main channel',
      'Открыть в Студии'
    ]);

    const second = await processDotaUpdates(deps({ messenger }));
    expect(second).toMatchObject({ draftsCreated: 1, draftAlertsSent: 1 });
    expect(await count('posts')).toBe(3);
    const third = await processDotaUpdates(deps({ messenger }));
    expect(third).toMatchObject({ draftsCreated: 0, draftAlertsSent: 0 });
    expect(await count('posts')).toBe(3);
    expect(messenger.sent).toHaveLength(3);
    expect(await count('bot_publish_actions')).toBe(3);
  });

  it('a draft made from the screen first is not duplicated by Cron and is still announced once', async () => {
    await post(TREASURE, 'draft');
    const messenger = fakeOwnerMessenger();
    for (let tick = 0; tick < 4; tick += 1) await processDotaUpdates(deps({ messenger }));
    expect(await count('posts')).toBe(3);
    expect(messenger.sent).toHaveLength(3);
  });

  it('with the source alerts preference off the events are drafted but never announced, and not later either', async () => {
    const messenger = fakeOwnerMessenger();
    const off = {
      warningsEnabled: true,
      publicationAlerts: true,
      sourceAlerts: false,
      automationAlerts: true,
      recoveryAlerts: true,
      dotaWatchlistAlerts: true,
      scheduleNotices: true,
      sentNotices: true
    };
    await processDotaUpdates(deps({ messenger, readNotificationPreferences: () => Promise.resolve(off) }));
    await processDotaUpdates(deps({ messenger }));
    expect(await count('posts')).toBe(3);
    expect(messenger.sent).toHaveLength(1);
  });

  it('a hidden event gets no draft and no notice', async () => {
    await post(PATCH, 'hide');
    await post(TREASURE, 'hide');
    const messenger = fakeOwnerMessenger();
    await processDotaUpdates(deps({ messenger }));
    expect(await count('posts')).toBe(1);
    expect(messenger.sent).toHaveLength(1);
  });

  it('stops drafting when the invocation budget is spent, and loses nothing', async () => {
    const messenger = fakeOwnerMessenger();
    const budget = { limit: 50, used: () => 45, remaining: () => 5, charge: () => {} };
    const starved = await processDotaUpdates(deps({ messenger, budget }));
    expect(starved).toMatchObject({ draftsCreated: 0, draftAlertsSent: 0 });
    expect(await count('posts')).toBe(0);
    await processDotaUpdates(deps({ messenger }));
    expect(await count('posts')).toBe(2);
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
    for (let slot = 2; slot <= 6 && messenger.sent.length < 3; slot += 1) {
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
    expect(messenger.sent).toHaveLength(3);
    expect(await count('posts')).toBe(3);
  });
});
