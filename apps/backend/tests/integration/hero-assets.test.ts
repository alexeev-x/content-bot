import { dotaHeroAssetsSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createD1HeroAssetRepository, HERO_ASSETS_PER_TICK, mirrorHeroAssets } from '../../src/modules/hero-assets';
import { createR2HeroAssetStorage } from '../../src/app/r2-hero-asset-storage';
import { createLogger } from '../../src/platform/logging/logger';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession } from '../helpers/harness';
import { testMediaBucket } from '../helpers/media-bucket';

const logger = createLogger(() => undefined);
const HERO_LIST = {
  result: {
    data: {
      heroes: [
        { id: 14, name: 'npc_dota_hero_pudge', name_english_loc: 'Pudge' },
        { id: 11, name: 'npc_dota_hero_nevermore', name_english_loc: 'Shadow Fiend' },
        { id: 999, name: 'npc_dota_hero_../evil', name_english_loc: 'Evil' }
      ]
    }
  }
};

/** Valve's CDN: every file of Pudge exists, Shadow Fiend has no MOV render. */
function fakeCdn(requested: string[]): typeof fetch {
  // Like the runtime's fetch, it refuses to be called as a method of another object («Illegal invocation»).
  return async function cdn(this: unknown, input: RequestInfo | URL) {
    if (this !== undefined) throw new TypeError('Illegal invocation');
    const url = String(input);
    requested.push(url);
    if (url.startsWith('https://www.dota2.com/datafeed/herolist')) return Response.json(HERO_LIST);
    if (url.endsWith('/renders/nevermore.mov')) return new Response('not found', { status: 404 });
    if (url.endsWith('/crops/nevermore.png')) throw new Error('Too many subrequests.');
    const body = `bytes of ${url.split('/apps/dota2/')[1]}`;
    // The CDN may answer a Worker without Content-Length (compressed, chunked): the size is measured.
    if (url.includes('/icons/')) return new Response(new Blob([body]).stream());
    return new Response(body, { headers: { 'content-length': String(body.length) } });
  } as typeof fetch;
}

function deps(fetchImpl: typeof fetch, clock = fakeClock()) {
  return {
    repo: createD1HeroAssetRepository(testDb()),
    storage: createR2HeroAssetStorage(testMediaBucket()),
    fetchImpl,
    clock,
    budget: { charge: () => undefined, remaining: () => 50 },
    reserve: 3,
    logger
  };
}

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN });
});

describe('hero assets', () => {
  it("lists heroes on the owner's check, copies queued files a batch per run, never asks Valve when idle", async () => {
    const requested: string[] = [];
    const clock = fakeClock();
    // Cron alone never fetches the hero list: nothing is listed, nothing is asked.
    expect(await mirrorHeroAssets(deps(fakeCdn(requested), clock))).toEqual({ stored: 0, missing: 0, failed: 0 });
    expect(requested).toEqual([]);

    const api = createApi({ clock, contentFetch: fakeCdn(requested) });
    const checked = dotaHeroAssetsSchema.parse(
      await (await api.request('/api/v1/dota/hero-assets/refresh', { method: 'POST' })).json()
    );
    // A name that is not a plain slug never becomes a path.
    expect(checked).toMatchObject({ total: 12, stored: 0 });
    expect(requested.filter((url) => url.includes('herolist'))).toHaveLength(1);

    const first = await mirrorHeroAssets(deps(fakeCdn(requested), clock));
    expect(first.stored + first.missing + first.failed).toBe(HERO_ASSETS_PER_TICK);
    expect(requested.some((url) => url.includes('evil'))).toBe(false);
    for (let run = 0; run < 2; run += 1) await mirrorHeroAssets(deps(fakeCdn(requested), clock));
    const list = dotaHeroAssetsSchema.parse(await (await api.request('/api/v1/dota/hero-assets')).json());
    // A failed call keeps the runtime's words, so the gallery says why.
    expect(list).toMatchObject({ total: 12, stored: 10, missing: 1, failed: 1 });
    expect(list.heroes[1]?.assets.find((asset) => asset.kind === 'crop')?.errorCode).toBe(
      'HERO_ASSET_FETCH: Too many subrequests.'
    );
    expect(list.heroes.map((hero) => hero.name)).toEqual(['Pudge', 'Shadow Fiend']);
    expect(list.heroes[1]?.assets.find((asset) => asset.kind === 'render_mov')?.status).toBe('missing');

    const file = await api.request('/api/v1/dota/hero-assets/pudge/render_webm');
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('video/webm');
    expect(await file.text()).toBe('bytes of videos/dota_react/heroes/renders/pudge.webm');
    const icon = await api.request('/api/v1/dota/hero-assets/pudge/icon');
    expect(await icon.text()).toBe('bytes of images/dota_react/heroes/icons/pudge.png');
    await expectError(await api.request('/api/v1/dota/hero-assets/nevermore/render_mov'), 404, 'NOT_FOUND');
    await expectError(await api.request('/api/v1/dota/hero-assets/..%2Fx/icon'), 400, 'VALIDATION_ERROR');

    // Nothing is due any more: a stored file is never copied again, a missing one waits for the owner's check.
    const before = requested.length;
    expect(await mirrorHeroAssets(deps(fakeCdn(requested), clock))).toEqual({
      stored: 0,
      missing: 0,
      failed: 0
    });
    expect(requested.length).toBe(before);
  });

  it('lets overlapping runs claim different files', async () => {
    const repo = createD1HeroAssetRepository(testDb());
    await repo.upsertHeroes([{ slug: 'pudge', id: 14, name: 'Pudge' }], 1_000);
    const [a, b] = await Promise.all([repo.claimDue(2_000, 3, 60_000), repo.claimDue(2_000, 3, 60_000)]);
    const keys = [...(a ?? []), ...(b ?? [])].map((row) => row.kind);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(6);
  });
});
