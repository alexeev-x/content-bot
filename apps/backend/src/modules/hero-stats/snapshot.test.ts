import { describe, expect, it } from 'vitest';
import type { StatsRow } from './d1-hero-stats';
import { snapshotData, wilson } from './snapshot';

// The statistics a post will print: a wrong interval, a credited late item or a matchup sign would mislead the channel.

const row = (won: boolean, overrides: Partial<StatsRow> = {}): StatsRow => ({
  matchId: 1,
  heroId: 5,
  position: 5,
  startedAt: 0,
  patch: 190,
  tracked: false,
  won,
  minutes: 40,
  bracket: 8,
  topPlayers: 0,
  lane: null,
  kills: 1,
  deaths: 5,
  assists: 15,
  gpm: 300,
  xpm: 400,
  damage: 9000,
  nw10: 2000,
  allies: '1:1,2:2,3:3,4:4',
  enemies: '6:1,7:2,8:3,9:4,10:5',
  detail: { i: [], n: null, p: [], s: [] },
  ...overrides
});

describe('wilson', () => {
  it.each([
    [50, 100, 0.404, 0.596],
    [0, 10, 0, 0.278],
    [1000, 2000, 0.478, 0.522]
  ])('%i of %i', (wins, games, lo, hi) => {
    const interval = wilson(wins, games);
    expect(interval.lo).toBeCloseTo(lo, 2);
    expect(interval.hi).toBeCloseTo(hi, 2);
  });
});

describe('snapshotData', () => {
  it('skips followed players in the win rate but counts their picks and builds', () => {
    const rows = [row(true, { tracked: true }), row(true), row(false)];
    const data = snapshotData(rows, 5, 5, 'all', new Map());
    expect(data).toMatchObject({ n: 2, w: 1, picks: 3 });
  });

  it('gives an item no credit for long games: the effect compares games that lasted to its minute', () => {
    // Blink (1) at minute 20 in every long game; every game past 20 minutes is won whether or not it was bought.
    const rows = [
      ...Array.from({ length: 40 }, () => row(true, { minutes: 45, detail: { i: [], n: null, p: [[1, 20]], s: [] } })),
      ...Array.from({ length: 40 }, () => row(true, { minutes: 45 })),
      ...Array.from({ length: 40 }, () => row(false, { minutes: 15 }))
    ];
    const data = snapshotData(rows, 5, 5, 'all', new Map());
    const blink = data.items.find((item) => item.id === 1);
    expect(blink).toMatchObject({ median: 20, buyers: 40, wr: 1 });
    expect(blink?.effect).toBe(0);
  });

  it('a matchup is measured against what both base rates expect', () => {
    // Against hero 6 at pos 1 the hero wins 60%; hero 6 itself loses 60% of its games, so 60% is just expected.
    const rows = Array.from({ length: 50 }, (_, index) => row(index < 30));
    const base = new Map([
      ['all:5:5', { n: 1000, w: 500 }],
      ['all:6:1', { n: 1000, w: 400 }]
    ]);
    const enemy = snapshotData(rows, 5, 5, 'all', base).enemies.find((pair) => pair.h === 6);
    expect(enemy?.n).toBe(50);
    expect(Math.abs(enemy?.delta ?? 99)).toBeLessThan(1);
  });
});
