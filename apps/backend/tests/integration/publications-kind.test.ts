import {
  type PublicationKind,
  listPublicationsQuerySchema,
  publicationPageSchema,
  publicationSchema
} from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { type Api, createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { seedApprovedPost, seedDestination } from '../helpers/publishing';

// The «Тип» of a publication is derived in SQL (first match wins: rubric, news, series, poll, else post), and the
// list filter uses the same expression, so a filtered page holds only that type and pages through it whole.

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const iso = (ms: number) => new Date(ms).toISOString();

let api: Api;
let destinationId: string;
let keyCounter = 0;
let slotCounter = 0;
const idOf: Record<string, string> = {};

async function publish(label: string, minutes: number): Promise<string> {
  const post = await seedApprovedPost(api, label);
  const response = await api.request('/api/v1/publications', {
    method: 'POST',
    headers: { 'idempotency-key': `kind-${++keyCounter}` },
    json: {
      postId: post.id,
      revision: post.revision,
      destinationId,
      scheduledAt: iso(START + minutes * MINUTE),
      timezone: 'Europe/Moscow'
    }
  });
  expect(response.status).toBe(202);
  const id = ((await response.json()) as { id: string }).id;
  idOf[label] = id;
  return id;
}

async function markRubric(publicationId: string, status = 'sent') {
  slotCounter += 1;
  await testDb()
    .prepare(
      `INSERT INTO rubric_slots (id, msk_day, slot_at, kind, rubric_key, candidates_json, status, build_at,
         next_action_at, deadline_at, weight, interactive, family, dedupe_key, reason_json, publication_id,
         created_at, updated_at)
       VALUES (?1, '2026-10-07', ?2, 'pool', 'on_lane', '["on_lane"]', ?3, 0, 0, 0, 'V', 0, 'f', ?4, '{}', ?5, 0, 0)`
    )
    .bind(crypto.randomUUID(), START + slotCounter * DAY, status, `dedupe-${slotCounter}`, publicationId)
    .run();
}

const markNews = (publicationId: string) =>
  testDb()
    .prepare(
      "UPDATE audit_log SET actor_telegram_id = 'autopublish' WHERE entity_id = ?1 AND action = 'publication.create'"
    )
    .bind(publicationId)
    .run();

async function list(query: string) {
  const response = await api.request(`/api/v1/publications?${query}`);
  expect(response.status).toBe(200);
  return publicationPageSchema.parse(await response.json());
}

beforeEach(async () => {
  await resetDb();
  await testDb().prepare('DELETE FROM rubric_slots').run();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * DAY });
  keyCounter = 0;
  slotCounter = 0;
  api = createApi({ clock: fakeClock() });
  destinationId = (await seedDestination(api)).id;

  await publish('plain', 1);
  await publish('rubric', 2);
  await markRubric(idOf['rubric'] as string);
  await publish('rubric-and-news', 3);
  await markRubric(idOf['rubric-and-news'] as string);
  await markNews(idOf['rubric-and-news'] as string);
  await publish('news', 4);
  await markNews(idOf['news'] as string);
  await publish('poll', 5);
  await testDb()
    .prepare("UPDATE post_revisions SET kind = 'poll' WHERE post_id = (SELECT post_id FROM publications WHERE id = ?1)")
    .bind(idOf['poll'])
    .run();
  const first = await seedApprovedPost(api, 'series-1');
  const second = await seedApprovedPost(api, 'series-2');
  const series = await api.request('/api/v1/publications/series', {
    method: 'POST',
    headers: { 'idempotency-key': 'kind-series' },
    json: {
      items: [
        { postId: first.id, revision: first.revision },
        { postId: second.id, revision: second.revision }
      ],
      destinationId,
      scheduledAt: iso(START + 6 * MINUTE),
      timezone: 'Europe/Moscow',
      intervalMinutes: 5
    }
  });
  expect(series.status).toBe(202);
  const members = ((await series.json()) as { publications: { id: string }[] }).publications;
  idOf['series-1'] = members[0]?.id as string;
  idOf['series-2'] = members[1]?.id as string;
});

describe('publication kind', () => {
  it('derives each kind, with the rubric before news and the series before the poll', async () => {
    const page = await list('limit=50');
    const kinds = Object.fromEntries(page.items.map((item) => [item.id, item.kind]));
    expect(kinds[idOf['plain'] as string]).toBe('post');
    expect(kinds[idOf['rubric'] as string]).toBe('rubric');
    expect(kinds[idOf['rubric-and-news'] as string]).toBe('rubric');
    expect(kinds[idOf['news'] as string]).toBe('news');
    expect(kinds[idOf['poll'] as string]).toBe('poll');
    expect(kinds[idOf['series-1'] as string]).toBe('series');
    expect(kinds[idOf['series-2'] as string]).toBe('series');
  });

  it('a superseded slot no longer makes its publication a rubric one', async () => {
    await testDb().prepare("UPDATE rubric_slots SET status = 'superseded'").run();
    const page = await list('limit=50');
    expect(page.items.find((item) => item.id === idOf['rubric'])?.kind).toBe('post');
  });

  it('the single publication carries its kind too', async () => {
    const response = await api.request(`/api/v1/publications/${idOf['news']}`);
    expect(publicationSchema.parse(await response.json()).kind).toBe('news');
  });

  const expected: Record<PublicationKind, string[]> = {
    post: ['plain'],
    rubric: ['rubric', 'rubric-and-news'],
    news: ['news'],
    poll: ['poll'],
    series: ['series-1', 'series-2']
  };

  for (const [kind, labels] of Object.entries(expected) as [PublicationKind, string[]][]) {
    it(`kind=${kind} returns only those, with matching counts`, async () => {
      const page = await list(`kind=${kind}&limit=50`);
      expect(page.items.map((item) => item.id).sort()).toEqual(labels.map((label) => idOf[label]).sort());
      expect(page.items.every((item) => item.kind === kind)).toBe(true);
      expect(page.totalCount).toBe(labels.length);
      expect(Object.values(page.statusCounts).reduce((sum, n) => sum + n, 0)).toBe(labels.length);
    });
  }

  it('pages through a filtered list with a cursor and with page numbers, only that kind and no repeats', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await list(`kind=rubric&limit=1${cursor === null ? '' : `&cursor=${cursor}`}`);
      expect(page.items.every((item) => item.kind === 'rubric')).toBe(true);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor !== null);
    expect(seen.sort()).toEqual([idOf['rubric'], idOf['rubric-and-news']].sort());

    const second = await list('kind=series&limit=1&page=2');
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.kind).toBe('series');
    expect(second.totalCount).toBe(2);
  });

  it('combines with the status filter', async () => {
    const id = idOf['rubric'] as string;
    await testDb().prepare("UPDATE jobs SET status = 'succeeded' WHERE publication_id = ?1").bind(id).run();
    const sent = await list('kind=rubric&status=sent');
    expect(sent.items.map((item) => item.id)).toEqual([id]);
    expect(sent.totalCount).toBe(1);
  });

  it('refuses an unknown kind', async () => {
    expect((await api.request('/api/v1/publications?kind=story')).status).toBe(400);
  });
});

describe('listPublicationsQuerySchema kind', () => {
  it('accepts each kind and leaves it off by default', () => {
    for (const kind of ['rubric', 'news', 'post', 'poll', 'series']) {
      expect(listPublicationsQuerySchema.parse({ kind }).kind).toBe(kind);
    }
    expect(listPublicationsQuerySchema.parse({}).kind).toBeUndefined();
    expect(listPublicationsQuerySchema.safeParse({ kind: 'story' }).success).toBe(false);
  });
});
