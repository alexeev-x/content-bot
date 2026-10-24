import { autopublishActivitySchema, dotaIntelligenceSchema, ownerOperationsSettingsSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createContainer, type Container } from '../../src/app/container';
import { DOTA_APP_ID, DOTA_STAGING_APP_ID, runSteamWatch, steamChangePost } from '../../src/app/workflows/steam-watch';
import type { SteamAppInfo } from '../../src/integrations/steam-cm/steam-cm-client';
import { testDb } from '../helpers/db';
import {
  createApi,
  fakeClock,
  type Api,
  type FakeClock,
  OWNER_ID,
  OWNER_TOKEN,
  resetDb,
  seedSession,
  START
} from '../helpers/harness';
import { testMediaBucket } from '../helpers/media-bucket';
import { count, seedDestination } from '../helpers/publishing';

// The early signal of a Dota update (owner, 24.10.2026; migration 0108): the first read is the baseline, each change
// goes to the channel once by itself, a Staging post at most every 12 hours, and nothing goes out while the automatic
// publishing is off.

const HOUR = 60 * 60_000;
let api: Api;
let clock: FakeClock;
let container: Container;
let steam: SteamAppInfo[];
let errors: unknown[];

const app = (appId: number, changeNumber: number, publicBuildId: string | null = null): SteamAppInfo => ({
  appId,
  changeNumber,
  publicBuildId,
  publicTimeUpdated: null
});
// No bot token: an owner's note is not sent; the rows and publications show what happened.
const run = () =>
  runSteamWatch(
    container,
    { id: crypto.randomUUID(), kind: 'steam_watch', chatId: Number(OWNER_ID) },
    '',
    't',
    (error) => errors.push(error),
    async () => steam
  );

async function autopublish(enabled: boolean) {
  const destination = await seedDestination(api);
  const current = ownerOperationsSettingsSchema.parse(await (await api.request('/api/v1/settings/operations')).json());
  const response = await api.request('/api/v1/settings/operations', {
    method: 'PUT',
    json: {
      revision: current.revision,
      timezone: current.timezone,
      notifications: current.notifications,
      autopublish: { enabled, destinationId: destination.id, dailyLimit: 10 }
    }
  });
  expect(response.status).toBe(200);
}

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * 24 * HOUR });
  clock = fakeClock();
  api = createApi({ clock });
  errors = [];
  container = createContainer({ DB: testDb(), MEDIA_BUCKET: testMediaBucket() }, { clock });
  steam = [app(DOTA_APP_ID, 100, '26139613'), app(DOTA_STAGING_APP_ID, 50)];
});

describe('the Steam watch', () => {
  it('posts each change once by itself: Staging, then a new public build, never a stale or repeated read', async () => {
    await autopublish(true);
    await run();
    expect(await count('publications')).toBe(0);
    steam = [app(DOTA_APP_ID, 100, '26139613'), app(DOTA_STAGING_APP_ID, 52)];
    await run();
    await run();
    expect(await count('publications')).toBe(1);
    expect(await count('idempotency_keys', `key = 'autopublish:steam:${DOTA_STAGING_APP_ID}:52'`)).toBe(1);
    const body = await testDb().prepare('SELECT body, entities FROM posts').first<{ body: string; entities: string }>();
    expect(body?.body).toContain('Valve что-то готовит');
    expect(body?.entities).toContain('"language":"diff"');
    steam = [app(DOTA_APP_ID, 101, '26139700'), app(DOTA_STAGING_APP_ID, 52)];
    await run();
    expect(await count('publications')).toBe(2);
    // A stale read moves nothing back and posts nothing.
    steam = [app(DOTA_APP_ID, 100, '26139613'), app(DOTA_STAGING_APP_ID, 51)];
    await run();
    expect(await count('publications')).toBe(2);
    expect(errors).toEqual([]);
  });

  it('never posts a «new build» for a read that missed the build (QA 24.10.2026)', async () => {
    await autopublish(true);
    await run();
    steam = [app(DOTA_APP_ID, 101, null), app(DOTA_STAGING_APP_ID, 50)];
    await run();
    expect(await container.steamApps.find(DOTA_APP_ID)).toMatchObject({ changeNumber: 101, buildId: '26139613' });
    steam = [app(DOTA_APP_ID, 102, '26139613'), app(DOTA_STAGING_APP_ID, 50)];
    await run();
    expect(await count('publications')).toBe(0);
  });

  it('posts Staging at most once in 12 hours', async () => {
    await autopublish(true);
    await run();
    steam = [app(DOTA_APP_ID, 100, '26139613'), app(DOTA_STAGING_APP_ID, 52)];
    await run();
    clock.advance(HOUR);
    steam = [app(DOTA_APP_ID, 100, '26139613'), app(DOTA_STAGING_APP_ID, 53)];
    await run();
    expect(await count('publications')).toBe(1);
    clock.advance(12 * HOUR);
    steam = [app(DOTA_APP_ID, 100, '26139613'), app(DOTA_STAGING_APP_ID, 54)];
    await run();
    expect(await count('publications')).toBe(2);
  });

  it('shows its last check in «Состояние лент»: a read is healthy, a failed one degraded with its code', async () => {
    const watches = async () => dotaIntelligenceSchema.parse(await (await api.request('/api/v1/dota')).json()).watches;
    expect(await watches()).toEqual([
      { key: 'steam_apps', lastAttemptAt: null, lastSuccessAt: null, health: 'unverified', lastError: null }
    ]);
    await run();
    expect(await watches()).toMatchObject([{ key: 'steam_apps', health: 'healthy', lastError: null }]);
    await runSteamWatch(
      container,
      { id: crypto.randomUUID(), kind: 'steam_watch', chatId: Number(OWNER_ID) },
      '',
      't',
      () => undefined,
      async () => {
        throw Object.assign(new Error('timeout'), { code: 'STEAM_CM_TIMEOUT' });
      }
    );
    expect(await watches()).toMatchObject([
      {
        key: 'steam_apps',
        health: 'degraded',
        lastSuccessAt: new Date(START).toISOString(),
        lastError: { code: 'STEAM_CM_TIMEOUT', consecutiveFailures: 1 }
      }
    ]);
  });

  it('tells the owner once when three runs in a row failed (review 24.10.2026)', async () => {
    const failing = () =>
      runSteamWatch(
        container,
        { id: crypto.randomUUID(), kind: 'steam_watch', chatId: Number(OWNER_ID) },
        '',
        't',
        () => undefined,
        async () => {
          throw Object.assign(new Error('timeout'), { code: 'STEAM_CM_TIMEOUT' });
        }
      );
    const alerts = () => count('content_alerts', `id LIKE 'watch-down:steam_apps:%'`);
    await failing();
    await failing();
    expect(await alerts()).toBe(0);
    await failing();
    expect(await alerts()).toBe(1);
    await failing();
    expect(await alerts()).toBe(1);
  });

  it('shows in the studio what went out by itself and what was held, with the count against the limit', async () => {
    const activity = async () =>
      autopublishActivitySchema.parse(await (await api.request('/api/v1/settings/autopublish/activity')).json());
    await autopublish(true);
    expect(await activity()).toMatchObject({ enabled: true, dailyLimit: 10, usedToday: 0, items: [] });
    await run();
    steam = [app(DOTA_APP_ID, 100, '26139613'), app(DOTA_STAGING_APP_ID, 52)];
    await run();
    expect(await activity()).toMatchObject({
      usedToday: 1,
      items: [{ source: 'steam', outcome: 'published', reason: null }]
    });
    await autopublish(false);
    clock.advance(60_000);
    steam = [app(DOTA_APP_ID, 101, '26139700'), app(DOTA_STAGING_APP_ID, 52)];
    await run();
    const after = await activity();
    expect(after.enabled).toBe(false);
    expect(after.items[0]).toMatchObject({ source: 'steam', outcome: 'held', reason: 'off' });
  });

  it('publishes nothing while the automatic publishing is off', async () => {
    await autopublish(false);
    await run();
    steam = [app(DOTA_APP_ID, 101, '26139700'), app(DOTA_STAGING_APP_ID, 52)];
    await run();
    expect(await count('publications')).toBe(0);
    expect(await count('posts')).toBe(0);
  });
});

describe('the post of a change', () => {
  it('tells a Staging change and a new public build of Dota 2 with the numbers as a diff, and nothing else', () => {
    expect(steamChangePost({ changeNumber: 50, buildId: null }, app(DOTA_STAGING_APP_ID, 52))).toContain(
      '- "Dota 2 Staging" "50"\n+ "Dota 2 Staging" "52"'
    );
    expect(steamChangePost({ changeNumber: 100, buildId: '1' }, app(DOTA_APP_ID, 101, '2'))).toContain(
      '- "buildid" "1"\n+ "buildid" "2"'
    );
    expect(steamChangePost({ changeNumber: 100, buildId: '1' }, app(DOTA_APP_ID, 101, '1'))).toBeNull();
  });
});
