import { devRunCandidatesSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

// «Проверка автопостов» (DEV only): a press must reach only its own announcement's publication keys, and never run
// where AUTOPUBLISH_TEST is off.

const DAY = 24 * 60 * 60_000;
const HASH = 'a'.repeat(64);

async function sql(statement: string, ...bindings: (string | number | null)[]): Promise<void> {
  await testDb()
    .prepare(statement)
    .bind(...bindings)
    .run();
}

async function seedNews(externalId: string, title: string, type: 'news' | 'treasure', age: number): Promise<void> {
  await sql(
    `INSERT INTO dota_update_items (source_key, external_id, title, source_url, published_at, detected_at, is_baseline, event_type)
     VALUES ('steam_news', ?1, ?2, 'https://store.steampowered.com/news/x', ?3, ?3, 0, ?4)`,
    externalId,
    title,
    START - age,
    type
  );
}

const keys = async () =>
  (await testDb().prepare('SELECT scope, key FROM idempotency_keys ORDER BY key').all<{ scope: string; key: string }>())
    .results;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * DAY });
  await seedNews('2001', 'Dota 2 Patch 7.41f', 'news', 1000);
  await seedNews('2002', 'Dota 2 Update - 10.09.2026', 'news', 2000);
  await seedNews('2003', 'Qualifiers update', 'news', 3000);
  await seedNews('2004', 'Treasure of the Beacon', 'treasure', 4000);
  await seedNews('2005', 'Dota 2 Patch 7.41e', 'news', 5000);
  for (const [scope, key] of [
    ['autopublish', 'autopublish:2001'],
    ['autopublish', 'autopublish:2001:follow-up-1'],
    ['autopublish', 'autopublish:20011'],
    ['autopublish', 'autopublish:2003']
  ])
    await sql(
      `INSERT INTO idempotency_keys (scope, key, request_hash, status, response_status, response_body, created_at, expires_at)
       VALUES (?1, ?2, ?3, 'completed', 201, '{}', 1, ?4)`,
      scope ?? '',
      key ?? '',
      HASH,
      START + DAY
    );
});

describe('/api/v1/dev-runs', () => {
  it('is refused where AUTOPUBLISH_TEST is off', async () => {
    const production = createApi({ clock: fakeClock(), botToken: null });
    const list = await production.request('/api/v1/dev-runs');
    expect(list.status).toBe(403);
    const run = await production.request('/api/v1/dev-runs', { method: 'POST', json: { kind: 'patch' } });
    expect(await run.json()).toMatchObject({ error: { details: { reason: 'DEV_RUNS_OFF' } } });
    expect(production.aiJobs.sent).toHaveLength(0);
    expect(await keys()).toHaveLength(4);
  });

  it('names the newest announcement of each kind and reruns only the pressed one', async () => {
    const dev = createApi({ clock: fakeClock(), botToken: null, env: { AUTOPUBLISH_TEST: 'true' } });
    const list = devRunCandidatesSchema.parse(await (await dev.request('/api/v1/dev-runs')).json());
    expect(Object.fromEntries(list.items.map((item) => [item.kind, item.externalId]))).toEqual({
      patch: '2001',
      hotfix: '2002',
      news: '2003',
      event: null,
      treasure: '2004',
      treasure_follow_up: '2004'
    });

    const run = await dev.request('/api/v1/dev-runs', { method: 'POST', json: { kind: 'patch' } });
    expect(run.status).toBe(202);
    expect(dev.aiJobs.sent).toMatchObject([
      { kind: 'source_event', externalId: '2001', automatic: true, devRun: true }
    ]);
    expect((await keys()).map((row) => row.key)).toEqual(['autopublish:20011', 'autopublish:2003']);

    const none = await dev.request('/api/v1/dev-runs', { method: 'POST', json: { kind: 'event' } });
    expect(await none.json()).toMatchObject({ error: { code: 'NOT_FOUND', details: { reason: 'NO_EVENT' } } });
    const again = await dev.request('/api/v1/dev-runs', { method: 'POST', json: { kind: 'patch' } });
    expect(await again.json()).toMatchObject({ error: { details: { reason: 'AI_WRITING' } } });
    expect(dev.aiJobs.sent).toHaveLength(1);
    await dev.settle();
  });
});
