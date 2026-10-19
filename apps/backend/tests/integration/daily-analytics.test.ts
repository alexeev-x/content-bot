import { beforeEach, describe, expect, it } from 'vitest';
import {
  collectContentAnalytics,
  type ConfiguredSources,
  createD1ContentAnalyticsRepository,
  readDailyAnalytics
} from '../../src/modules/content-analytics';
import type { Collection } from '../../src/modules/content-analytics/types';
import { ContentCollectError } from '../../src/modules/content-analytics/types';
import { createLogger } from '../../src/platform/logging/logger';
import { testDb } from '../helpers/db';
import { fakeClock, resetDb, START } from '../helpers/harness';

// The daily table from real collections in a migrated D1 (plan P4): readings taken by the collector, one as_of,
// a failed platform marked, never zeros.

const HOUR = 60 * 60_000;
const logger = createLogger(() => undefined);

function youtube(collect: () => Promise<Collection>): ConfiguredSources {
  return {
    collectors: [
      { platform: 'youtube', handle: 'alexeev', profileUrl: 'https://youtube.com/@alexeev', requests: 1, collect }
    ],
    handles: { youtube: { handle: 'alexeev', profileUrl: 'https://youtube.com/@alexeev' } },
    tiktok: null
  };
}

const video = (id: number, publishedAt: number, views: number, title = `Ролик ${id} | Учу фидить в доту`) => ({
  externalId: String(id),
  title,
  url: `https://youtube.com/shorts/${id}`,
  thumbnailUrl: null,
  publishedAt,
  views,
  likes: null,
  comments: null,
  shares: null
});

beforeEach(resetDb);

describe('daily analytics', () => {
  it('builds the YouTube rows from hourly readings and marks TikTok as not collected', async () => {
    const clock = fakeClock();
    const repo = createD1ContentAnalyticsRepository(testDb());
    let hour = 0;
    let fail = false;
    const sources = youtube(async () => {
      if (fail) throw new ContentCollectError('YOUTUBE_HTTP');
      // Seven videos a day apart: the oldest is out of the six; views grow by 100 an hour.
      return {
        followers: 1000,
        items: Array.from({ length: 7 }, (_, index) => video(index, START - (index + 1) * 24 * HOUR, 1000 + 100 * hour))
      };
    });
    for (hour = 0; hour <= 25; hour += 1) {
      await collectContentAnalytics({ repo, sources, clock, logger, requestId: 't' });
      clock.advance(HOUR);
    }
    clock.advance(-HOUR);

    const daily = await readDailyAnalytics({ repo, clock });
    expect(daily.asOf).toBe(clock.now());
    const [yt, tt] = daily.platforms;
    expect(yt?.state).toBe('ok');
    expect(yt?.rows.map((row) => row.id)).toEqual([0, 1, 2, 3, 4, 5].map((index) => `youtube:${index}`));
    // The newest video is read hourly: a real 24-hour pair, 100 views an hour.
    expect(yt?.rows[0]).toMatchObject({
      views: 1000 + 100 * 25,
      growth: { kind: 'day', views: 2400, hours: 24, viewsPerHour: 100 },
      shortTitle: 'Ролик 0',
      format: 'fidit',
      formatSource: 'title',
      status: 'ok'
    });
    // TikTok was never collected: no rows, and the report is partial instead of showing zeros.
    expect(tt).toMatchObject({ platform: 'tiktok', state: 'pending', rows: [] });
    expect(daily.partial).toBe(true);

    // A failed collection after the success marks the platform; the rows stay as the last readings.
    fail = true;
    clock.advance(HOUR);
    await collectContentAnalytics({ repo, sources, clock, logger, requestId: 't' });
    const afterFailure = await readDailyAnalytics({ repo, clock });
    expect(afterFailure.platforms[0]).toMatchObject({ state: 'error', errorCode: 'YOUTUBE_HTTP' });
    expect(afterFailure.platforms[0]?.rows[0]?.views).toBe(1000 + 100 * 25);
  });
});
