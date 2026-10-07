import { type IncidentDto, incidentPageSchema, incidentSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  INCIDENT_BY_ID_SQL,
  listIncidentsSql,
  OPEN_COUNT_SQL
} from '../../src/modules/publishing/infrastructure/d1-incident-repository';
import { testDb } from '../helpers/db';
import { fakeTransport, makeTick, seedDueJob } from '../helpers/dispatch';
import { expectError } from '../helpers/expect-error';
import { insertIncident } from '../helpers/incidents';
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
import { count, jobOf } from '../helpers/publishing';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

let clock: FakeClock;
let api: Api;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * DAY });
  clock = fakeClock();
  api = createApi({ clock });
});

async function page(query = ''): Promise<ReturnType<typeof incidentPageSchema.parse>> {
  const response = await api.request(`/api/v1/incidents${query}`);
  expect(response.status).toBe(200);
  return incidentPageSchema.parse(await response.json());
}

const resolve = (id: string) => api.request(`/api/v1/incidents/${id}/resolve`, { method: 'POST' });

// A real failed send: the publication ends `failed` with its incident, exactly as production writes it.
async function seedFailed(title = 'Patch 7.40') {
  const seeded = await seedDueJob(api, { title });
  await makeTick({
    clock,
    transport: fakeTransport({ kind: 'rejected', code: 'DESTINATION_UNAVAILABLE' })
  }).run();
  expect(await jobOf(seeded.publicationId)).toMatchObject({ status: 'failed' });
  const row = await testDb()
    .prepare('SELECT id FROM incidents WHERE job_id = ?1')
    .bind(seeded.jobId)
    .first<{ id: string }>();
  if (row === null) throw new Error('incident missing');
  clock.advance(MINUTE);
  return { ...seeded, incidentId: row.id };
}

async function seedUnknown() {
  const seeded = await seedDueJob(api);
  await makeTick({ clock, transport: fakeTransport({ kind: 'unknown', reason: 'timeout' }) }).run();
  expect(await jobOf(seeded.publicationId)).toMatchObject({ status: 'unknown' });
  const row = await testDb()
    .prepare('SELECT id FROM incidents WHERE job_id = ?1')
    .bind(seeded.jobId)
    .first<{ id: string }>();
  if (row === null) throw new Error('incident missing');
  clock.advance(MINUTE);
  return { ...seeded, incidentId: row.id };
}

describe('GET /api/v1/incidents', () => {
  it('lists an incident with its publication, attempts and no raw details', async () => {
    const failed = await seedFailed('Patch 7.40');

    const result = await page();

    expect(result.openCount).toBe(1);
    expect(result.nextCursor).toBeNull();
    expect(result.items).toHaveLength(1);
    const [item] = result.items;
    expect(item).toMatchObject({
      id: failed.incidentId,
      kind: 'publish_failed',
      code: 'DESTINATION_UNAVAILABLE',
      jobId: failed.jobId,
      attemptCount: 1,
      publication: {
        id: failed.publicationId,
        status: 'failed',
        postTitle: 'Patch 7.40',
        destinationName: 'Main channel'
      }
    });
    expect(item?.resolvedAt).toBeUndefined();
    const raw = JSON.stringify(result);
    expect(raw).not.toContain('details');
    expect(raw).not.toContain('Body text');
  });

  it('filters by state and kind, each state newest first', async () => {
    const openOld = await insertIncident({ createdAt: START + 1 * MINUTE });
    const openNew = await insertIncident({
      createdAt: START + 5 * MINUTE,
      kind: 'publish_unknown',
      code: 'SEND_UNCONFIRMED'
    });
    // Closed in the opposite order of being raised: the resolved list follows the time of closing.
    const closedFirst = await insertIncident({ createdAt: START, resolvedAt: START + 20 * MINUTE });
    const closedSecond = await insertIncident({
      createdAt: START + 2 * MINUTE,
      kind: 'publish_unknown',
      code: 'SEND_UNCONFIRMED',
      resolvedAt: START + 10 * MINUTE
    });

    expect((await page()).items.map((item) => item.id)).toEqual([openNew, openOld]);
    expect((await page('?state=open')).items.map((item) => item.id)).toEqual([openNew, openOld]);
    expect((await page('?state=open&kind=publish_failed')).items.map((item) => item.id)).toEqual([openOld]);
    const resolved = await page('?state=resolved');
    expect(resolved.items.map((item) => item.id)).toEqual([closedFirst, closedSecond]);
    expect(resolved.items[0]?.resolvedAt).toBe(new Date(START + 20 * MINUTE).toISOString());
    expect((await page('?state=resolved&kind=publish_unknown')).items.map((item) => item.id)).toEqual([closedSecond]);
    // The badge counts open incidents whatever is filtered.
    expect((await page('?state=resolved&kind=publish_unknown')).openCount).toBe(2);
  });

  it('pages 30 open incidents as 25 + 5 by cursor without a duplicate or a gap, ties included', async () => {
    const ids: string[] = [];
    // Three incidents share every timestamp, so the id decides the order inside a tie.
    for (let i = 0; i < 30; i += 1) ids.push(await insertIncident({ createdAt: START + Math.floor(i / 3) * MINUTE }));

    const first = await page();
    expect(first.items).toHaveLength(25);
    expect(first.nextCursor).not.toBeNull();
    expect(first.openCount).toBe(30);
    const second = await page(`?cursor=${first.nextCursor}`);
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();

    const seen = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(seen).size).toBe(30);
    expect([...seen].sort()).toEqual([...ids].sort());
    const times = [...first.items, ...second.items].map((item) => item.occurredAt);
    expect(times).toEqual([...times].sort().reverse());
  });

  it('pages the resolved history by cursor as well', async () => {
    for (let i = 0; i < 7; i += 1) {
      await insertIncident({ createdAt: START, resolvedAt: START + (i % 4) * MINUTE });
    }

    const first = await page('?state=resolved&limit=5');
    const second = await page(`?state=resolved&limit=5&cursor=${first.nextCursor}`);

    expect(first.items).toHaveLength(5);
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(7);
    expect(first.openCount).toBe(0);
  });

  it('caps openCount at 99', async () => {
    for (let i = 0; i < 100; i += 1) await insertIncident({ createdAt: START + i });

    const result = await page('?limit=50');

    expect(result.openCount).toBe(99);
    expect(result.items).toHaveLength(50);
  });

  it('shows an incident that has no publication and no job', async () => {
    await insertIncident({ createdAt: START, code: 'PUBLICATION_MISSING' });

    const [item] = (await page()).items;

    expect(item).toMatchObject({ code: 'PUBLICATION_MISSING', attemptCount: 0 });
    expect(item?.publication).toBeUndefined();
    expect(item?.jobId).toBeUndefined();
  });

  it.each([
    ['an unknown state', '?state=all'],
    ['an unknown kind', '?kind=other'],
    ['a limit over 50', '?limit=51'],
    ['a limit of 0', '?limit=0'],
    ['an invented cursor', '?cursor=not-a-cursor'],
    ['an unknown parameter', '?foo=1']
  ])('rejects %s with 400', async (_name, query) => {
    await expectError(await api.request(`/api/v1/incidents${query}`), 400, 'VALIDATION_ERROR');
  });
});

describe('POST /api/v1/incidents/{id}/resolve', () => {
  const auditOf = async (id: string) =>
    (
      await testDb()
        .prepare(
          "SELECT actor_telegram_id, details, created_at FROM audit_log WHERE action = 'incident.resolve' AND entity_id = ?1"
        )
        .bind(id)
        .all<{ actor_telegram_id: string; details: string; created_at: number }>()
    ).results;

  it('acknowledges a failed incident: closed, audited once, the publication untouched', async () => {
    const failed = await seedFailed();
    const before = await jobOf(failed.publicationId);

    const response = await resolve(failed.incidentId);

    expect(response.status).toBe(200);
    const body = incidentSchema.parse(await response.json());
    expect(body).toMatchObject({
      id: failed.incidentId,
      kind: 'publish_failed',
      resolvedAt: new Date(clock.now()).toISOString(),
      publication: { id: failed.publicationId, status: 'failed' }
    });
    expect(await jobOf(failed.publicationId)).toEqual(before);
    const audit = await auditOf(failed.incidentId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_telegram_id: '4242', created_at: clock.now() });
    expect(JSON.parse(audit[0]?.details ?? '{}')).toEqual({ code: 'DESTINATION_UNAVAILABLE' });

    const open = await page();
    expect(open.items).toEqual([]);
    expect(open.openCount).toBe(0);
    expect((await page('?state=resolved')).items.map((item) => item.id)).toEqual([failed.incidentId]);
  });

  it('is idempotent: a repeat is 200 with the same row and no second audit row', async () => {
    const failed = await seedFailed();
    const first = (await (await resolve(failed.incidentId)).json()) as IncidentDto;
    clock.advance(5 * MINUTE);

    const again = await resolve(failed.incidentId);

    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(first);
    expect(await auditOf(failed.incidentId)).toHaveLength(1);
  });

  it('two tabs at once: both 200, exactly one audit row, one resolved_at', async () => {
    const failed = await seedFailed();

    const [one, two] = await Promise.all([resolve(failed.incidentId), resolve(failed.incidentId)]);

    expect([one.status, two.status]).toEqual([200, 200]);
    expect(await one.json()).toEqual(await two.json());
    expect(await auditOf(failed.incidentId)).toHaveLength(1);
    expect(await count('audit_log', "action = 'incident.resolve'")).toBe(1);
  });

  it('refuses an unknown send with 409 USE_RESOLVE_UNKNOWN and leaves it open and unaudited', async () => {
    const unknown = await seedUnknown();

    const response = await resolve(unknown.incidentId);

    await expectError(response, 409, 'CONFLICT', { reason: 'USE_RESOLVE_UNKNOWN' });
    expect(await count('incidents', `id = '${unknown.incidentId}' AND resolved_at IS NULL`)).toBe(1);
    expect(await count('audit_log', "action = 'incident.resolve'")).toBe(0);
    expect(await jobOf(unknown.publicationId)).toMatchObject({ status: 'unknown' });
  });

  it('closing an unknown send by reconciling it moves its incident to the closed list', async () => {
    const unknown = await seedUnknown();

    const resolved = await api.request(`/api/v1/publications/${unknown.publicationId}/resolve-unknown`, {
      method: 'POST',
      json: { outcome: 'sent', revision: 0, externalMessageId: '9001' }
    });

    expect(resolved.status).toBe(200);
    expect((await page()).items).toEqual([]);
    const [closed] = (await page('?state=resolved')).items;
    expect(closed).toMatchObject({
      id: unknown.incidentId,
      kind: 'publish_unknown',
      resolvedAt: new Date(clock.now()).toISOString(),
      publication: { status: 'sent' }
    });
  });

  it('answers 404 for a missing incident and for a malformed id', async () => {
    await expectError(await resolve(crypto.randomUUID()), 404, 'NOT_FOUND');
    await expectError(await resolve('not-a-uuid'), 404, 'NOT_FOUND');
    expect(await count('audit_log', "action = 'incident.resolve'")).toBe(0);
  });

  it('keeps the closing time after the raise time when clocks disagree', async () => {
    const id = await insertIncident({ createdAt: clock.now() + 10 * MINUTE });

    const response = await resolve(id);

    expect(response.status).toBe(200);
    expect(incidentSchema.parse(await response.json()).resolvedAt).toBe(
      new Date(clock.now() + 10 * MINUTE).toISOString()
    );
  });
});

describe('incident routes are owner-only', () => {
  const id = crypto.randomUUID();
  const routes: [string, string][] = [
    ['GET', '/api/v1/incidents'],
    ['POST', `/api/v1/incidents/${id}/resolve`]
  ];

  it.each(routes)('%s %s answers 401 without a token and 403 for another user', async (method, path) => {
    await seedSession({ token: 'stranger-token-0000000000000000000000000', telegramId: '777' });
    await insertIncident({ id, createdAt: START });

    await expectError(await api.request(path, { method, token: null }), 401, 'UNAUTHORIZED');
    await expectError(
      await api.request(path, { method, token: 'stranger-token-0000000000000000000000000' }),
      403,
      'FORBIDDEN'
    );
    expect(await count('incidents', 'resolved_at IS NULL')).toBe(1);
    expect(await count('audit_log', "action = 'incident.resolve'")).toBe(0);
  });
});

async function planOf(sql: string, ...bindings: (string | number)[]): Promise<string> {
  const { results } = await testDb()
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .bind(...bindings)
    .all<{ detail: string }>();
  return results.map((row) => row.detail).join('\n');
}

describe('incident queries use their indexes', () => {
  const cursor = { at: START, id: crypto.randomUUID() };
  const plan = (query: Parameters<typeof listIncidentsSql>[0]) => {
    const { sql, bindings } = listIncidentsSql(query);
    return planOf(sql, ...bindings);
  };

  it('open: incidents_open_idx, with and without a cursor or kind, no sort', async () => {
    for (const query of [
      { state: 'open', limit: 26 },
      { state: 'open', limit: 26, after: cursor },
      { state: 'open', limit: 26, kind: 'publish_failed', after: cursor }
    ] as const) {
      const detail = await plan(query);
      expect(detail).toContain('USING INDEX incidents_open_idx');
      expect(detail).not.toContain('TEMP B-TREE');
      expect(detail).not.toMatch(/SCAN (publications|jobs|post_revisions|destinations)\b/);
    }
  });

  it('resolved: incidents_resolved_idx, and the kind index when a kind is asked for, no sort', async () => {
    for (const query of [
      { state: 'resolved', limit: 26 },
      { state: 'resolved', limit: 26, after: cursor }
    ] as const) {
      const detail = await plan(query);
      expect(detail).toContain('USING INDEX incidents_resolved_idx');
      expect(detail).not.toContain('TEMP B-TREE');
    }
    const byKind = await plan({ state: 'resolved', limit: 26, kind: 'publish_unknown', after: cursor });
    expect(byKind).toContain('USING INDEX incidents_resolved_kind_idx');
    expect(byKind).not.toContain('TEMP B-TREE');
    expect(byKind).not.toMatch(/SCAN (publications|jobs|post_revisions|destinations)\b/);
  });

  it('the attempt count walks the job_attempts key, the open count the open index, a single read the primary key', async () => {
    expect(await plan({ state: 'open', limit: 26 })).toMatch(
      /SEARCH a USING (COVERING )?INDEX sqlite_autoindex_job_attempts_1/
    );
    expect(await planOf(OPEN_COUNT_SQL)).toContain('incidents_open_idx');
    const single = await planOf(INCIDENT_BY_ID_SQL, crypto.randomUUID());
    expect(single).toMatch(/SEARCH i USING INDEX sqlite_autoindex_incidents_1/);
  });
});
