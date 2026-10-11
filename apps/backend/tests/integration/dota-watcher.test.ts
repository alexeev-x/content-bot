import { beforeEach, describe, expect, it } from 'vitest';
import { createContainer, type Container } from '../../src/app/container';
import { handleScheduled } from '../../src/app/scheduled';
import { createOfficialDotaFetcher, type DotaSourceFetcher, type DotaSourceKey } from '../../src/modules/dota';
import { createLogger } from '../../src/platform/logging/logger';
import { testDb } from '../helpers/db';
import { fakeClock, type FakeClock, START } from '../helpers/harness';

const steamItem = (gid: string, feedname = 'steam_community_announcements') => ({
  gid,
  title: `Official update ${gid}`,
  url: `https://store.steampowered.com/news/externalpost/${feedname}/${gid}`,
  date: 1_800_000_000,
  feedname,
  is_external_url: true,
  author: 'Valve',
  contents: 'bounded content',
  feedlabel: 'Community Announcements',
  feed_type: 1,
  tags: null
});

const steamPayload = (...newsitems: ReturnType<typeof steamItem>[]) => ({
  appnews: { appid: 570, count: newsitems.length, newsitems }
});

const patchPayload = (...patches: { patch_number: string; patch_name: string; patch_timestamp: number }[]) => ({
  success: true,
  patches
});

function scriptedFetcher(input: {
  steam?: unknown | Error;
  patches?: unknown | Error;
  calls?: DotaSourceKey[];
}): DotaSourceFetcher {
  return {
    async fetchPatchDetails(version) {
      return Response.json({ patch_number: version, patch_name: version, heroes: [] });
    },
    async fetchPatchNameMaps() {
      return { heroes: new Map(), items: new Map() };
    },
    async fetch(source) {
      input.calls?.push(source);
      const value = source === 'steam_news' ? input.steam : input.patches;
      if (value instanceof Error) throw value;
      return Response.json(value ?? (source === 'steam_news' ? steamPayload() : patchPayload()));
    }
  };
}

async function clearDotaTables(): Promise<void> {
  await testDb().batch([
    testDb().prepare('DELETE FROM dota_update_items'),
    testDb().prepare('DELETE FROM dota_source_state')
  ]);
}

describe('official patch name maps', () => {
  it('uses the fixed Valve dictionaries once per fetcher and returns keyed names', async () => {
    const calls: string[] = [];
    const fetcher = createOfficialDotaFetcher(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/herolist?')) {
        return Response.json({ result: { data: { heroes: [{ id: 1, name_english_loc: 'Test Hero' }] } } });
      }
      return Response.json({ result: { data: { itemabilities: [{ id: 10, name_english_loc: 'Test Item' }] } } });
    });

    const [first, second] = await Promise.all([fetcher.fetchPatchNameMaps(), fetcher.fetchPatchNameMaps()]);

    expect(first.heroes.get(1)).toBe('Test Hero');
    expect(first.items.get(10)).toBe('Test Item');
    expect(second).toBe(first);
    expect(calls).toHaveLength(2);
    expect(calls.every((url) => url.startsWith('https://www.dota2.com/datafeed/'))).toBe(true);
  });
});

function makeWatcherTick(input: { clock: FakeClock; fetcher: DotaSourceFetcher; scheduledTime: number }): {
  run(): Promise<void>;
  logs: Record<string, unknown>[];
  container: Container;
} {
  const logs: Record<string, unknown>[] = [];
  const base = createContainer(
    { DB: testDb(), PUBLISHING_ENABLED: 'false', TELEGRAM_BOT_TOKEN: '123456:TEST-BOT-TOKEN-PLACEHOLDER' },
    { clock: input.clock, dotaFetcher: input.fetcher }
  );
  const container = { ...base, logger: createLogger((line) => logs.push(JSON.parse(line) as Record<string, unknown>)) };
  const controller = { cron: '* * * * *', scheduledTime: input.scheduledTime } as ScheduledController;
  return { container, logs, run: () => handleScheduled(controller, container) };
}

async function storedItems(): Promise<{ source_key: string; external_id: string; is_baseline: number }[]> {
  const result = await testDb()
    .prepare('SELECT source_key, external_id, is_baseline FROM dota_update_items ORDER BY source_key, external_id')
    .all<{ source_key: string; external_id: string; is_baseline: number }>();
  return result.results;
}

let clock: FakeClock;
const WATCHER_START = START + 5 * 60_000;

beforeEach(async () => {
  await clearDotaTables();
  clock = fakeClock();
});

describe('Dota source watcher', () => {
  it('seeds existing official records as baseline for both feeds on the first successful sync', async () => {
    const tick = makeWatcherTick({
      clock,
      scheduledTime: WATCHER_START,
      fetcher: scriptedFetcher({
        steam: steamPayload(steamItem('steam-1'), steamItem('third-party-1', 'playground')),
        patches: patchPayload({ patch_number: '7.41', patch_name: '7.41', patch_timestamp: 1_800_000_000 })
      })
    });

    await tick.run();

    expect(await storedItems()).toEqual([
      { source_key: 'patch_notes', external_id: '7.41', is_baseline: 1 },
      { source_key: 'steam_news', external_id: 'steam-1', is_baseline: 1 }
    ]);
    const states = await testDb()
      .prepare('SELECT source_key, baseline_seeded FROM dota_source_state ORDER BY source_key')
      .all();
    expect(states.results).toEqual([
      { source_key: 'patch_notes', baseline_seeded: 1 },
      { source_key: 'steam_news', baseline_seeded: 1 }
    ]);
    expect(tick.logs.find((event) => event.operation === 'tick')).toMatchObject({
      status: 'ok',
      counts: { dotaFeedsFetched: 2, dotaItemsInserted: 2 }
    });
  });

  it('accepts the current official Steam Dota announcement URL format with an exact gid path', async () => {
    const news = steamItem('533247947228316765');
    news.url = `https://store.steampowered.com/news/app/570/view/${news.gid}`;
    const tick = makeWatcherTick({
      clock,
      scheduledTime: WATCHER_START,
      fetcher: scriptedFetcher({ steam: steamPayload(news), patches: patchPayload() })
    });

    await tick.run();

    expect(await storedItems()).toContainEqual({
      source_key: 'steam_news',
      external_id: '533247947228316765',
      is_baseline: 1
    });
  });

  it.each([
    'https://store.steampowered.com.evil/news/app/570/view/533247947228316765',
    'https://store.steampowered.com/news/app/570/view/533247947228316765-extra'
  ])('rejects a non-official host or a non-exact gid path (%s)', async (url) => {
    const news = steamItem('533247947228316765');
    news.url = url;
    const tick = makeWatcherTick({
      clock,
      scheduledTime: WATCHER_START,
      fetcher: scriptedFetcher({ steam: steamPayload(news), patches: patchPayload() })
    });

    await expect(tick.run()).rejects.toThrow('SCHEDULED_TICK_FAILED');
    expect(await storedItems()).toEqual([]);
  });

  it('marks only announcements discovered after baseline as new', async () => {
    const baseline = makeWatcherTick({
      clock,
      scheduledTime: WATCHER_START,
      fetcher: scriptedFetcher({
        steam: steamPayload(steamItem('old')),
        patches: patchPayload({ patch_number: '7.40', patch_name: '7.40', patch_timestamp: 1_799_000_000 })
      })
    });
    await baseline.run();

    const next = makeWatcherTick({
      clock,
      scheduledTime: WATCHER_START + 5 * 60_000,
      fetcher: scriptedFetcher({
        steam: steamPayload(steamItem('old'), steamItem('new')),
        patches: patchPayload(
          { patch_number: '7.40', patch_name: '7.40', patch_timestamp: 1_799_000_000 },
          { patch_number: '7.41', patch_name: '7.41', patch_timestamp: 1_800_000_000 }
        )
      })
    });
    await next.run();

    expect(await storedItems()).toEqual([
      { source_key: 'patch_notes', external_id: '7.40', is_baseline: 1 },
      { source_key: 'patch_notes', external_id: '7.41', is_baseline: 0 },
      { source_key: 'steam_news', external_id: 'new', is_baseline: 0 },
      { source_key: 'steam_news', external_id: 'old', is_baseline: 1 }
    ]);
  });

  it('deduplicates repeated scheduled times and overlapping Cron invocations', async () => {
    const payload = {
      steam: steamPayload(steamItem('same')),
      patches: patchPayload({ patch_number: '7.41', patch_name: '7.41', patch_timestamp: 1_800_000_000 })
    };
    await makeWatcherTick({ clock, scheduledTime: WATCHER_START, fetcher: scriptedFetcher(payload) }).run();
    const repeated = makeWatcherTick({ clock, scheduledTime: WATCHER_START, fetcher: scriptedFetcher(payload) });
    await repeated.run();
    expect(repeated.logs.find((event) => event.operation === 'tick')).toMatchObject({
      counts: { dotaItemsInserted: 0 }
    });

    await Promise.all([
      makeWatcherTick({ clock, scheduledTime: WATCHER_START + 5 * 60_000, fetcher: scriptedFetcher(payload) }).run(),
      makeWatcherTick({ clock, scheduledTime: WATCHER_START + 5 * 60_000, fetcher: scriptedFetcher(payload) }).run()
    ]);
    expect(await storedItems()).toHaveLength(2);
  });

  it('keeps the healthy feed when the other source fails', async () => {
    const tick = makeWatcherTick({
      clock,
      scheduledTime: WATCHER_START,
      fetcher: scriptedFetcher({
        steam: steamPayload(steamItem('must-not-insert')),
        patches: new Error('network failure')
      })
    });

    await expect(tick.run()).rejects.toThrow('SCHEDULED_TICK_FAILED');
    expect(await storedItems()).toEqual([{ source_key: 'steam_news', external_id: 'must-not-insert', is_baseline: 1 }]);
    expect(tick.logs).toContainEqual(expect.objectContaining({ operation: 'source_sync', status: 'partial' }));
  });

  it('fails the Cron tick on malformed source shape while preserving the other feed', async () => {
    const malformed = {
      ...patchPayload({ patch_number: '7.41', patch_name: '7.41', patch_timestamp: 1_800_000_000 }),
      extra: true
    };
    const tick = makeWatcherTick({
      clock,
      scheduledTime: WATCHER_START,
      fetcher: scriptedFetcher({ steam: steamPayload(steamItem('must-not-insert')), patches: malformed })
    });

    await expect(tick.run()).rejects.toThrow('SCHEDULED_TICK_FAILED');
    expect(await storedItems()).toEqual([{ source_key: 'steam_news', external_id: 'must-not-insert', is_baseline: 1 }]);
    expect(tick.logs).toContainEqual(
      expect.objectContaining({ operation: 'source_sync', errorCode: 'DOTA_SOURCE_PARTIAL_FAILURE', status: 'partial' })
    );
  });

  it('rejects failed feed HTTP and body-limit outcomes while saving the other feed', async () => {
    const failedStatus = makeWatcherTick({
      clock,
      scheduledTime: WATCHER_START,
      fetcher: {
        async fetchPatchDetails(version) {
          return Response.json({ patch_number: version, patch_name: version, heroes: [] });
        },
        async fetchPatchNameMaps() {
          return { heroes: new Map(), items: new Map() };
        },
        async fetch(source) {
          return source === 'steam_news'
            ? Response.json(steamPayload(steamItem('must-not-insert')))
            : new Response('unavailable', { status: 503 });
        }
      }
    });
    await expect(failedStatus.run()).rejects.toThrow('SCHEDULED_TICK_FAILED');
    expect(await storedItems()).toEqual([{ source_key: 'steam_news', external_id: 'must-not-insert', is_baseline: 1 }]);

    const oversized = makeWatcherTick({
      clock,
      scheduledTime: WATCHER_START,
      fetcher: {
        async fetchPatchDetails(version) {
          return Response.json({ patch_number: version, patch_name: version, heroes: [] });
        },
        async fetchPatchNameMaps() {
          return { heroes: new Map(), items: new Map() };
        },
        async fetch(source) {
          return source === 'steam_news'
            ? new Response('x'.repeat(512 * 1024 + 1))
            : Response.json(patchPayload({ patch_number: '7.41', patch_name: '7.41', patch_timestamp: 1_800_000_000 }));
        }
      }
    });
    await expect(oversized.run()).rejects.toThrow('SCHEDULED_TICK_FAILED');
    expect(await storedItems()).toEqual([
      { source_key: 'patch_notes', external_id: '7.41', is_baseline: 1 },
      { source_key: 'steam_news', external_id: 'must-not-insert', is_baseline: 1 }
    ]);
    expect(oversized.logs).toContainEqual(
      expect.objectContaining({ operation: 'source_sync', errorCode: 'DOTA_SOURCE_PARTIAL_FAILURE', status: 'partial' })
    );
  });

  it('polls only on exact five-minute UTC boundaries', async () => {
    const calls: DotaSourceKey[] = [];
    const fetcher = scriptedFetcher({ calls, steam: steamPayload(), patches: patchPayload() });
    const offBoundary = makeWatcherTick({ clock, scheduledTime: WATCHER_START + 60_000, fetcher });
    await offBoundary.run();
    expect(calls).toEqual([]);

    const onBoundary = makeWatcherTick({ clock, scheduledTime: WATCHER_START + 5 * 60_000, fetcher });
    await onBoundary.run();
    expect(calls).toEqual(['steam_news', 'patch_notes']);
  });

  it('uses only the hard-coded official hosts with an abort timeout', async () => {
    const calls: { url: string; signal: AbortSignal | null }[] = [];
    const fetcher = createOfficialDotaFetcher(async (input, init) => {
      calls.push({ url: String(input), signal: init?.signal ?? null });
      return Response.json({});
    });
    await fetcher.fetch('steam_news');
    await fetcher.fetch('patch_notes');

    expect(calls.map((call) => new URL(call.url).hostname)).toEqual(['api.steampowered.com', 'www.dota2.com']);
    expect(calls.every((call) => call.signal instanceof AbortSignal)).toBe(true);
  });
});
