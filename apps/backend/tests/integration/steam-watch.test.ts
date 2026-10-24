import { autopublishActivitySchema, dotaIntelligenceSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createContainer, type Container } from '../../src/app/container';
import type { AiJob } from '../../src/app/bot/ai-job';
import { recordAutopublish } from '../../src/app/workflows/autopublish-log';
import { DOTA_APP_ID, FILES_DUE_MS, runSteamWatch } from '../../src/app/workflows/steam-watch';
import type { SteamAppInfo } from '../../src/integrations/steam-cm/steam-cm-client';
import type { GitHubRepoApi } from '../../src/integrations/github/github-api';
import { testDb } from '../helpers/db';
import { fakeTransport, makeTick, SENT } from '../helpers/dispatch';
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
import { count } from '../helpers/publishing';

// The early signal of a Dota build (owner, 24.10.2026: «мне нет смысла от сборки»): the first read is the baseline; a
// new public build posts nothing and tells nobody, it makes the game files be read every minute for an hour.

const HOUR = 60 * 60_000;
let api: Api;
let clock: FakeClock;
let container: Container;
let steam: SteamAppInfo[];

const app = (changeNumber: number, publicBuildId: string | null = null): SteamAppInfo => ({
  appId: DOTA_APP_ID,
  changeNumber,
  publicBuildId,
  publicTimeUpdated: null
});
const run = (read: () => Promise<SteamAppInfo[]> = async () => steam) =>
  runSteamWatch(
    container,
    { id: crypto.randomUUID(), kind: 'steam_watch', chatId: Number(OWNER_ID) },
    't',
    () => undefined,
    read
  );
const failing = () =>
  run(async () => {
    throw Object.assign(new Error('timeout'), { code: 'STEAM_CM_TIMEOUT' });
  });

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * 24 * HOUR });
  clock = fakeClock();
  api = createApi({ clock });
  container = createContainer({ DB: testDb(), MEDIA_BUCKET: testMediaBucket() }, { clock });
  steam = [app(100, '26139613')];
});

describe('the Steam watch', () => {
  it('posts nothing for a new build, and has the game files read for the next hour', async () => {
    await run();
    expect(await container.steamApps.filesDue(DOTA_APP_ID, clock.now())).toBe(false);
    steam = [app(101, '26185107')];
    await run();
    expect(await count('posts')).toBe(0);
    expect(await count('publications')).toBe(0);
    expect(await container.steamApps.filesDue(DOTA_APP_ID, clock.now())).toBe(true);
    expect(await container.steamApps.filesDue(DOTA_APP_ID, clock.now() + FILES_DUE_MS)).toBe(false);
  });

  it('a change without a new build, or a read that missed the build, starts nothing (QA 24.10.2026)', async () => {
    await run();
    steam = [app(101, null)];
    await run();
    expect(await container.steamApps.find(DOTA_APP_ID)).toMatchObject({ changeNumber: 101, buildId: '26139613' });
    steam = [app(102, '26139613')];
    await run();
    expect(await container.steamApps.filesDue(DOTA_APP_ID, clock.now())).toBe(false);
  });

  it('shows its last check in «Состояние лент»: a read is healthy, a failed one degraded with its code', async () => {
    const watches = async () => dotaIntelligenceSchema.parse(await (await api.request('/api/v1/dota')).json()).watches;
    expect(await watches()).toEqual([
      { key: 'steam_apps', lastAttemptAt: null, lastSuccessAt: null, health: 'unverified', lastError: null }
    ]);
    await run();
    expect(await watches()).toMatchObject([{ key: 'steam_apps', health: 'healthy', lastError: null }]);
    await failing();
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
    const alerts = () => count('content_alerts', `id LIKE 'watch-down:steam_apps:%'`);
    await failing();
    await failing();
    expect(await alerts()).toBe(0);
    await failing();
    expect(await alerts()).toBe(1);
    await failing();
    expect(await alerts()).toBe(1);
  });
});

describe('the game files after a new build', () => {
  it('are queued on every idle minute while due, and not once the hour is over', async () => {
    await run();
    steam = [app(101, '26185107')];
    await run();
    const sent: AiJob[] = [];
    const repo = {} as GitHubRepoApi;
    const tick = (minute: number) =>
      makeTick({
        clock,
        transport: fakeTransport(SENT),
        scheduledTime: START + minute * 60_000,
        tweak: (base) => ({
          ...base,
          gameFilesRepo: repo,
          aiJobs: {
            send: async (job) => {
              sent.push(job);
            }
          }
        })
      }).run();
    await tick(7);
    await tick(8);
    expect(sent.filter((job) => job.kind === 'game_files_watch')).toHaveLength(2);
    clock.advance(FILES_DUE_MS);
    await tick(9);
    expect(sent.filter((job) => job.kind === 'game_files_watch')).toHaveLength(2);
  });
});

describe('the studio record of the automatic publishing', () => {
  it('gives the count against the limit and the last 24 hours, newest first', async () => {
    const activity = async () =>
      autopublishActivitySchema.parse(await (await api.request('/api/v1/settings/autopublish/activity')).json());
    expect(await activity()).toMatchObject({ enabled: false, usedToday: 0, items: [] });
    await recordAutopublish(container, { source: 'event', title: 'Патч 7.41', outcome: 'published' });
    clock.advance(60_000);
    await recordAutopublish(container, { source: 'game_files', title: 'Находка', outcome: 'held', reason: 'link' });
    expect((await activity()).items).toMatchObject([
      { source: 'game_files', outcome: 'held', reason: 'link' },
      { source: 'event', outcome: 'published', reason: null }
    ]);
    clock.advance(25 * HOUR);
    expect((await activity()).items).toEqual([]);
  });
});
