import { dotaHeroStatisticsSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createD1DotaHeroStatisticsRepository,
  createDotaHeroStatisticsService,
  DotaHeroStatisticsError
} from '../../src/modules/dota-hero-statistics';
import { testDb } from '../helpers/db';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

const FIRST_CLAIM = '10000000-0000-4000-8000-000000000001';
const SECOND_CLAIM = '10000000-0000-4000-8000-000000000002';

function upstreamResponse(id = 1): Response {
  return Response.json([
    {
      id,
      localized_name: `Hero ${id}`,
      '1_pick': 500,
      '1_win': 250,
      '8_pick': 0,
      '8_win': 0,
      pro_pick: 100,
      pro_win: 53,
      pro_ban: 200
    }
  ]);
}

describe('Dota hero statistics', () => {
  beforeEach(async () => {
    await resetDb();
    await seedSession({ token: OWNER_TOKEN, expiresAt: START + 60 * 60_000 });
    await seedSession({ token: 'foreign-owner-token', telegramId: '999', expiresAt: START + 60 * 60_000 });
  });

  it('serves an owner-only cached read and never calls the upstream fetcher', async () => {
    const api = createApi({ clock: fakeClock(START) });
    expect((await api.request('/api/v1/dota/hero-statistics', { token: null })).status).toBe(401);
    expect((await api.request('/api/v1/dota/hero-statistics', { token: 'foreign-owner-token' })).status).toBe(403);
    const response = await api.request('/api/v1/dota/hero-statistics');
    expect(response.status).toBe(200);
    expect(dotaHeroStatisticsSchema.parse(await response.json())).toMatchObject({
      health: 'unverified',
      source: { name: expect.stringContaining('OpenDota'), url: 'https://api.opendota.com/api/heroStats' },
      latest: null,
      previous: null
    });
  });

  it('conditionally claims a six-hour poll, stores one full snapshot, and preserves it on source failure', async () => {
    let fetches = 0;
    let ids = [FIRST_CLAIM, SECOND_CLAIM];
    const service = createDotaHeroStatisticsService({
      repo: createD1DotaHeroStatisticsRepository(testDb()),
      fetch: async () => {
        fetches += 1;
        if (fetches > 1) throw new Error('upstream unavailable');
        return upstreamResponse();
      }
    });
    const newId = () => ids.shift() ?? SECOND_CLAIM;
    const firstResults = await Promise.all([service.poll({ now: START, newId }), service.poll({ now: START, newId })]);

    expect(firstResults.map((result) => result.status).sort()).toEqual(['not_due', 'stored']);
    expect(fetches).toBe(1);
    expect(await testDb().prepare('SELECT count(*) AS count FROM dota_hero_stats_snapshots').first()).toMatchObject({
      count: 1
    });
    expect((await service.get(START)).latest?.heroes[0]).toMatchObject({
      heroId: 1,
      name: 'Hero 1',
      ranked: { '1': { picks: 500, wins: 250 }, '2': { picks: null, wins: null } },
      professional: { picks: 100, wins: 53, bans: 200 }
    });

    await expect(service.poll({ now: START + 6 * 60 * 60_000, newId })).rejects.toMatchObject({
      code: 'DOTA_HERO_STATS_FETCH'
    } satisfies Partial<DotaHeroStatisticsError>);
    const cached = await service.get(START + 6 * 60 * 60_000);
    expect(cached.health).toBe('degraded');
    expect(cached.lastErrorCode).toBe('DOTA_HERO_STATS_FETCH');
    expect(cached.latest?.heroes[0]?.name).toBe('Hero 1');
    expect(cached.previous).toBeNull();
  });

  it('persists each bounded upstream failure and keeps the last complete snapshot', async () => {
    const failures: Array<{ response: Response; code: string }> = [
      { response: new Response(null, { status: 429 }), code: 'DOTA_HERO_STATS_HTTP' },
      {
        response: new Response('oversized', { headers: { 'content-length': String(512 * 1024 + 1) } }),
        code: 'DOTA_HERO_STATS_BODY_LIMIT'
      },
      { response: new Response('{invalid json'), code: 'DOTA_HERO_STATS_JSON' },
      { response: Response.json([{ id: 1, localized_name: '' }]), code: 'DOTA_HERO_STATS_SHAPE' }
    ];
    const service = createDotaHeroStatisticsService({
      repo: createD1DotaHeroStatisticsRepository(testDb()),
      fetch: async () => upstreamResponse()
    });
    await service.poll({ now: START, newId: () => FIRST_CLAIM });

    for (const [index, failure] of failures.entries()) {
      const now = START + (index + 1) * 6 * 60 * 60_000;
      const failingService = createDotaHeroStatisticsService({
        repo: createD1DotaHeroStatisticsRepository(testDb()),
        fetch: async () => failure.response
      });
      await expect(failingService.poll({ now, newId: () => SECOND_CLAIM })).rejects.toMatchObject({
        code: failure.code
      });
      const cached = await failingService.get(now);
      expect(cached.lastErrorCode).toBe(failure.code);
      expect(cached.health).toBe('degraded');
      expect(cached.latest?.heroes[0]?.name).toBe('Hero 1');
      expect(cached.previous).toBeNull();
    }
  });

  it('reports a stale source without changing the cached observations', async () => {
    const service = createDotaHeroStatisticsService({
      repo: createD1DotaHeroStatisticsRepository(testDb()),
      fetch: async () => upstreamResponse()
    });
    await service.poll({ now: START, newId: () => FIRST_CLAIM });
    const stale = await service.get(START + 24 * 60 * 60_000 + 1);
    expect(stale.health).toBe('stale');
    expect(stale.latest?.observedAt).toBe(new Date(START).toISOString());
  });

  it('purges snapshots older than 30 days in a bounded batch and preserves recent observations', async () => {
    const service = createDotaHeroStatisticsService({
      repo: createD1DotaHeroStatisticsRepository(testDb()),
      fetch: async () => upstreamResponse()
    });
    await service.poll({ now: START, newId: () => FIRST_CLAIM });
    const recent = START + 2 * 24 * 60 * 60_000;
    await service.poll({ now: recent, newId: () => SECOND_CLAIM });

    const queryPlan = await testDb()
      .prepare(
        'EXPLAIN QUERY PLAN SELECT observed_at FROM dota_hero_stats_snapshots WHERE observed_at < ?1 ORDER BY observed_at LIMIT ?2'
      )
      .bind(recent, 100)
      .all<{ detail: string }>();

    const removed = await service.purgeExpiredSnapshots(START + 31 * 24 * 60 * 60_000, 1);
    const stats = await service.get(START + 31 * 24 * 60 * 60_000);

    expect(removed).toBe(1);
    expect(queryPlan.results.map((row) => row.detail).join(' ')).toContain('PRIMARY KEY');
    expect(stats.latest?.observedAt).toBe(new Date(recent).toISOString());
    expect(stats.previous).toBeNull();
    expect(await testDb().prepare('SELECT count(*) AS count FROM dota_hero_stats_snapshots').first()).toMatchObject({
      count: 1
    });
  });
});
