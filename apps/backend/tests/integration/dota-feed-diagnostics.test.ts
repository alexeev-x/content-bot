import { beforeEach, describe, expect, it } from 'vitest';
import {
  createD1DotaWatcherRepository,
  createOfficialDotaFetcher,
  syncDotaUpdates,
  type DotaSourceFetcher
} from '../../src/modules/dota';
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
  return Promise.resolve(request.url.includes('steampowered') ? json(steamNewsFixture) : json(patchListFixture));
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
