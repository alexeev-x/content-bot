import type { DotaHeroStatisticsDto } from '@alexeev/contracts';
import { describe, expect, it } from 'vitest';
import { buildRows, sortRows } from '../ui/hero-statistics-model';

const none = { picks: null, wins: null };
type Snapshot = NonNullable<DotaHeroStatisticsDto['latest']>;
const empty = { '3': none, '4': none, '5': none, '6': none, '7': none, '8': none };
const hero = (heroId: number, name: string, picks: number | null, wins: number | null) => ({
  heroId,
  name,
  // Only brackets 1 and 2 carry data; the rest are empty, like a hero nobody picked there.
  ranked: { '1': { picks, wins }, '2': { picks, wins }, ...empty },
  professional: { picks: null, wins: null, bans: null }
});
const snapshot = (heroes: Snapshot['heroes']): Snapshot => ({ observedAt: '2026-10-14T00:00:00.000Z', heroes });

describe('hero statistics rows', () => {
  it('sums ranked brackets for «Все ранги» and derives rates', () => {
    const [row] = buildRows(snapshot([hero(1, 'Axe', 1000, 520)]), null, 'all');
    expect(row).toMatchObject({ games: 2000, winRate: 52, delta: null });
  });

  it('computes the delta only when both snapshots have enough games', () => {
    const latest = snapshot([hero(1, 'Axe', 1000, 540), hero(2, 'Lina', 50, 30)]);
    const previous = snapshot([hero(1, 'Axe', 1000, 520), hero(2, 'Lina', 50, 20)]);
    const rows = buildRows(latest, previous, '1');
    expect(rows[0]?.delta).toBeCloseTo(2);
    expect(rows[1]?.delta).toBeNull();
  });

  it('keeps heroes without data at the bottom in both directions', () => {
    const rows = buildRows(snapshot([hero(1, 'Axe', null, null), hero(2, 'Lina', 100, 60)]), null, '1');
    expect(sortRows(rows, 'winRate', 'ascending').map((row) => row.name)).toEqual(['Lina', 'Axe']);
    expect(sortRows(rows, 'winRate', 'descending').map((row) => row.name)).toEqual(['Lina', 'Axe']);
  });
});
