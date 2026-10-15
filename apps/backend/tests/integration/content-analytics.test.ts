import { contentAnalyticsOverviewSchema, contentItemDetailSchema, contentItemsPageSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  collectContentAnalytics,
  type ConfiguredSources,
  createD1ContentAnalyticsRepository,
  readContentAnalyticsOverview
} from '../../src/modules/content-analytics';
import type { Collection } from '../../src/modules/content-analytics/types';
import { ContentCollectError } from '../../src/modules/content-analytics/types';
import { createLogger } from '../../src/platform/logging/logger';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const logger = createLogger(() => undefined);

function telegramSource(collect: () => Promise<Collection>): ConfiguredSources {
  return {
    collectors: [
      { platform: 'telegram', handle: 'alexeev_x', profileUrl: 'https://t.me/alexeev_x', requests: 1, collect }
    ],
    handles: { telegram: { handle: 'alexeev_x', profileUrl: 'https://t.me/alexeev_x' } }
  };
}

function post(id: number, publishedAt: number, views: number) {
  return {
    externalId: String(id),
    title: `Пост ${id}`,
    url: `https://t.me/alexeev_x/${id}`,
    thumbnailUrl: null,
    publishedAt,
    views,
    likes: 3,
    comments: null,
    shares: null
  };
}

async function snapshotCount(itemId: string): Promise<number> {
  const row = await testDb()
    .prepare('SELECT COUNT(*) AS n FROM content_item_snapshots WHERE item_id = ?')
    .bind(itemId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN });
});

describe('content analytics collection', () => {
  it('collects a source once per interval, snapshots young items hourly and old ones daily', async () => {
    const clock = fakeClock();
    const repo = createD1ContentAnalyticsRepository(testDb());
    let views = 100;
    let calls = 0;
    const sources = telegramSource(async () => {
      calls += 1;
      return { followers: 836, items: [post(1, START - HOUR, views), post(2, START - 10 * DAY, 500)] };
    });
    const run = (manual = false) =>
      collectContentAnalytics({ repo, sources, clock, logger, requestId: 't', ...(manual ? { manual } : {}) });

    expect(await run()).toEqual({ collected: 1, failed: 0 });
    // An overlapping tick and a manual refresh right after both lose the claim.
    expect(await run()).toEqual({ collected: 0, failed: 0 });
    clock.advance(4 * 60_000);
    expect(await run(true)).toEqual({ collected: 0, failed: 0 });
    expect(calls).toBe(1);

    // An hour later: a new snapshot for the young post, none for the ten-day-old one.
    clock.advance(HOUR);
    views = 180;
    expect(await run()).toEqual({ collected: 1, failed: 0 });
    expect(await snapshotCount('telegram:1')).toBe(2);
    expect(await snapshotCount('telegram:2')).toBe(1);

    const overview = contentAnalyticsOverviewSchema.parse(await readContentAnalyticsOverview({ repo, sources, clock }));
    const telegram = overview.sources[0];
    expect(telegram).toMatchObject({ platform: 'telegram', state: 'ok', followers: 836, items7d: 1, views7d: 180 });
    expect(overview.sources.map((s) => s.state)).toEqual(['ok', 'not_configured', 'not_configured']);
    expect(overview.recent.map((i) => i.id)).toEqual(['telegram:1', 'telegram:2']);
  });

  it('stores a classified failure, keeps old data and retries sooner', async () => {
    const clock = fakeClock();
    const repo = createD1ContentAnalyticsRepository(testDb());
    let fail = false;
    const sources = telegramSource(async () => {
      if (fail) throw new ContentCollectError('TELEGRAM_PREVIEW_HTTP');
      return { followers: 836, items: [post(1, START - HOUR, 100)] };
    });
    await collectContentAnalytics({ repo, sources, clock, logger, requestId: 't' });
    fail = true;
    clock.advance(HOUR);
    expect(await collectContentAnalytics({ repo, sources, clock, logger, requestId: 't' })).toEqual({
      collected: 0,
      failed: 1
    });

    const overview = await readContentAnalyticsOverview({ repo, sources, clock });
    expect(overview.sources[0]).toMatchObject({ state: 'error', errorCode: 'TELEGRAM_PREVIEW_HTTP', followers: 836 });
    // «Обновить» right after the failure waits out the 5-minute gap instead of hitting the source again.
    clock.advance(60_000);
    expect(await collectContentAnalytics({ repo, sources, clock, logger, requestId: 't', manual: true })).toEqual({
      collected: 0,
      failed: 0
    });
    clock.advance(15 * 60_000);
    fail = false;
    expect(await collectContentAnalytics({ repo, sources, clock, logger, requestId: 't' })).toEqual({
      collected: 1,
      failed: 0
    });
  });
});

describe('content analytics routes', () => {
  it('serves the overview, a page of items and one item with its snapshots', async () => {
    const api = createApi({ clock: fakeClock() });
    const repo = createD1ContentAnalyticsRepository(testDb());
    const clock = fakeClock();
    await collectContentAnalytics({
      repo,
      sources: telegramSource(async () => ({
        followers: 10,
        items: [post(1, START - HOUR, 1), post(2, START - 2 * HOUR, 2), post(3, START - 3 * HOUR, 3)]
      })),
      clock,
      logger,
      requestId: 't'
    });

    const overview = await api.request('/api/v1/content-analytics');
    expect(overview.status).toBe(200);
    // This environment configures no source, so every platform reads as not configured.
    expect(contentAnalyticsOverviewSchema.parse(await overview.json()).sources.map((s) => s.state)).toEqual([
      'not_configured',
      'not_configured',
      'not_configured'
    ]);

    const first = contentItemsPageSchema.parse(
      await (await api.request('/api/v1/content-analytics/items?platform=telegram&limit=2')).json()
    );
    expect(first.items.map((i) => i.id)).toEqual(['telegram:1', 'telegram:2']);
    const second = contentItemsPageSchema.parse(
      await (
        await api.request(`/api/v1/content-analytics/items?platform=telegram&limit=2&cursor=${first.nextCursor}`)
      ).json()
    );
    expect(second).toMatchObject({ items: [{ id: 'telegram:3' }], nextCursor: null });

    const detail = contentItemDetailSchema.parse(
      await (await api.request(`/api/v1/content-analytics/items/${encodeURIComponent('telegram:1')}`)).json()
    );
    expect(detail.snapshots).toHaveLength(1);

    await expectError(await api.request('/api/v1/content-analytics/items/telegram%3A999'), 404, 'NOT_FOUND');
    await expectError(await api.request('/api/v1/content-analytics/items/bogus'), 400, 'VALIDATION_ERROR');
    await expectError(await api.request('/api/v1/content-analytics/items?cursor=zzz'), 400, 'VALIDATION_ERROR');
    await expectError(await api.request('/api/v1/content-analytics', { token: null }), 401, 'UNAUTHORIZED');
    const sync = await api.request('/api/v1/content-analytics/sync', { method: 'POST' });
    expect(sync.status).toBe(200);
  });
});
