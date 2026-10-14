import { beforeEach, describe, expect, it } from 'vitest';
import {
  createD1DotaWatcherRepository,
  createOfficialDotaFetcher,
  syncDotaUpdates,
  type DotaSourceFetcher
} from '../../src/modules/dota';
import {
  createD1DotaHeroStatisticsRepository,
  createDotaHeroStatisticsService,
  DotaHeroStatisticsError
} from '../../src/modules/dota-hero-statistics';
import { createOpenDotaHeroStatisticsFetcher } from '../../src/integrations/opendota/hero-statistics';
import heroStatsFixture from '../fixtures/opendota-herostats.json';
import patchListFixture from '../fixtures/dota-patchnoteslist.json';
import steamNewsFixture from '../fixtures/steam-news.json';
import { testDb } from '../helpers/db';
import { resetDb } from '../helpers/harness';

const T0 = Date.UTC(2026, 9, 14, 6, 15);
const json = (body: unknown, init?: ResponseInit) => Response.json(body, init);

function fetcherFor(responses: { steam: () => Response; patches: () => Response }): DotaSourceFetcher {
  return {
    fetch: (source) => Promise.resolve(source === 'steam_news' ? responses.steam() : responses.patches()),
    fetchPatchDetails: () => Promise.reject(new Error('unused')),
    fetchPatchNameMaps: () => Promise.reject(new Error('unused'))
  };
}

// workerd validates RequestInit exactly like production: `redirect: 'error'` is rejected there, so the
// stub builds a real Request instead of accepting any init.
const runtimeFetch: typeof fetch = (input, init) => {
  const request = new Request(input, init);
  return Promise.resolve(
    request.url.includes('steampowered')
      ? json(steamNewsFixture)
      : request.url.includes('patchnoteslist')
        ? json(patchListFixture)
        : json(heroStatsFixture)
  );
};

async function sourceRow(key: string) {
  return testDb()
    .prepare(
      `SELECT last_error_code, last_error_http_status, last_error_detail, last_error_at, consecutive_failures, last_success_at
       FROM dota_source_state WHERE source_key = ?1`
    )
    .bind(key)
    .first<{
      last_error_code: string | null;
      last_error_http_status: number | null;
      last_error_detail: string | null;
      last_error_at: number | null;
      consecutive_failures: number;
      last_success_at: number | null;
    }>();
}

beforeEach(resetDb);

describe('dota feed sync with real-shaped payloads', () => {
  it('requests the feeds with a RequestInit the Workers runtime accepts and stores both', async () => {
    const repo = createD1DotaWatcherRepository(testDb());
    const result = await syncDotaUpdates({
      fetcher: createOfficialDotaFetcher(runtimeFetch),
      repo,
      detectedAt: T0
    });
    expect(result).toEqual({ inserted: 7, fetched: 2 });
    expect((await sourceRow('steam_news'))?.consecutive_failures).toBe(0);
    expect((await sourceRow('patch_notes'))?.last_error_code).toBeNull();
  });

  it('records HTTP status, counts consecutive failures once per tick and clears them on success', async () => {
    const repo = createD1DotaWatcherRepository(testDb());
    const forbidden = () => new Response('denied', { status: 403, statusText: 'Forbidden' });
    const failing = fetcherFor({ steam: forbidden, patches: () => json(patchListFixture) });
    await syncDotaUpdates({ fetcher: failing, repo, detectedAt: T0 });
    await syncDotaUpdates({ fetcher: failing, repo, detectedAt: T0 });
    expect(await sourceRow('steam_news')).toMatchObject({
      last_error_code: 'DOTA_SOURCE_HTTP',
      last_error_http_status: 403,
      last_error_detail: 'HTTP 403 Forbidden',
      last_error_at: T0,
      consecutive_failures: 1
    });
    await syncDotaUpdates({ fetcher: failing, repo, detectedAt: T0 + 300_000 });
    expect((await sourceRow('steam_news'))?.consecutive_failures).toBe(2);
    expect((await sourceRow('patch_notes'))?.last_error_code).toBeNull();

    const healthy = fetcherFor({ steam: () => json(steamNewsFixture), patches: () => json(patchListFixture) });
    await syncDotaUpdates({ fetcher: healthy, repo, detectedAt: T0 + 600_000 });
    expect(await sourceRow('steam_news')).toMatchObject({
      last_error_code: null,
      last_error_detail: null,
      consecutive_failures: 0,
      last_success_at: T0 + 600_000
    });
  });

  it('names the failing field for a shape change and the size for an oversize body', async () => {
    const repo = createD1DotaWatcherRepository(testDb());
    const drifted = { appnews: { ...steamNewsFixture.appnews, newsitems: [{ gid: 5, title: 'x' }] } };
    await syncDotaUpdates({
      fetcher: fetcherFor({ steam: () => json(drifted), patches: () => json({ success: true, patches: 'none' }) }),
      repo,
      detectedAt: T0
    });
    expect(await sourceRow('steam_news')).toMatchObject({
      last_error_code: 'DOTA_SOURCE_SHAPE',
      last_error_detail: expect.stringContaining('appnews.newsitems.0.gid') as string
    });
    expect((await sourceRow('patch_notes'))?.last_error_detail).toContain('patches');

    await syncDotaUpdates({
      fetcher: fetcherFor({
        steam: () => new Response('x'.repeat(600 * 1024)),
        patches: () => new Response('not json')
      }),
      repo,
      detectedAt: T0 + 300_000
    });
    expect(await sourceRow('steam_news')).toMatchObject({
      last_error_code: 'DOTA_SOURCE_BODY_LIMIT',
      last_error_detail: expect.stringMatching(/larger than the 524288 byte limit \(read \d+ bytes\)/) as string
    });
    expect((await sourceRow('patch_notes'))?.last_error_code).toBe('DOTA_SOURCE_JSON');
  });

  it('reports a failed D1 write as STORE, not as a fetch failure, and opens no incident', async () => {
    const real = createD1DotaWatcherRepository(testDb());
    const repo = {
      ...real,
      storeSourceSync: () => Promise.reject(new Error('D1_ERROR: disk I/O error'))
    };
    const healthy = fetcherFor({ steam: () => json(steamNewsFixture), patches: () => json(patchListFixture) });
    const result = await syncDotaUpdates({ fetcher: healthy, repo, detectedAt: T0 });
    expect(result).toEqual({ inserted: 0, fetched: 0 });
    expect(await sourceRow('steam_news')).toMatchObject({
      last_error_code: 'DOTA_SOURCE_STORE',
      last_error_detail: expect.stringContaining('disk I/O error') as string,
      consecutive_failures: 1
    });
    const incidents = await testDb().prepare('SELECT COUNT(*) AS n FROM dota_source_incidents').first<{ n: number }>();
    expect(incidents?.n).toBe(0);
  });

  it('does not record a failure when the invocation ran out of subrequests', async () => {
    const real = createD1DotaWatcherRepository(testDb());
    const repo = {
      ...real,
      storeSourceSync: () => Promise.reject(new Error('Too many API requests by single worker invocation.'))
    };
    const healthy = fetcherFor({ steam: () => json(steamNewsFixture), patches: () => json(patchListFixture) });
    await syncDotaUpdates({ fetcher: healthy, repo, detectedAt: T0 });
    expect((await sourceRow('steam_news'))?.last_error_code).toBeNull();
  });

  it('exposes the stored diagnostics on the intelligence sources', async () => {
    const repo = createD1DotaWatcherRepository(testDb());
    const forbidden = () => new Response('denied', { status: 403 });
    await syncDotaUpdates({
      fetcher: fetcherFor({ steam: forbidden, patches: () => json(patchListFixture) }),
      repo,
      detectedAt: T0
    });
    const { sources } = await repo.listIntelligence({ limit: 5, now: T0 + 1000 });
    const steam = sources.find((source) => source.key === 'steam_news');
    expect(steam?.health).toBe('degraded');
    expect(steam?.lastError).toEqual({
      code: 'DOTA_SOURCE_HTTP',
      httpStatus: 403,
      detail: 'HTTP 403 Forbidden',
      at: new Date(T0).toISOString(),
      consecutiveFailures: 1,
      lastSuccessAt: null
    });
    expect(sources.find((source) => source.key === 'patch_notes')?.lastError).toBeNull();
  });
});

describe('hero statistics poll', () => {
  const newId = () => crypto.randomUUID();
  const heroRow = () =>
    testDb()
      .prepare(
        'SELECT last_error_code, last_error_kind, last_error_http_status, last_error_detail, consecutive_failures FROM dota_hero_stats_state WHERE id = 1'
      )
      .first<Record<string, string | number | null>>();

  it('stores a real-shaped response fetched with a runtime-valid RequestInit', async () => {
    const service = createDotaHeroStatisticsService({
      repo: createD1DotaHeroStatisticsRepository(testDb()),
      fetch: createOpenDotaHeroStatisticsFetcher(runtimeFetch)
    });
    expect(await service.poll({ now: T0, newId })).toEqual({ status: 'stored', heroCount: 3 });
    const dto = await service.get(T0 + 1000);
    expect(dto.health).toBe('healthy');
    expect(dto.lastError).toBeNull();
  });

  it('keeps the status and detail of a redirect or error response and counts failures', async () => {
    const service = createDotaHeroStatisticsService({
      repo: createD1DotaHeroStatisticsRepository(testDb()),
      fetch: () => Promise.resolve(new Response(null, { status: 302, headers: { location: 'https://example.com' } }))
    });
    await expect(service.poll({ now: T0, newId })).rejects.toBeInstanceOf(DotaHeroStatisticsError);
    await expect(service.poll({ now: T0 + 7 * 3600_000, newId })).rejects.toBeInstanceOf(DotaHeroStatisticsError);
    const dto = await service.get(T0 + 7 * 3600_000 + 1000);
    expect(dto.health).toBe('degraded');
    expect(dto.lastErrorCode).toBe('DOTA_HERO_STATS_HTTP');
    expect(dto.lastError).toMatchObject({
      code: 'DOTA_HERO_STATS_HTTP',
      httpStatus: 302,
      detail: 'HTTP 302 Found',
      consecutiveFailures: 2,
      lastSuccessAt: null
    });
  });

  it('names the failing field of a shape change', async () => {
    const service = createDotaHeroStatisticsService({
      repo: createD1DotaHeroStatisticsRepository(testDb()),
      fetch: () => Promise.resolve(json([{ id: 1, localized_name: 5 }]))
    });
    await expect(service.poll({ now: T0, newId })).rejects.toMatchObject({ code: 'DOTA_HERO_STATS_SHAPE' });
    expect((await heroRow())?.last_error_detail).toContain('0.localized_name');
  });

  it('reports a failed D1 write as STORE', async () => {
    const real = createD1DotaHeroStatisticsRepository(testDb());
    const service = createDotaHeroStatisticsService({
      repo: { ...real, storeSnapshot: () => Promise.reject(new Error('D1_ERROR: disk I/O error')) },
      fetch: () => Promise.resolve(json(heroStatsFixture))
    });
    await expect(service.poll({ now: T0, newId })).rejects.toThrow('disk I/O error');
    expect(await heroRow()).toMatchObject({
      last_error_code: null,
      last_error_kind: 'DOTA_HERO_STATS_STORE',
      consecutive_failures: 1
    });
    const dto = await service.get(T0 + 1000);
    expect(dto.health).toBe('degraded');
    expect(dto.lastError?.code).toBe('DOTA_HERO_STATS_STORE');
  });
});
