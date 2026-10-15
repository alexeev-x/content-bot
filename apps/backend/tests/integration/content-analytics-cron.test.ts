import { beforeEach, describe, expect, it } from 'vitest';
import type { ContentCollector } from '../../src/modules/content-analytics/types';
import { fakeTransport, makeTick, tickCount } from '../helpers/dispatch';
import { fakeClock, resetDb } from '../helpers/harness';

// Minute 3 of an hour: the tick that collects content analytics.
const MINUTE_3 = Date.UTC(2026, 9, 15, 13, 3, 0);

function collector(platform: ContentCollector['platform'], requests: number, calls: string[]): ContentCollector {
  return {
    platform,
    handle: platform,
    profileUrl: `https://example.test/${platform}`,
    requests,
    collect: async () => {
      calls.push(platform);
      return { followers: 1, items: [] };
    }
  };
}

beforeEach(async () => {
  await resetDb();
});

describe('content analytics on the Cron tick', () => {
  // Regression: the step waited for the whole three-source budget (45 of 50 subrequests), which an idle tick
  // never had left, so Cron never collected and only the owner's «Обновить» did.
  it('collects what fits an idle tick and defers the rest to the next minute-3 tick', async () => {
    const calls: string[] = [];
    const sources = {
      collectors: [collector('telegram', 5, calls), collector('youtube', 9, calls), collector('tiktok', 7, calls)],
      handles: {},
      tiktok: null
    };
    const first = makeTick({
      clock: fakeClock(MINUTE_3),
      scheduledTime: MINUTE_3,
      transport: fakeTransport(),
      tweak: (container) => ({ ...container, contentSources: sources }) as typeof container
    });
    await first.run();
    expect(tickCount(first, 'contentCollected')).toBeGreaterThanOrEqual(1);
    expect(tickCount(first, 'contentCollected') + tickCount(first, 'contentDeferred')).toBe(3);
    expect(first.container.queryBudget.remaining()).toBeGreaterThanOrEqual(0);

    const next = MINUTE_3 + 10 * 60_000;
    const second = makeTick({
      clock: fakeClock(next),
      scheduledTime: next,
      transport: fakeTransport(),
      tweak: (container) => ({ ...container, contentSources: sources }) as typeof container
    });
    await second.run();
    expect([...calls].sort()).toEqual(['telegram', 'tiktok', 'youtube']);
  });
});
