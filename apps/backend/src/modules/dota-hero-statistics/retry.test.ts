import { describe, expect, it } from 'vitest';
import { retryDelayMs } from './index';

const MIN = 60_000;

// The retry bounds how often the Worker calls OpenDota outside the 6 h schedule.
describe('hero statistics retry after a transient failure', () => {
  it('backs off 5, 15, 45, 135 min and then leaves it to the schedule', () => {
    expect([1, 2, 3, 4].map((n) => retryDelayMs(n, 'DOTA_HERO_STATS_HTTP', 429))).toEqual([
      5 * MIN,
      15 * MIN,
      45 * MIN,
      135 * MIN
    ]);
    expect(retryDelayMs(5, 'DOTA_HERO_STATS_HTTP', 429)).toBeNull();
    expect(retryDelayMs(1, 'DOTA_HERO_STATS_HTTP', 503)).toBe(5 * MIN);
    expect(retryDelayMs(1, 'DOTA_HERO_STATS_FETCH', null)).toBe(5 * MIN);
  });

  it('never retries a permanent failure', () => {
    expect(retryDelayMs(1, 'DOTA_HERO_STATS_HTTP', 404)).toBeNull();
    expect(retryDelayMs(1, 'DOTA_HERO_STATS_SHAPE', null)).toBeNull();
    expect(retryDelayMs(0, 'DOTA_HERO_STATS_HTTP', 429)).toBeNull();
  });
});
