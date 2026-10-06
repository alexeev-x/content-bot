import { destinationPageSchema, destinationSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/platform/security/sha256';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { type Api, createApi, fakeClock, OWNER_ID, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { count, seedDestination } from '../helpers/publishing';

let api: Api;
let keyCounter = 0;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 7 * 24 * 60 * 60 * 1000 });
  keyCounter = 0;
  api = createApi({ clock: fakeClock() });
});

const nextKey = () => `dest-key-${++keyCounter}`;

const post = (json: unknown, key: string | null = nextKey()) =>
  api.request('/api/v1/destinations', {
    method: 'POST',
    headers: key === null ? {} : { 'idempotency-key': key },
    json
  });
const patch = (id: string, json: unknown) => api.request(`/api/v1/destinations/${id}`, { method: 'PATCH', json });
const valid = { title: 'Main channel', chatId: '-1001234567890', kind: 'channel' };

describe('POST /api/v1/destinations', () => {
  it('creates an enabled destination at revision 0 with an audit row', async () => {
    const response = await post({ ...valid, title: '  Main channel  ' });

    expect(response.status).toBe(201);
    const destination = destinationSchema.parse(await response.json());
    expect(destination).toMatchObject({ ...valid, enabled: true, revision: 0 });
    expect(destination.createdAt).toBe(new Date(START).toISOString());
    const audit = await testDb().prepare('SELECT actor_telegram_id, action, entity_id, details FROM audit_log').all();
    expect(audit.results).toEqual([
      {
        actor_telegram_id: OWNER_ID,
        action: 'destination.create',
        entity_id: destination.id,
        details: '{"revision":0}'
      }
    ]);
  });

  it('replays the original response for the same key and payload without a second row', async () => {
    const first = destinationSchema.parse(await (await post(valid, 'same')).json());
    await patch(first.id, { revision: 0, title: 'Renamed' });

    const replay = await post(valid, 'same');

    expect(replay.status).toBe(201);
    expect(destinationSchema.parse(await replay.json())).toEqual(first);
    expect(await count('destinations')).toBe(1);
    expect(await count('audit_log', "action = 'destination.create'")).toBe(1);
  });

  it('answers 409 IDEMPOTENCY_KEY_REUSED for the same key with another payload', async () => {
    await post(valid, 'reused');

    await expectError(await post({ ...valid, chatId: '-1009999999999' }, 'reused'), 409, 'CONFLICT', {
      reason: 'IDEMPOTENCY_KEY_REUSED'
    });
    expect(await count('destinations')).toBe(1);
  });

  it('answers 409 IN_FLIGHT while another request with the key is still running', async () => {
    const hash = await sha256Hex(JSON.stringify(valid));
    await testDb()
      .prepare(
        `INSERT INTO idempotency_keys (scope, key, request_hash, status, created_at, expires_at)
         VALUES (?1, 'flying', ?2, 'in_flight', ?3, ?4)`
      )
      .bind(OWNER_ID, hash, START - 1_000, START + 59_000)
      .run();

    await expectError(await post(valid, 'flying'), 409, 'CONFLICT', { reason: 'IN_FLIGHT' });
    expect(await count('destinations')).toBe(0);
  });

  it('creates exactly one destination when the same key is sent twice at once', async () => {
    const responses = await Promise.all([post(valid, 'twin'), post(valid, 'twin')]);

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses[0]).toBe(201);
    expect([201, 409]).toContain(statuses[1]);
    expect(await count('destinations')).toBe(1);
    expect(await count('audit_log')).toBe(1);
  });

  it('answers 409 CHAT_ID_TAKEN for a second destination with the same chat id and frees the key', async () => {
    await post(valid);

    await expectError(await post({ ...valid, title: 'Other' }, 'second'), 409, 'CONFLICT', {
      reason: 'CHAT_ID_TAKEN'
    });

    expect(await count('destinations')).toBe(1);
    // The failed batch rolled back its audit row, and the key is free for a corrected retry.
    expect(await count('audit_log')).toBe(1);
    expect(await count('idempotency_keys', "key = 'second'")).toBe(0);
    const retry = await post({ ...valid, title: 'Other', chatId: '-1002222222222' }, 'second');
    expect(retry.status).toBe(201);
  });

  it('treats an @username as the same chat whatever its case', async () => {
    await post({ title: 'Public', chatId: '@AlexeevDota', kind: 'channel' });

    await expectError(await post({ title: 'Public 2', chatId: '@alexeevdota', kind: 'channel' }), 409, 'CONFLICT', {
      reason: 'CHAT_ID_TAKEN'
    });
  });

  it('answers 400 without an Idempotency-Key', async () => {
    await expectError(await post(valid, null), 400, 'VALIDATION_ERROR');
  });

  it.each([
    ['a blank title', { ...valid, title: '   ' }],
    ['a title over 100 characters', { ...valid, title: 't'.repeat(101) }],
    ['a malformed chat id', { ...valid, chatId: 'channel' }],
    ['a chat id with a leading zero', { ...valid, chatId: '-01001234' }],
    ['a chat id of zero', { ...valid, chatId: '0' }],
    ['an unknown kind', { ...valid, kind: 'private' }],
    ['an unknown field', { ...valid, enabled: false }]
  ])('answers 400 for %s without burning the key', async (_name, json) => {
    await expectError(await post(json, 'bad'), 400, 'VALIDATION_ERROR');

    expect(await count('destinations')).toBe(0);
    expect(await count('idempotency_keys')).toBe(0);
  });

  it('answers 413 for a body over 8 KB', async () => {
    await expectError(await post({ ...valid, title: 't'.repeat(9_000) }), 413, 'VALIDATION_ERROR');
  });
});

describe('PATCH /api/v1/destinations/{id}', () => {
  it('changes the given fields, bumps the revision and writes an audit row', async () => {
    const created = await seedDestination(api, { title: 'Old', chatId: '-1001111111111' });
    api.clock.advance(5_000);

    const response = await patch(created.id, { revision: 0, title: 'New', chatId: '-1002222222222', enabled: false });

    expect(response.status).toBe(200);
    const updated = destinationSchema.parse(await response.json());
    expect(updated).toMatchObject({
      id: created.id,
      title: 'New',
      chatId: '-1002222222222',
      enabled: false,
      kind: 'channel',
      revision: 1,
      createdAt: created.createdAt,
      updatedAt: new Date(START + 5_000).toISOString()
    });
    const audit = await testDb()
      .prepare("SELECT details FROM audit_log WHERE action = 'destination.update'")
      .all<{ details: string }>();
    expect(audit.results.map((row) => JSON.parse(row.details))).toEqual([
      { revision: 1, fields: ['title', 'chatId', 'enabled'] }
    ]);
  });

  it('changes one field and keeps the rest', async () => {
    const created = await seedDestination(api, { title: 'Keep', chatId: '-1003333333333' });

    const updated = destinationSchema.parse(await (await patch(created.id, { revision: 0, enabled: false })).json());

    expect(updated).toMatchObject({ title: 'Keep', chatId: '-1003333333333', enabled: false, revision: 1 });
  });

  it('answers 409 STALE_REVISION for an old revision and changes nothing', async () => {
    const created = await seedDestination(api);
    await patch(created.id, { revision: 0, title: 'First' });

    await expectError(await patch(created.id, { revision: 0, title: 'Second' }), 409, 'CONFLICT', {
      reason: 'STALE_REVISION'
    });

    const current = destinationSchema.parse(await (await api.request(`/api/v1/destinations/${created.id}`)).json());
    expect(current).toMatchObject({ title: 'First', revision: 1 });
    expect(await count('audit_log', "action = 'destination.update'")).toBe(1);
  });

  it('lets exactly one of two concurrent edits of the same revision win', async () => {
    const created = await seedDestination(api);

    const responses = await Promise.all([
      patch(created.id, { revision: 0, title: 'A' }),
      patch(created.id, { revision: 0, title: 'B' })
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await count('audit_log', "action = 'destination.update'")).toBe(1);
  });

  it('answers 409 CHAT_ID_TAKEN when the new chat id belongs to another destination', async () => {
    await seedDestination(api, { chatId: '-1004444444444' });
    const other = await seedDestination(api, { chatId: '-1005555555555' });

    await expectError(await patch(other.id, { revision: 0, chatId: '-1004444444444' }), 409, 'CONFLICT', {
      reason: 'CHAT_ID_TAKEN'
    });

    const current = destinationSchema.parse(await (await api.request(`/api/v1/destinations/${other.id}`)).json());
    expect(current).toMatchObject({ chatId: '-1005555555555', revision: 0 });
    expect(await count('audit_log', "action = 'destination.update'")).toBe(0);
  });

  it('accepts the destination keeping its own chat id', async () => {
    const created = await seedDestination(api, { chatId: '-1006666666666' });

    const response = await patch(created.id, { revision: 0, title: 'Renamed', chatId: '-1006666666666' });

    expect(response.status).toBe(200);
  });

  it('answers 404 for an unknown or malformed id', async () => {
    await expectError(await patch(crypto.randomUUID(), { revision: 0, title: 'X' }), 404, 'NOT_FOUND');
    await expectError(await patch('not-a-uuid', { revision: 0, title: 'X' }), 404, 'NOT_FOUND');
  });

  it.each([
    ['nothing to update', { revision: 0 }],
    ['a missing revision', { title: 'X' }],
    ['a negative revision', { revision: -1, title: 'X' }],
    ['an unknown field', { revision: 0, kind: 'group' }]
  ])('answers 400 for %s', async (_name, json) => {
    const created = await seedDestination(api);

    await expectError(await patch(created.id, json), 400, 'VALIDATION_ERROR');
  });
});

describe('GET /api/v1/destinations', () => {
  it('returns one destination or 404', async () => {
    const created = await seedDestination(api);

    const response = await api.request(`/api/v1/destinations/${created.id}`);

    expect(response.status).toBe(200);
    expect(destinationSchema.parse(await response.json())).toEqual(created);
    await expectError(await api.request(`/api/v1/destinations/${crypto.randomUUID()}`), 404, 'NOT_FOUND');
    await expectError(await api.request('/api/v1/destinations/nope'), 404, 'NOT_FOUND');
  });

  it('lists by title regardless of case, with keyset pagination across equal titles', async () => {
    const titles = ['beta', 'Alpha', 'alpha', 'Gamma', 'delta'];
    for (const title of titles) await seedDestination(api, { title });

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const response: Response = await api.request(
        `/api/v1/destinations?limit=2${cursor === null ? '' : `&cursor=${cursor}`}`
      );
      expect(response.status).toBe(200);
      const page = destinationPageSchema.parse(await response.json());
      seen.push(...page.items.map((item) => item.title));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor !== null);

    expect(pages).toBe(3);
    expect(seen.map((title) => title.toLowerCase())).toEqual(['alpha', 'alpha', 'beta', 'delta', 'gamma']);
  });

  it('pages without repeating or skipping rows that share a title', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) ids.push((await seedDestination(api, { title: 'Same' })).id);

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const response: Response = await api.request(
        `/api/v1/destinations?limit=2${cursor === null ? '' : `&cursor=${cursor}`}`
      );
      const page = destinationPageSchema.parse(await response.json());
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor !== null);

    expect(seen).toEqual([...ids].sort());
  });

  it('filters by enabled', async () => {
    const on = await seedDestination(api, { title: 'On' });
    const off = await seedDestination(api, { title: 'Off' });
    await patch(off.id, { revision: 0, enabled: false });

    const enabled = destinationPageSchema.parse(await (await api.request('/api/v1/destinations?enabled=true')).json());
    const disabled = destinationPageSchema.parse(
      await (await api.request('/api/v1/destinations?enabled=false')).json()
    );

    expect(enabled.items.map((item) => item.id)).toEqual([on.id]);
    expect(disabled.items.map((item) => item.id)).toEqual([off.id]);
  });

  it('survives a title with quotes and non-ASCII text in the cursor', async () => {
    await seedDestination(api, { title: 'Канал "Dota" \\ 日本 1' });
    await seedDestination(api, { title: 'Канал "Dota" \\ 日本 2' });

    const first = destinationPageSchema.parse(await (await api.request('/api/v1/destinations?limit=1')).json());
    const second = destinationPageSchema.parse(
      await (await api.request(`/api/v1/destinations?limit=1&cursor=${first.nextCursor}`)).json()
    );

    expect([first.items[0]?.title, second.items[0]?.title]).toEqual([
      'Канал "Dota" \\ 日本 1',
      'Канал "Dota" \\ 日本 2'
    ]);
    expect(second.nextCursor).toBeNull();
  });

  it.each([
    ['limit 0', 'limit=0'],
    ['limit 101', 'limit=101'],
    ['a bad enabled value', 'enabled=maybe'],
    ['an unknown parameter', 'sort=title'],
    ['a malformed cursor', 'cursor=%2A%2A%2A'],
    ['a cursor of another kind', `cursor=${btoa('1:0b1f6c52-8d3e-4a47-9a35-2f6f0c1d7e90')}`]
  ])('answers 400 for %s', async (_name, query) => {
    await expectError(await api.request(`/api/v1/destinations?${query}`), 400, 'VALIDATION_ERROR');
  });

  it('accepts limit 100', async () => {
    expect((await api.request('/api/v1/destinations?limit=100')).status).toBe(200);
  });
});

describe('destination routes are owner-only', () => {
  const routes: [string, string][] = [
    ['POST', '/api/v1/destinations'],
    ['GET', '/api/v1/destinations'],
    ['GET', `/api/v1/destinations/${crypto.randomUUID()}`],
    ['PATCH', `/api/v1/destinations/${crypto.randomUUID()}`]
  ];

  it.each(routes)('%s %s answers 401 without a token and 403 for another user', async (method, path) => {
    await seedSession({ token: 'stranger-token-0000000000000000000000000', telegramId: '777' });

    await expectError(await api.request(path, { method, token: null }), 401, 'UNAUTHORIZED');
    await expectError(
      await api.request(path, { method, token: 'stranger-token-0000000000000000000000000' }),
      403,
      'FORBIDDEN'
    );
    expect(await count('destinations')).toBe(0);
  });
});
