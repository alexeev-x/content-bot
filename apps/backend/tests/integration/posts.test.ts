import {
  apiErrorSchema,
  type ApiErrorDto,
  type PostDto,
  listPostsQuerySchema,
  postPageSchema,
  postSchema
} from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/platform/security/sha256';
import { testDb } from '../helpers/db';
import { buildPostsListSql } from '../../src/app/posts-list-query';
import { postTitleSortKey } from '../../src/modules/content';
import { type Api, createApi, fakeClock, OWNER_ID, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

let api: Api;
let keyCounter = 0;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 7 * 24 * 60 * 60 * 1000 });
  keyCounter = 0;
  api = createApi({ clock: fakeClock() });
});

const nextKey = () => `key-${++keyCounter}`;

async function create(input: { title: string; body?: string }, key = nextKey()): Promise<PostDto> {
  const response = await api.request('/api/v1/posts', {
    method: 'POST',
    headers: { 'idempotency-key': key },
    json: input
  });
  expect(response.status).toBe(201);
  return postSchema.parse(await response.json());
}

const patch = (id: string, json: unknown) => api.request(`/api/v1/posts/${id}`, { method: 'PATCH', json });
const approve = (id: string, json: unknown) => api.request(`/api/v1/posts/${id}/approve`, { method: 'POST', json });

async function expectError(
  response: Response,
  status: number,
  code: ApiErrorDto['error']['code'],
  details?: Record<string, string>
) {
  expect(response.status).toBe(status);
  const body = apiErrorSchema.parse(await response.json());
  expect(body.error.code).toBe(code);
  expect(body.error.requestId).toBe(response.headers.get('x-request-id'));
  if (details !== undefined) expect(body.error.details).toMatchObject(details);
}

async function count(table: string, where = '1 = 1'): Promise<number> {
  const row = await testDb().prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).first<{ n: number }>();
  return row?.n ?? -1;
}

describe('POST /api/v1/posts', () => {
  it('creates a draft at revision 0 with its revision and audit rows', async () => {
    const post = await create({ title: '  Patch 7.40  ', body: 'Hello' });

    expect(post).toMatchObject({ title: 'Patch 7.40', body: 'Hello', revision: 0, status: 'draft' });
    expect(post.createdAt).toBe(new Date(START).toISOString());
    expect(post.updatedAt).toBe(post.createdAt);
    expect(await count('post_revisions', `post_id = '${post.id}' AND revision = 0 AND status = 'draft'`)).toBe(1);
    const audit = await testDb()
      .prepare('SELECT actor_telegram_id, action, entity_type, entity_id, details FROM audit_log')
      .all();
    expect(audit.results).toEqual([
      {
        actor_telegram_id: OWNER_ID,
        action: 'post.create',
        entity_type: 'post',
        entity_id: post.id,
        details: '{"revision":0}'
      }
    ]);
  });

  it('defaults the body to an empty string', async () => {
    expect((await create({ title: 'Only a title' })).body).toBe('');
  });

  it('replays the original response for the same key and payload without a second post', async () => {
    const first = await create({ title: 'Same', body: 'Body' }, 'replay-key');
    // The original is edited afterwards; the replay still returns what the first call returned.
    await patch(first.id, { revision: 0, title: 'Changed' });

    const replay = await api.request('/api/v1/posts', {
      method: 'POST',
      headers: { 'idempotency-key': 'replay-key' },
      json: { title: 'Same', body: 'Body' }
    });

    expect(replay.status).toBe(201);
    expect(postSchema.parse(await replay.json())).toEqual(first);
    expect(await count('posts')).toBe(1);
    expect(await count('audit_log', "action = 'post.create'")).toBe(1);
  });

  it('answers 409 IDEMPOTENCY_KEY_REUSED when the key comes with another payload', async () => {
    await create({ title: 'First' }, 'reused-key');

    const response = await api.request('/api/v1/posts', {
      method: 'POST',
      headers: { 'idempotency-key': 'reused-key' },
      json: { title: 'Second' }
    });

    await expectError(response, 409, 'CONFLICT', { reason: 'IDEMPOTENCY_KEY_REUSED' });
    expect(await count('posts')).toBe(1);
  });

  it('answers 409 IN_FLIGHT while another request with the key is still running', async () => {
    const hash = await sha256Hex(JSON.stringify({ title: 'Slow', body: '' }));
    await testDb()
      .prepare(
        `INSERT INTO idempotency_keys (scope, key, request_hash, status, created_at, expires_at)
         VALUES (?1, 'flying', ?2, 'in_flight', ?3, ?4)`
      )
      .bind(OWNER_ID, hash, START - 1_000, START + 59_000)
      .run();

    const response = await api.request('/api/v1/posts', {
      method: 'POST',
      headers: { 'idempotency-key': 'flying' },
      json: { title: 'Slow' }
    });

    await expectError(response, 409, 'CONFLICT', { reason: 'IN_FLIGHT' });
    expect(await count('posts')).toBe(0);
  });

  it('takes over an in-flight key whose lease has expired', async () => {
    await testDb()
      .prepare(
        `INSERT INTO idempotency_keys (scope, key, request_hash, status, created_at, expires_at)
         VALUES (?1, 'abandoned', ?2, 'in_flight', ?3, ?4)`
      )
      .bind(OWNER_ID, 'f'.repeat(64), START - 120_000, START - 60_000)
      .run();

    const post = await create({ title: 'Retry' }, 'abandoned');

    expect(post.title).toBe('Retry');
  });

  it('creates exactly one post when the same key is sent twice at once', async () => {
    const send = () =>
      api.request('/api/v1/posts', {
        method: 'POST',
        headers: { 'idempotency-key': 'twin' },
        json: { title: 'Twin' }
      });

    const responses = await Promise.all([send(), send()]);

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses[0]).toBe(201);
    expect([201, 409]).toContain(statuses[1]);
    for (const response of responses.filter((r) => r.status === 409)) {
      await expectError(response, 409, 'CONFLICT', { reason: 'IN_FLIGHT' });
    }
    expect(await count('posts')).toBe(1);
    expect(await count('audit_log')).toBe(1);
  });

  it('treats a reused key after the 24 h window as new', async () => {
    const clock = fakeClock();
    api = createApi({ clock });
    const first = await create({ title: 'Old' }, 'daily');

    clock.advance(24 * 60 * 60 * 1000);
    const second = await create({ title: 'Different' }, 'daily');

    expect(second.id).not.toBe(first.id);
  });

  it('answers 400 without an Idempotency-Key and for an empty or overlong one', async () => {
    const cases: Record<string, string>[] = [{}, { 'idempotency-key': '' }, { 'idempotency-key': 'k'.repeat(256) }];
    for (const headers of cases) {
      const response = await api.request('/api/v1/posts', { method: 'POST', headers, json: { title: 'T' } });
      await expectError(response, 400, 'VALIDATION_ERROR');
    }
    const longest = await api.request('/api/v1/posts', {
      method: 'POST',
      headers: { 'idempotency-key': 'k'.repeat(255) },
      json: { title: 'T' }
    });
    expect(longest.status).toBe(201);
  });

  it.each([
    ['a blank title', { title: '   ' }],
    ['a missing title', { body: 'x' }],
    ['a title over 200 characters', { title: 't'.repeat(201) }],
    ['a body over 4096 characters', { title: 'T', body: 'b'.repeat(4097) }],
    ['an unknown field', { title: 'T', status: 'approved' }]
  ])('answers 400 for %s', async (_name, json) => {
    const response = await api.request('/api/v1/posts', {
      method: 'POST',
      headers: { 'idempotency-key': nextKey() },
      json
    });

    await expectError(response, 400, 'VALIDATION_ERROR');
    expect(await count('posts')).toBe(0);
    // A rejected payload must not burn the key.
    expect(await count('idempotency_keys')).toBe(0);
  });

  it.each([
    ['a NUL in the title', { title: '\u0000abc' }],
    ['a control character in the title', { title: 'a\u001fb' }],
    ['a NUL in the body', { title: 'T', body: 'a\u0000b' }],
    ['a control character in the body', { title: 'T', body: '\u0001'.repeat(2800) }],
    ['lone surrogates in the body', { title: 'T', body: '\ud800\ud800\ud800' }],
    ['a lone surrogate in the title', { title: 'T\udc00' }]
  ])('answers 400 for %s, writes nothing and does not claim the key', async (_name, json) => {
    const response = await api.request('/api/v1/posts', {
      method: 'POST',
      headers: { 'idempotency-key': 'text-key' },
      json
    });

    await expectError(response, 400, 'VALIDATION_ERROR');
    expect(await count('posts')).toBe(0);
    expect(await count('idempotency_keys')).toBe(0);
  });

  it('keeps tabs, line breaks and emoji in text', async () => {
    const post = await create({ title: 'Patch \u{1F525}', body: 'line 1\r\n\tline 2' });

    expect(post).toMatchObject({ title: 'Patch \u{1F525}', body: 'line 1\r\n\tline 2' });
  });

  it('stores and replays a max-size post whose every character is escaped in JSON', async () => {
    const input = { title: '"'.repeat(200), body: '\\'.repeat(2048) + '"'.repeat(2048) };
    const first = await create(input, 'max-key');

    const replay = await api.request('/api/v1/posts', {
      method: 'POST',
      headers: { 'idempotency-key': 'max-key' },
      json: input
    });

    expect(replay.status).toBe(201);
    expect(postSchema.parse(await replay.json())).toEqual(first);
    const stored = await testDb()
      .prepare("SELECT length(response_body) AS n FROM idempotency_keys WHERE key = 'max-key'")
      .first<{ n: number }>();
    expect(stored?.n).toBeGreaterThan(8000);
    expect(stored?.n).toBeLessThan(16384);
  });

  it('accepts a body of exactly 4096 characters', async () => {
    expect((await create({ title: 'T', body: 'b'.repeat(4096) })).body).toHaveLength(4096);
  });

  it('answers 400 for malformed JSON and 413 for an oversized request', async () => {
    const malformed = await api.request('/api/v1/posts', {
      method: 'POST',
      headers: { 'idempotency-key': nextKey(), 'content-type': 'application/json' },
      body: '{"title":'
    });
    await expectError(malformed, 400, 'VALIDATION_ERROR');

    const huge = await api.request('/api/v1/posts', {
      method: 'POST',
      headers: { 'idempotency-key': nextKey() },
      json: { title: 'T', body: 'x'.repeat(100_000) }
    });
    await expectError(huge, 413, 'VALIDATION_ERROR');
  });

  it('answers 401 and 403 before validating anything', async () => {
    const anonymous = await api.request('/api/v1/posts', { method: 'POST', token: null, json: {} });
    await expectError(anonymous, 401, 'UNAUTHORIZED');
    await seedSession({ token: 'stranger-token', telegramId: '777' });
    const stranger = await api.request('/api/v1/posts', { method: 'POST', token: 'stranger-token', json: {} });
    await expectError(stranger, 403, 'FORBIDDEN');
  });
});

describe('GET /api/v1/posts/:id', () => {
  it('returns the post', async () => {
    const created = await create({ title: 'Read me', body: 'Body' });

    const response = await api.request(`/api/v1/posts/${created.id}`);

    expect(response.status).toBe(200);
    expect(postSchema.parse(await response.json())).toEqual(created);
  });

  it('answers 404 for an unknown id and for a malformed one', async () => {
    await expectError(await api.request(`/api/v1/posts/${crypto.randomUUID()}`), 404, 'NOT_FOUND');
    await expectError(await api.request('/api/v1/posts/not-a-uuid'), 404, 'NOT_FOUND');
  });

  it('does not expose a post revision-history endpoint', async () => {
    const created = await create({ title: 'Internal snapshots only', body: 'Body' });
    const response = await api.request(`/api/v1/posts/${created.id}/revisions`);

    expect(response.status).toBe(404);
  });
});

describe('PATCH /api/v1/posts/:id', () => {
  it('updates fields, bumps the revision and records revision and audit rows', async () => {
    const clock = fakeClock();
    api = createApi({ clock });
    const created = await create({ title: 'Old', body: 'Old body' });
    clock.advance(5_000);

    const response = await patch(created.id, { revision: 0, title: 'New' });

    expect(response.status).toBe(200);
    const updated = postSchema.parse(await response.json());
    expect(updated).toMatchObject({ id: created.id, title: 'New', body: 'Old body', revision: 1, status: 'draft' });
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBe(new Date(START + 5_000).toISOString());

    const second = await patch(created.id, { revision: 1, body: '', entities: [] });
    expect(postSchema.parse(await second.json())).toMatchObject({ title: 'New', body: '', revision: 2 });

    const revisions = await testDb()
      .prepare('SELECT revision, title, body, status FROM post_revisions WHERE post_id = ?1 ORDER BY revision')
      .bind(created.id)
      .all();
    expect(revisions.results).toEqual([
      { revision: 0, title: 'Old', body: 'Old body', status: 'draft' },
      { revision: 1, title: 'New', body: 'Old body', status: 'draft' },
      { revision: 2, title: 'New', body: '', status: 'draft' }
    ]);
    const audit = await testDb()
      .prepare("SELECT action, details FROM audit_log WHERE action = 'post.update' ORDER BY id")
      .all();
    expect(audit.results).toEqual([
      { action: 'post.update', details: '{"revision":1,"fields":["title"]}' },
      { action: 'post.update', details: '{"revision":2,"fields":["body","entities"]}' }
    ]);
  });

  it('lets exactly one of two concurrent edits of the same revision win', async () => {
    const created = await create({ title: 'Race', body: 'x' });

    const responses = await Promise.all([
      patch(created.id, { revision: 0, title: 'Writer A' }),
      patch(created.id, { revision: 0, title: 'Writer B' })
    ]);

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 409]);
    const loser = responses.find((response) => response.status === 409) as Response;
    await expectError(loser, 409, 'CONFLICT', { reason: 'STALE_REVISION' });
    const winner = postSchema.parse(await (responses.find((r) => r.status === 200) as Response).json());
    expect(winner.revision).toBe(1);
    expect(await count('post_revisions', `post_id = '${created.id}'`)).toBe(2);
    expect(await count('audit_log', "action = 'post.update'")).toBe(1);
    const stored = await api.request(`/api/v1/posts/${created.id}`);
    expect(postSchema.parse(await stored.json())).toEqual(winner);
  });

  it('answers 409 STALE_REVISION for an old revision and writes nothing', async () => {
    const created = await create({ title: 'T' });
    await patch(created.id, { revision: 0, title: 'T2' });
    const before = [await count('post_revisions'), await count('audit_log')];

    await expectError(await patch(created.id, { revision: 0, title: 'T3' }), 409, 'CONFLICT', {
      reason: 'STALE_REVISION'
    });
    await expectError(await patch(created.id, { revision: 7, title: 'T3' }), 409, 'CONFLICT', {
      reason: 'STALE_REVISION'
    });

    expect([await count('post_revisions'), await count('audit_log')]).toEqual(before);
  });

  it('answers 409 NOT_EDITABLE for an approved post', async () => {
    const created = await create({ title: 'T', body: 'Ready' });
    const approved = postSchema.parse(await (await approve(created.id, { revision: 0 })).json());

    const response = await patch(created.id, { revision: approved.revision, title: 'Too late' });

    await expectError(response, 409, 'CONFLICT', { reason: 'NOT_EDITABLE' });
    const stored = await api.request(`/api/v1/posts/${created.id}`);
    expect(postSchema.parse(await stored.json()).title).toBe('T');
  });

  it('answers 404 for an unknown or malformed id', async () => {
    await expectError(await patch(crypto.randomUUID(), { revision: 0, title: 'T' }), 404, 'NOT_FOUND');
    await expectError(await patch('not-a-uuid', { revision: 0, title: 'T' }), 404, 'NOT_FOUND');
  });

  it.each([
    ['a NUL title', { revision: 0, title: '\u0000' }],
    ['a control character in the body', { revision: 0, body: 'a\u0007b', entities: [] }],
    ['lone surrogates in the body', { revision: 0, body: '\ud800\ud800\ud800', entities: [] }],
    ['nothing to update', { revision: 0 }],
    ['a missing revision', { title: 'T' }],
    ['a negative revision', { revision: -1, title: 'T' }],
    ['a blank title', { revision: 0, title: ' ' }],
    ['an oversized body', { revision: 0, body: 'b'.repeat(4097), entities: [] }],
    ['a status change', { revision: 0, title: 'T', status: 'approved' }]
  ])('answers 400 for %s', async (_name, json) => {
    const created = await create({ title: 'T' });

    await expectError(await patch(created.id, json), 400, 'VALIDATION_ERROR');
    expect(await count('post_revisions')).toBe(1);
  });
});

describe('POST /api/v1/posts/:id/approve', () => {
  it('approves a draft, bumps the revision and records revision and audit rows', async () => {
    const created = await create({ title: 'T', body: 'Ready' });

    const response = await approve(created.id, { revision: 0 });

    expect(response.status).toBe(200);
    expect(postSchema.parse(await response.json())).toMatchObject({ status: 'approved', revision: 1, body: 'Ready' });
    expect(await count('post_revisions', `post_id = '${created.id}' AND revision = 1 AND status = 'approved'`)).toBe(1);
    expect(await count('audit_log', "action = 'post.approve'")).toBe(1);
  });

  it('answers 400 EMPTY_BODY for a blank body and leaves the post a draft', async () => {
    const created = await create({ title: 'T', body: '  \n ' });

    await expectError(await approve(created.id, { revision: 0 }), 400, 'VALIDATION_ERROR', { reason: 'EMPTY_BODY' });

    const stored = postSchema.parse(await (await api.request(`/api/v1/posts/${created.id}`)).json());
    expect(stored).toMatchObject({ status: 'draft', revision: 0 });
    expect(await count('audit_log', "action = 'post.approve'")).toBe(0);
  });

  it('answers 409 STALE_REVISION for an old revision', async () => {
    const created = await create({ title: 'T', body: 'x' });
    await patch(created.id, { revision: 0, body: 'y', entities: [] });

    await expectError(await approve(created.id, { revision: 0 }), 409, 'CONFLICT', { reason: 'STALE_REVISION' });
  });

  it('answers 409 ALREADY_APPROVED on a second approval', async () => {
    const created = await create({ title: 'T', body: 'x' });
    await approve(created.id, { revision: 0 });

    await expectError(await approve(created.id, { revision: 0 }), 409, 'CONFLICT', { reason: 'ALREADY_APPROVED' });
    await expectError(await approve(created.id, { revision: 1 }), 409, 'CONFLICT', { reason: 'ALREADY_APPROVED' });
    expect(await count('audit_log', "action = 'post.approve'")).toBe(1);
  });

  it('lets exactly one of two concurrent approvals win', async () => {
    const created = await create({ title: 'T', body: 'x' });

    const responses = await Promise.all([approve(created.id, { revision: 0 }), approve(created.id, { revision: 0 })]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const loser = responses.find((response) => response.status === 409) as Response;
    await expectError(loser, 409, 'CONFLICT');
    expect(await count('post_revisions', `post_id = '${created.id}'`)).toBe(2);
    expect(await count('audit_log', "action = 'post.approve'")).toBe(1);
  });

  it('lets exactly one of a concurrent edit and approval win', async () => {
    const created = await create({ title: 'T', body: 'x' });

    const responses = await Promise.all([
      patch(created.id, { revision: 0, body: 'y', entities: [] }),
      approve(created.id, { revision: 0 })
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await count('post_revisions', `post_id = '${created.id}'`)).toBe(2);
  });

  it('answers 404 for an unknown or malformed id and 400 for a bad body', async () => {
    await expectError(await approve(crypto.randomUUID(), { revision: 0 }), 404, 'NOT_FOUND');
    await expectError(await approve('not-a-uuid', { revision: 0 }), 404, 'NOT_FOUND');
    const created = await create({ title: 'T', body: 'x' });
    await expectError(await approve(created.id, {}), 400, 'VALIDATION_ERROR');
    await expectError(await approve(created.id, { revision: 0, force: true }), 400, 'VALIDATION_ERROR');
  });
});

describe('GET /api/v1/posts', () => {
  async function seedPosts(total: number): Promise<void> {
    const db = testDb();
    const statements: D1PreparedStatement[] = [];
    for (let i = 0; i < total; i++) {
      // Groups of four share a timestamp, so pagination must break ties by id.
      const updatedAt = START + Math.floor(i / 4) * 1_000;
      statements.push(
        db
          .prepare(
            `INSERT INTO posts (id, title, body, status, revision, created_at, updated_at)
             VALUES (?1, ?2, '', ?3, 0, ?4, ?4)`
          )
          .bind(crypto.randomUUID(), `Post ${i}`, i % 3 === 0 ? 'approved' : 'draft', updatedAt)
      );
    }
    await db.batch(statements);
  }

  async function walk(query: string, limit: number): Promise<PostDto[]> {
    const items: PostDto[] = [];
    let cursor: string | null = null;
    for (let pages = 0; pages < 20; pages++) {
      const params = new URLSearchParams(query);
      params.set('limit', String(limit));
      if (cursor !== null) params.set('cursor', cursor);
      const response = await api.request(`/api/v1/posts?${params}`);
      expect(response.status).toBe(200);
      const page = postPageSchema.parse(await response.json());
      expect(page.items.length).toBeLessThanOrEqual(limit);
      items.push(...page.items);
      cursor = page.nextCursor;
      if (cursor === null) return items;
    }
    throw new Error('pagination did not terminate');
  }

  const isNewestFirst = (items: PostDto[]) =>
    items.every((item, i) => {
      const previous = items[i - 1];
      if (previous === undefined) return true;
      return previous.updatedAt > item.updatedAt || (previous.updatedAt === item.updatedAt && previous.id > item.id);
    });

  it('returns an empty page for an empty table', async () => {
    const response = await api.request('/api/v1/posts');

    expect(postPageSchema.parse(await response.json())).toEqual({
      items: [],
      nextCursor: null,
      archivedCount: 0,
      totalCount: 0
    });
  });

  it('walks more items than the limit without gaps or duplicates, newest first', async () => {
    await seedPosts(25);

    const items = await walk('', 10);

    expect(items).toHaveLength(25);
    expect(new Set(items.map((item) => item.id)).size).toBe(25);
    expect(isNewestFirst(items)).toBe(true);
  });

  it('stays stable when pages are as small as one item and when the total equals the limit', async () => {
    await seedPosts(9);

    expect(await walk('', 1)).toHaveLength(9);
    const exact = postPageSchema.parse(await (await api.request('/api/v1/posts?limit=9')).json());
    expect(exact.items).toHaveLength(9);
    expect(exact.nextCursor).toBeNull();
  });

  it('filters by status across pages', async () => {
    await seedPosts(25);

    const approved = await walk('status=approved', 4);
    const drafts = await walk('status=draft', 4);

    expect(approved).toHaveLength(9);
    expect(drafts).toHaveLength(16);
    expect(approved.every((post) => post.status === 'approved')).toBe(true);
    expect(isNewestFirst(drafts)).toBe(true);
  });

  it('searches Cyrillic title and body substrings case-insensitively and reports filtered totalCount', async () => {
    await create({ title: 'СЕКРЕТНЫЙ ЗАГОЛОВОК', body: 'Содержимое' });
    await create({ title: 'Другое', body: 'ТЕКСТОВОЕ ТЕЛО' });
    await create({ title: 'Не совпадает' });

    const titleMatch = postPageSchema.parse(await (await api.request('/api/v1/posts?q=секретный')).json());
    const bodyMatch = postPageSchema.parse(await (await api.request('/api/v1/posts?q=текстовое')).json());
    const stateMatch = postPageSchema.parse(await (await api.request('/api/v1/posts?q=ЧЕРНОВИК')).json());

    expect(titleMatch).toMatchObject({ totalCount: 1, items: [{ title: 'СЕКРЕТНЫЙ ЗАГОЛОВОК' }] });
    expect(bodyMatch).toMatchObject({ totalCount: 1, items: [{ body: 'ТЕКСТОВОЕ ТЕЛО' }] });
    expect(stateMatch.items.length).toBeGreaterThan(0);
    expect(stateMatch.items.every((post) => post.status === 'draft')).toBe(true);
  });

  it('searches current channel titles with Unicode case folding', async () => {
    const created = await create({ title: 'Channel post', body: 'Body' });
    const accentedTitle = await create({ title: 'ÉCLAIR', body: 'Short search regression' });
    const approved = postSchema.parse(await (await approve(created.id, { revision: 0 })).json());
    const destinationId = crypto.randomUUID();
    const publicationId = crypto.randomUUID();
    await testDb().batch([
      testDb()
        .prepare(
          "INSERT INTO destinations (id, title, chat_id, kind, enabled, revision, created_at, updated_at) VALUES (?1, 'ПУБЛИЧНЫЙ КАНАЛ', '@channel_test', 'channel', 1, 0, ?2, ?2)"
        )
        .bind(destinationId, START),
      testDb()
        .prepare(
          "INSERT INTO publications (id, post_id, post_revision, destination_id, scheduled_at, timezone, revision, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'Europe/Chisinau', 0, ?5, ?5)"
        )
        .bind(publicationId, approved.id, approved.revision, destinationId, START),
      testDb()
        .prepare(
          "INSERT INTO jobs (id, kind, publication_id, status, run_at, attempts, dedupe_key, publication_scheduled_at, created_at, updated_at) VALUES (?1, 'publish', ?2, 'succeeded', ?3, 1, ?4, ?3, ?3, ?3)"
        )
        .bind(crypto.randomUUID(), publicationId, START, `publish:${publicationId}`)
    ]);

    const page = postPageSchema.parse(await (await api.request('/api/v1/posts?q=публичный')).json());

    expect(page.totalCount).toBe(1);
    expect(page.items.map((post) => post.id)).toEqual([created.id]);

    const accentedTitleResponse = await api.request('/api/v1/posts?q=é');
    const accentedTitlePage = postPageSchema.parse(await accentedTitleResponse.json());
    expect(accentedTitlePage.items.map((post) => post.id)).toContain(accentedTitle.id);

    await testDb().prepare("UPDATE destinations SET title = 'ÓRBITA' WHERE id = ?1").bind(destinationId).run();
    const accentedChannelPage = postPageSchema.parse(await (await api.request('/api/v1/posts?q=ó')).json());
    expect(accentedChannelPage.items.map((post) => post.id)).toContain(created.id);
  });

  it('maintains trigram search indexes when post text and channel titles change', async () => {
    const created = await create({ title: 'Обычный заголовок', body: 'Начальный текст' });
    await patch(created.id, { revision: 0, title: 'Обновлённый заголовок', body: 'Изменённый текст', entities: [] });
    const destinationId = crypto.randomUUID();
    const approved = postSchema.parse(await (await approve(created.id, { revision: 1 })).json());
    const publicationId = crypto.randomUUID();
    await testDb().batch([
      testDb()
        .prepare(
          "INSERT INTO destinations (id, title, chat_id, kind, enabled, revision, created_at, updated_at) VALUES (?1, 'Старый канал', '@updated_channel', 'channel', 1, 0, ?2, ?2)"
        )
        .bind(destinationId, START),
      testDb()
        .prepare(
          "INSERT INTO publications (id, post_id, post_revision, destination_id, scheduled_at, timezone, revision, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'UTC', 0, ?5, ?5)"
        )
        .bind(publicationId, created.id, approved.revision, destinationId, START),
      testDb()
        .prepare(
          "INSERT INTO jobs (id, kind, publication_id, status, run_at, attempts, dedupe_key, publication_scheduled_at, created_at, updated_at) VALUES (?1, 'publish', ?2, 'succeeded', ?3, 1, ?4, ?3, ?3, ?3)"
        )
        .bind(crypto.randomUUID(), publicationId, START, `publish:${publicationId}`)
    ]);
    await testDb().prepare("UPDATE destinations SET title = 'НОВЫЙ КАНАЛ' WHERE id = ?1").bind(destinationId).run();

    const stalePostText = postPageSchema.parse(await (await api.request('/api/v1/posts?q=обычный')).json());
    const updatedPostText = postPageSchema.parse(await (await api.request('/api/v1/posts?q=ОБНОВЛЁННЫЙ')).json());
    const staleChannel = postPageSchema.parse(await (await api.request('/api/v1/posts?q=старый канал')).json());
    const updatedChannel = postPageSchema.parse(await (await api.request('/api/v1/posts?q=новый канал')).json());

    expect(stalePostText.totalCount).toBe(0);
    expect(updatedPostText.items.map((post) => post.id)).toEqual([created.id]);
    expect(staleChannel.totalCount).toBe(0);
    expect(updatedChannel.items.map((post) => post.id)).toEqual([created.id]);
  });

  it('uses trigram virtual-table indexes for the post and channel substring search branches', async () => {
    const query = listPostsQuerySchema.parse({ q: 'substring' });
    const built = buildPostsListSql(query);
    const { results } = await testDb()
      .prepare(`EXPLAIN QUERY PLAN ${built.sql}`)
      .bind(...built.bindings)
      .all<{ detail: string }>();
    const plan = results.map((row) => row.detail).join('\n');

    expect(plan.match(/VIRTUAL TABLE INDEX/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('uses the indexed title key for an unfiltered title sort', async () => {
    const query = listPostsQuerySchema.parse({ sort: 'title', direction: 'ascending' });
    const built = buildPostsListSql(query);
    const { results } = await testDb()
      .prepare(`EXPLAIN QUERY PLAN ${built.sql}`)
      .bind(...built.bindings)
      .all<{ detail: string }>();
    const plan = results.map((row) => row.detail).join('\n');

    expect(plan).toContain('posts_live_title_sort_idx');
  });

  it('sorts null sentAt after sent rows in both directions and continues with a stable cursor', async () => {
    const sent = await create({ title: 'Sent' });
    const noPublication = await create({ title: 'No publication' });
    const destinationId = crypto.randomUUID();
    const publicationId = crypto.randomUUID();
    await testDb().batch([
      testDb().prepare("UPDATE posts SET status = 'approved', revision = 1 WHERE id = ?1").bind(sent.id),
      testDb()
        .prepare(
          "INSERT INTO post_revisions (post_id, revision, title, body, entities, status, created_at) VALUES (?1, 1, 'Sent', '', '[]', 'approved', ?2)"
        )
        .bind(sent.id, START),
      testDb()
        .prepare(
          "INSERT INTO destinations (id, title, chat_id, kind, enabled, revision, created_at, updated_at) VALUES (?1, 'A', '@sent_test', 'channel', 1, 0, ?2, ?2)"
        )
        .bind(destinationId, START),
      testDb()
        .prepare(
          "INSERT INTO publications (id, post_id, post_revision, destination_id, scheduled_at, timezone, revision, created_at, updated_at) VALUES (?1, ?2, 1, ?3, ?4, 'UTC', 0, ?4, ?4)"
        )
        .bind(publicationId, sent.id, destinationId, START),
      testDb()
        .prepare(
          "INSERT INTO jobs (id, kind, publication_id, status, run_at, attempts, dedupe_key, publication_scheduled_at, created_at, updated_at) VALUES (?1, 'publish', ?2, 'succeeded', ?3, 1, ?4, ?3, ?3, ?3)"
        )
        .bind(crypto.randomUUID(), publicationId, START, `publish:${publicationId}`)
    ]);
    for (const direction of ['ascending', 'descending'] as const) {
      const first = postPageSchema.parse(
        await (await api.request(`/api/v1/posts?sort=sentAt&direction=${direction}&limit=1`)).json()
      );
      const params = new URLSearchParams({ sort: 'sentAt', direction, limit: '1', cursor: first.nextCursor ?? '' });
      const next = postPageSchema.parse(await (await api.request(`/api/v1/posts?${params}`)).json());
      expect(first.items[0]?.id).toBe(sent.id);
      expect(next.items[0]?.id).toBe(noPublication.id);
      expect(next.totalCount).toBe(2);
    }
  });

  it('sorts titles like the previous ru-RU numeric collator and continues across title-key cursors', async () => {
    const titles = ['Пост 10', 'Ёлка', 'Пост 2', 'Енот', 'Пост 02', 'Cafe 3', 'Café 2', 'Альфа'];
    const posts = await Promise.all(titles.map((title) => create({ title })));
    const collator = new Intl.Collator('ru-RU', { numeric: true, sensitivity: 'base' });
    const expected = [...posts].sort((left, right) => {
      const compared = collator.compare(left.title, right.title);
      return compared || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    });

    for (const direction of ['ascending', 'descending'] as const) {
      const ordered = direction === 'ascending' ? expected : [...expected].reverse();
      const first = postPageSchema.parse(
        await (await api.request(`/api/v1/posts?sort=title&direction=${direction}&limit=3`)).json()
      );
      const ids = first.items.map((post) => post.id);
      let cursor = first.nextCursor;
      while (cursor !== null) {
        const page = postPageSchema.parse(
          await (
            await api.request(
              `/api/v1/posts?sort=title&direction=${direction}&limit=3&cursor=${encodeURIComponent(cursor)}`
            )
          ).json()
        );
        ids.push(...page.items.map((post) => post.id));
        cursor = page.nextCursor;
      }
      expect(ids).toEqual(ordered.map((post) => post.id));
    }

    const renamed = posts[0];
    if (renamed === undefined) throw new Error('Expected a created post.');
    await patch(renamed.id, { revision: 0, title: 'Пост 1' });
    const storedKey = await testDb()
      .prepare('SELECT title_sort_key FROM posts WHERE id = ?1')
      .bind(renamed.id)
      .first<{ title_sort_key: string }>();
    expect(storedKey?.title_sort_key).toBe(postTitleSortKey('Пост 1'));
    await testDb().prepare("UPDATE posts SET title = 'Пост 3' WHERE id = ?1").bind(renamed.id).run();
    const invalidatedKey = await testDb()
      .prepare('SELECT title_sort_key FROM posts WHERE id = ?1')
      .bind(renamed.id)
      .first<{ title_sort_key: string }>();
    expect(invalidatedKey?.title_sort_key).toBe('');
  });

  it('keeps title sort cursors within the request limit for maximum-length titles', async () => {
    const first = await create({ title: 'А'.repeat(200) });
    const second = await create({ title: 'Я'.repeat(200) });
    for (const direction of ['ascending', 'descending'] as const) {
      const page = postPageSchema.parse(
        await (await api.request(`/api/v1/posts?sort=title&direction=${direction}&limit=1`)).json()
      );
      const cursor = page.nextCursor;

      expect(cursor).not.toBeNull();
      expect(cursor?.length).toBeLessThanOrEqual(512);
      const nextResponse = await api.request(
        `/api/v1/posts?sort=title&direction=${direction}&limit=1&cursor=${encodeURIComponent(cursor ?? '')}`
      );
      expect(nextResponse.status).toBe(200);
      const next = postPageSchema.parse(await nextResponse.json());
      expect(next.items.map((post) => post.id)).toEqual([[first.id, second.id].find((id) => id !== page.items[0]?.id)]);
    }
  });

  it('defaults to 20 items per page', async () => {
    await seedPosts(25);

    const page = postPageSchema.parse(await (await api.request('/api/v1/posts')).json());

    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).not.toBeNull();
  });

  it('puts a just-edited post first', async () => {
    const clock = fakeClock();
    api = createApi({ clock });
    const older = await create({ title: 'Older' });
    clock.advance(1_000);
    await create({ title: 'Newer' });
    clock.advance(1_000);
    await patch(older.id, { revision: 0, title: 'Older, edited' });

    const page = postPageSchema.parse(await (await api.request('/api/v1/posts')).json());

    expect(page.items.map((item) => item.title)).toEqual(['Older, edited', 'Newer']);
  });

  it.each([
    ['an undecodable cursor', 'cursor=%21%21%21'],
    ['a cursor of the wrong shape', `cursor=${btoa('hello')}`],
    ['limit 0', 'limit=0'],
    ['limit 101', 'limit=101'],
    ['a non-numeric limit', 'limit=abc'],
    ['an unknown status', 'status=published'],
    ['an unknown parameter', 'sort=asc']
  ])('answers 400 for %s', async (_name, query) => {
    await expectError(await api.request(`/api/v1/posts?${query}`), 400, 'VALIDATION_ERROR');
  });

  it('accepts the largest limit', async () => {
    expect((await api.request('/api/v1/posts?limit=100')).status).toBe(200);
  });
});
