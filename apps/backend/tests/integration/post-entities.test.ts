import {
  type ApiErrorDto,
  apiErrorSchema,
  type PostDto,
  type PostEntity,
  postPageSchema,
  postSchema,
  POST_ENTITIES_JSON_MAX
} from '@alexeev/contracts';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { fakeTransport, isoAt, makeTick, SENT } from '../helpers/dispatch';
import {
  type Api,
  createApi,
  fakeClock,
  type FakeClock,
  OWNER_TOKEN,
  resetDb,
  seedSession,
  START
} from '../helpers/harness';
import { seedDestination, seedPublication } from '../helpers/publishing';

let api: Api;
let clock: FakeClock;
let keyCounter = 0;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 7 * 24 * 60 * 60 * 1000 });
  keyCounter = 0;
  clock = fakeClock();
  api = createApi({ clock });
});

const nextKey = () => `entities-${++keyCounter}`;

const createRaw = (json: unknown, key = nextKey()) =>
  api.request('/api/v1/posts', { method: 'POST', headers: { 'idempotency-key': key }, json });

async function create(json: unknown, key = nextKey()): Promise<PostDto> {
  const response = await createRaw(json, key);
  expect(response.status).toBe(201);
  return postSchema.parse(await response.json());
}

const patch = (id: string, json: unknown) => api.request(`/api/v1/posts/${id}`, { method: 'PATCH', json });
const approve = (id: string, revision: number) =>
  api.request(`/api/v1/posts/${id}/approve`, { method: 'POST', json: { revision } });

async function expectError(
  response: Response,
  status: number,
  code: ApiErrorDto['error']['code'],
  details?: Record<string, string>
) {
  expect(response.status).toBe(status);
  const body = apiErrorSchema.parse(await response.json());
  expect(body.error.code).toBe(code);
  if (details !== undefined) expect(body.error.details).toMatchObject(details);
}

async function count(table: string, where = '1 = 1'): Promise<number> {
  const row = await testDb().prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).first<{ n: number }>();
  return row?.n ?? -1;
}

async function revisionEntities(postId: string): Promise<{ revision: number; entities: PostEntity[] }[]> {
  const { results } = await testDb()
    .prepare('SELECT revision, entities FROM post_revisions WHERE post_id = ?1 ORDER BY revision')
    .bind(postId)
    .all<{ revision: number; entities: string }>();
  return results.map((row) => ({ revision: row.revision, entities: JSON.parse(row.entities) as PostEntity[] }));
}

// "😀" is two UTF-16 units: in "a😀b 😀 link" the first emoji is at 1-2, the second at 5-6, "link" at 8-11.
const EMOJI_BODY = 'a😀b 😀 link';
const EMOJI_ENTITIES: PostEntity[] = [
  { type: 'bold', offset: 1, length: 2 },
  { type: 'italic', offset: 3, length: 2 },
  { type: 'spoiler', offset: 5, length: 2 },
  { type: 'text_link', offset: 8, length: 4, url: 'https://example.com/a?b=1' }
];

describe('entities on create', () => {
  it('stores and returns the entities with emoji offsets, on the post and on revision 0', async () => {
    const post = await create({ title: 'Emoji', body: EMOJI_BODY, entities: EMOJI_ENTITIES });

    expect(post.entities).toEqual(EMOJI_ENTITIES);
    const fetched = postSchema.parse(await (await api.request(`/api/v1/posts/${post.id}`)).json());
    expect(fetched.entities).toEqual(EMOJI_ENTITIES);
    expect(await revisionEntities(post.id)).toEqual([{ revision: 0, entities: EMOJI_ENTITIES }]);
    const page = postPageSchema.parse(await (await api.request('/api/v1/posts')).json());
    expect(page.items[0]?.entities).toEqual(EMOJI_ENTITIES);
  });

  it('defaults to no entities and stores the normal form of what it is given', async () => {
    expect((await create({ title: 'Plain', body: 'text' })).entities).toEqual([]);

    const post = await create({
      title: 'Messy',
      body: 'abcdefghij',
      entities: [
        { type: 'italic', offset: 5, length: 2 },
        { type: 'bold', offset: 3, length: 2 },
        { type: 'bold', offset: 0, length: 3 },
        { type: 'bold', offset: 1, length: 1 }
      ]
    });

    expect(post.entities).toEqual([
      { type: 'bold', offset: 0, length: 5 },
      { type: 'italic', offset: 5, length: 2 }
    ]);
    expect(await revisionEntities(post.id)).toEqual([{ revision: 0, entities: post.entities }]);
  });

  it('replays the original response with entities for the same key, and refuses the key with other entities', async () => {
    const input = { title: 'Replay', body: EMOJI_BODY, entities: EMOJI_ENTITIES };
    const first = await create(input, 'entities-replay');

    const replay = await createRaw(input, 'entities-replay');
    expect(replay.status).toBe(201);
    expect(postSchema.parse(await replay.json())).toEqual(first);

    const other = await createRaw({ ...input, entities: [EMOJI_ENTITIES[0]] }, 'entities-replay');
    await expectError(other, 409, 'CONFLICT', { reason: 'IDEMPOTENCY_KEY_REUSED' });
    expect(await count('posts')).toBe(1);
  });

  it('replays a response stored before entities existed, as a post without entities', async () => {
    const legacy = {
      id: crypto.randomUUID(),
      title: 'Legacy',
      body: 'Old',
      revision: 0,
      status: 'draft',
      archivedAt: null,
      autoDeleteAt: null,
      createdAt: isoAt(START),
      updatedAt: isoAt(START)
    };
    const { sha256Hex } = await import('../../src/platform/security/sha256');
    const hash = await sha256Hex(JSON.stringify({ title: 'Legacy', body: 'Old' }));
    await testDb()
      .prepare(
        `INSERT INTO idempotency_keys (scope, key, request_hash, status, response_status, response_body, created_at, expires_at)
         VALUES ('4242', 'legacy', ?1, 'completed', 201, ?2, ?3, ?4)`
      )
      .bind(hash, JSON.stringify(legacy), START, START + 60_000)
      .run();

    const replay = await createRaw({ title: 'Legacy', body: 'Old' }, 'legacy');

    expect(replay.status).toBe(201);
    expect(postSchema.parse(await replay.json())).toMatchObject({ id: legacy.id, entities: [] });
  });

  it.each([
    ['a range past the end', { type: 'bold', offset: 2, length: 5 }, 'ENTITIES_OUT_OF_RANGE'],
    ['a start inside an emoji', { type: 'bold', offset: 2, length: 1 }, 'ENTITIES_SPLIT_SURROGATE'],
    ['an end inside an emoji', { type: 'bold', offset: 0, length: 2 }, 'ENTITIES_SPLIT_SURROGATE']
  ])('answers 400 with a reason for %s and writes nothing', async (_name, entity, reason) => {
    const response = await createRaw({ title: 'Bad', body: 'a😀b', entities: [entity] }, 'bad-entities');

    await expectError(response, 400, 'VALIDATION_ERROR', { reason });
    expect(await count('posts')).toBe(0);
    // A rejected payload does not burn the key.
    expect(await count('idempotency_keys')).toBe(0);
  });

  it('answers 400 for a style that partially overlaps code or a link, and for code inside a link', async () => {
    const overlap = await createRaw({
      title: 'T',
      body: 'abcdef',
      entities: [
        { type: 'bold', offset: 0, length: 4 },
        { type: 'code', offset: 2, length: 4 }
      ]
    });
    await expectError(overlap, 400, 'VALIDATION_ERROR', { reason: 'ENTITIES_INVALID_NESTING' });

    const codeInLink = await createRaw({
      title: 'T',
      body: 'abcdef',
      entities: [
        { type: 'text_link', offset: 0, length: 6, url: 'https://example.com/' },
        { type: 'code', offset: 1, length: 2 }
      ]
    });
    await expectError(codeInLink, 400, 'VALIDATION_ERROR', { reason: 'ENTITIES_INVALID_NESTING' });
  });

  it('answers 400 for an unknown type, an unsafe link, 101 entities and an oversized list', async () => {
    const body = 'x'.repeat(300);
    const link = (url: string): PostEntity => ({ type: 'text_link', offset: 0, length: 1, url });
    const cases: [string, unknown, Record<string, string>?][] = [
      ['an unknown type', [{ type: 'mention', offset: 0, length: 1 }]],
      ['a javascript link', [link('javascript:alert(1)')]],
      ['a link with a quote', [link('https://example.com/"x')]],
      ['a link over 2048 characters', [link(`https://example.com/${'a'.repeat(2048)}`)]],
      ['101 entities', Array.from({ length: 101 }, (_, i) => ({ type: 'bold', offset: i * 2, length: 1 }))],
      [
        'a list over the stored size cap',
        Array.from({ length: 9 }, (_, i) => ({ ...link(`https://example.com/${'a'.repeat(2000)}`), offset: i * 2 })),
        { reason: 'ENTITIES_TOO_LARGE' }
      ]
    ];
    for (const [, entities, details] of cases) {
      const response = await createRaw({ title: 'T', body, entities });
      await expectError(response, 400, 'VALIDATION_ERROR', details);
    }
    expect(await count('posts')).toBe(0);
  });
});

describe('partially overlapping free styles', () => {
  it('are stored split into nested pieces: bold 0-4 with italic 2-6', async () => {
    const response = await createRaw({
      title: 'Styles',
      body: 'abcdef',
      entities: [
        { type: 'bold', offset: 0, length: 4 },
        { type: 'italic', offset: 2, length: 4 }
      ]
    });

    expect(response.status).toBe(201);
    const post = postSchema.parse(await response.json());
    const split: PostEntity[] = [
      { type: 'bold', offset: 0, length: 4 },
      { type: 'italic', offset: 2, length: 2 },
      { type: 'italic', offset: 4, length: 2 }
    ];
    expect(post.entities).toEqual(split);
    expect(await revisionEntities(post.id)).toEqual([{ revision: 0, entities: split }]);
  });
});

describe('entities on update', () => {
  it('answers 400 ENTITIES_REQUIRED for a new body without entities and keeps the post as it was', async () => {
    const post = await create({ title: 'T', body: EMOJI_BODY, entities: EMOJI_ENTITIES });

    const response = await patch(post.id, { revision: 0, body: 'completely different text' });

    await expectError(response, 400, 'VALIDATION_ERROR', { reason: 'ENTITIES_REQUIRED' });
    const after = postSchema.parse(await (await api.request(`/api/v1/posts/${post.id}`)).json());
    expect(after).toMatchObject({ revision: 0, body: EMOJI_BODY, entities: EMOJI_ENTITIES });
    expect(await count('post_revisions')).toBe(1);
  });

  it('replaces body and entities together and snapshots every revision with its own entities', async () => {
    const post = await create({ title: 'T', body: EMOJI_BODY, entities: EMOJI_ENTITIES });

    const response = await patch(post.id, {
      revision: 0,
      body: '😀 new',
      entities: [{ type: 'spoiler', offset: 0, length: 2 }]
    });

    expect(response.status).toBe(200);
    expect(postSchema.parse(await response.json())).toMatchObject({
      revision: 1,
      body: '😀 new',
      entities: [{ type: 'spoiler', offset: 0, length: 2 }]
    });
    expect(await revisionEntities(post.id)).toEqual([
      { revision: 0, entities: EMOJI_ENTITIES },
      { revision: 1, entities: [{ type: 'spoiler', offset: 0, length: 2 }] }
    ]);
    const audit = await testDb()
      .prepare("SELECT details FROM audit_log WHERE action = 'post.update'")
      .first<{ details: string }>();
    expect(audit?.details).toBe('{"revision":1,"fields":["body","entities"]}');
  });

  it('keeps the entities on a title-only edit and carries them into the new revision', async () => {
    const post = await create({ title: 'T', body: EMOJI_BODY, entities: EMOJI_ENTITIES });

    const response = await patch(post.id, { revision: 0, title: 'Renamed' });

    expect(postSchema.parse(await response.json())).toMatchObject({ title: 'Renamed', entities: EMOJI_ENTITIES });
    expect((await revisionEntities(post.id))[1]).toEqual({ revision: 1, entities: EMOJI_ENTITIES });
  });

  it('accepts entities alone against the stored body, and refuses ones that do not fit it', async () => {
    const post = await create({ title: 'T', body: EMOJI_BODY });

    const ok = await patch(post.id, { revision: 0, entities: EMOJI_ENTITIES });
    expect(postSchema.parse(await ok.json())).toMatchObject({
      revision: 1,
      body: EMOJI_BODY,
      entities: EMOJI_ENTITIES
    });

    const beyond = await patch(post.id, { revision: 1, entities: [{ type: 'bold', offset: 0, length: 500 }] });
    await expectError(beyond, 400, 'VALIDATION_ERROR', { reason: 'ENTITIES_OUT_OF_RANGE' });
    const split = await patch(post.id, { revision: 1, entities: [{ type: 'bold', offset: 2, length: 2 }] });
    await expectError(split, 400, 'VALIDATION_ERROR', { reason: 'ENTITIES_SPLIT_SURROGATE' });
    expect(await count('post_revisions', `post_id = '${post.id}'`)).toBe(2);
  });

  it('answers 409 before judging entities when the revision is stale or the post is approved', async () => {
    const post = await create({ title: 'T', body: 'abc' });
    const fits = [{ type: 'bold', offset: 0, length: 1 }];
    await patch(post.id, { revision: 0, title: 'T2' });

    await expectError(await patch(post.id, { revision: 0, entities: fits }), 409, 'CONFLICT', {
      reason: 'STALE_REVISION'
    });
    const approved = await approve(post.id, 1);
    expect(approved.status).toBe(200);
    await expectError(await patch(post.id, { revision: 2, entities: fits }), 409, 'CONFLICT', {
      reason: 'NOT_EDITABLE'
    });
    await expectError(await patch(crypto.randomUUID(), { revision: 0, entities: fits }), 404, 'NOT_FOUND');
  });

  it('lets exactly one of two concurrent formatting edits of the same revision win', async () => {
    const post = await create({ title: 'T', body: 'abcdef' });

    const responses = await Promise.all([
      patch(post.id, { revision: 0, entities: [{ type: 'bold', offset: 0, length: 3 }] }),
      patch(post.id, { revision: 0, entities: [{ type: 'italic', offset: 0, length: 3 }] })
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await count('post_revisions', `post_id = '${post.id}'`)).toBe(2);
  });
});

describe('approval freezes the entities', () => {
  it('snapshots them on the approved revision, which no later edit can change', async () => {
    const post = await create({ title: 'T', body: EMOJI_BODY, entities: EMOJI_ENTITIES });

    const approved = postSchema.parse(await (await approve(post.id, 0)).json());

    expect(approved).toMatchObject({ status: 'approved', revision: 1, entities: EMOJI_ENTITIES });
    expect(await revisionEntities(post.id)).toEqual([
      { revision: 0, entities: EMOJI_ENTITIES },
      { revision: 1, entities: EMOJI_ENTITIES }
    ]);
    await expectError(await patch(post.id, { revision: 1, body: 'x', entities: [] }), 409, 'CONFLICT', {
      reason: 'NOT_EDITABLE'
    });
    expect((await revisionEntities(post.id))[1]?.entities).toEqual(EMOJI_ENTITIES);
  });
});

describe('sending the approved revision', () => {
  async function schedule(post: PostDto): Promise<string> {
    const destination = await seedDestination(api, { chatId: '-1001' });
    const publication = await seedPublication(api, {
      postId: post.id,
      revision: post.revision,
      destinationId: destination.id,
      scheduledAt: isoAt(clock.now())
    });
    return publication.id;
  }

  it('sends the title as bold and the approved revision entities, shifted past it, with emoji counted in UTF-16 units', async () => {
    const draft = await create({
      title: '🔥 Patch',
      body: `\n  ${EMOJI_BODY}  `,
      entities: shifted(EMOJI_ENTITIES, 3)
    });
    const approved = postSchema.parse(await (await approve(draft.id, 0)).json());
    await schedule(approved);
    const transport = fakeTransport(SENT);

    await makeTick({ clock, transport }).run();

    // Title "🔥 Patch" is 8 units; "\n\n" follows; the body is trimmed by 3 units on the left.
    const shift = '🔥 Patch'.length + 2;
    expect(transport.calls).toEqual([
      {
        chatId: '-1001',
        text: `🔥 Patch\n\n${EMOJI_BODY}`,
        entities: [{ type: 'bold', offset: 0, length: '🔥 Patch'.length }, ...shifted(EMOJI_ENTITIES, shift)]
      }
    ]);
  });

  it('sends a post written before entities existed exactly as before: bold title, same text', async () => {
    const approved = postSchema.parse(
      await (await approve((await create({ title: 'Old', body: 'Plain body' })).id, 0)).json()
    );
    await testDb().prepare("UPDATE posts SET entities = '[]'").run();
    await schedule(approved);
    const transport = fakeTransport(SENT);

    await makeTick({ clock, transport }).run();

    expect(transport.calls).toEqual([
      { chatId: '-1001', text: 'Old\n\nPlain body', entities: [{ type: 'bold', offset: 0, length: 3 }] }
    ]);
  });

  it('refuses stored entities that no longer fit the body: failed CONTENT_INVALID and nothing is sent', async () => {
    const draft = await create({ title: 'T', body: 'abc', entities: [{ type: 'bold', offset: 0, length: 3 }] });
    const approved = postSchema.parse(await (await approve(draft.id, 0)).json());
    const publicationId = await schedule(approved);
    await testDb()
      .prepare(
        'UPDATE post_revisions SET entities = \'[{"type":"bold","offset":0,"length":99}]\' WHERE post_id = ?1 AND revision = 1'
      )
      .bind(draft.id)
      .run();
    const transport = fakeTransport(SENT);

    await makeTick({ clock, transport }).run();

    expect(transport.calls).toHaveLength(0);
    const job = await testDb()
      .prepare('SELECT status, send_started_at FROM jobs WHERE publication_id = ?1')
      .bind(publicationId)
      .first();
    expect(job).toEqual({ status: 'failed', send_started_at: null });
    expect(await count('incidents', "code = 'CONTENT_INVALID'")).toBe(1);
  });
});

function shifted(entities: PostEntity[], by: number): PostEntity[] {
  return entities.map((entity) => ({ ...entity, offset: entity.offset + by }));
}

// Entities with no merge: a gap of one character between neighbours.
function maxEntities(): PostEntity[] {
  const make = (urlLength: number): PostEntity[] =>
    Array.from({ length: 100 }, (_, i) => ({
      type: 'text_link' as const,
      offset: i * 2,
      length: 1,
      url: `https://e.co/${'a'.repeat(urlLength - 'https://e.co/'.length)}`
    }));
  let urlLength = 14;
  while (JSON.stringify(make(urlLength + 1)).length <= POST_ENTITIES_JSON_MAX) urlLength += 1;
  return make(urlLength);
}

describe('the size caps hold for a maximum post', () => {
  it('accepts, with its stored response and replay, the largest post whose every character is escaped in JSON', async () => {
    const entities = maxEntities();
    expect(JSON.stringify(entities).length).toBeGreaterThan(POST_ENTITIES_JSON_MAX - 100);
    const input = { title: '"'.repeat(200), body: '"'.repeat(4096), entities };
    const first = await create(input, 'max-entities');

    const replay = await createRaw(input, 'max-entities');

    expect(replay.status).toBe(201);
    expect(postSchema.parse(await replay.json())).toEqual(first);
    const stored = await testDb()
      .prepare("SELECT length(response_body) AS n FROM idempotency_keys WHERE key = 'max-entities'")
      .first<{ n: number }>();
    // More than the old 16384 cap allowed, less than the rebuilt table's 32768.
    expect(stored?.n).toBeGreaterThan(16384);
    expect(stored?.n).toBeLessThan(32768);
  });

  it('fits the 32 KB request cap with three-byte characters in title and body', async () => {
    const input = { title: '一'.repeat(200), body: '一'.repeat(4096), entities: maxEntities() };
    expect(new TextEncoder().encode(JSON.stringify(input)).length).toBeLessThan(32 * 1024);

    const response = await createRaw(input);

    expect(response.status).toBe(201);
  });
});

describe('migration 0011 on a database with existing rows', () => {
  const statementsOf = (prefix: string) => {
    const migration = env.TEST_MIGRATIONS.find((entry) => entry.name.startsWith(prefix));
    const withoutComments = (query: string) =>
      query
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim();
    return (migration?.queries ?? []).map(withoutComments).filter((query) => query !== '');
  };

  // The database as released before this migration: no entities columns, the idempotency table of 0001.
  async function downgrade(): Promise<void> {
    const db = testDb();
    const original = statementsOf('0001_').filter((query) => /idempotency_keys/.test(query));
    expect(original).toHaveLength(2);
    await db.batch([
      db.prepare('ALTER TABLE posts DROP COLUMN entities'),
      db.prepare('ALTER TABLE post_revisions DROP COLUMN entities'),
      db.prepare('DROP TABLE idempotency_keys'),
      ...original.map((query) => db.prepare(query))
    ]);
  }

  it('gives existing posts and revisions an empty list, keeps idempotency rows and widens their response cap', async () => {
    const db = testDb();
    await downgrade();
    await db.batch([
      db
        .prepare(
          `INSERT INTO posts (id, title, body, status, revision, created_at, updated_at)
           VALUES ('00000000-0000-4000-8000-000000000001', 'Legacy', 'Old body', 'approved', 1, ?1, ?1)`
        )
        .bind(START),
      db
        .prepare(
          `INSERT INTO post_revisions (post_id, revision, title, body, status, created_at)
           VALUES ('00000000-0000-4000-8000-000000000001', 1, 'Legacy', 'Old body', 'approved', ?1)`
        )
        .bind(START),
      db
        .prepare(
          `INSERT INTO idempotency_keys (scope, key, request_hash, status, response_status, response_body, created_at, expires_at)
           VALUES ('4242', 'kept', ?1, 'completed', 201, '{"kept":true}', ?2, ?3)`
        )
        .bind('a'.repeat(64), START, START + 60_000)
    ]);

    await db.batch(statementsOf('0011_').map((query) => db.prepare(query)));

    const post = await db
      .prepare("SELECT entities FROM posts WHERE id = '00000000-0000-4000-8000-000000000001'")
      .first();
    const revision = await db.prepare('SELECT entities FROM post_revisions WHERE revision = 1').first();
    expect(post).toEqual({ entities: '[]' });
    expect(revision).toEqual({ entities: '[]' });
    const dto = postSchema.parse(
      await (await api.request('/api/v1/posts/00000000-0000-4000-8000-000000000001')).json()
    );
    expect(dto).toMatchObject({ title: 'Legacy', body: 'Old body', entities: [] });
    expect(await db.prepare("SELECT response_body FROM idempotency_keys WHERE key = 'kept'").first()).toEqual({
      response_body: '{"kept":true}'
    });

    const insertResponse = (length: number) =>
      db
        .prepare(
          `INSERT INTO idempotency_keys (scope, key, request_hash, status, response_status, response_body, created_at, expires_at)
           VALUES ('4242', ?1, ?2, 'completed', 201, ?3, ?4, ?5)`
        )
        .bind(`size-${length}`, 'b'.repeat(64), 'x'.repeat(length), START, START + 60_000)
        .run();
    await expect(insertResponse(32768)).resolves.toBeDefined();
    await expect(insertResponse(32769)).rejects.toThrow();
    expect(
      await db.prepare("SELECT 1 AS one FROM sqlite_master WHERE name = 'idempotency_keys_expires_idx'").first()
    ).toEqual({
      one: 1
    });
  });

  it('refuses a list that is not JSON, not an array, or over the cap', async () => {
    const insert = (entities: string) =>
      testDb()
        .prepare(
          `INSERT INTO posts (id, title, body, entities, status, revision, created_at, updated_at)
           VALUES (?1, 'T', '', ?2, 'draft', 0, ?3, ?3)`
        )
        .bind(crypto.randomUUID(), entities, START)
        .run();

    await expect(insert('[]')).resolves.toBeDefined();
    await expect(insert('not json')).rejects.toThrow();
    await expect(insert('{}')).rejects.toThrow();
    await expect(insert(`[${'1,'.repeat(9000)}1]`)).rejects.toThrow();
  });
});
