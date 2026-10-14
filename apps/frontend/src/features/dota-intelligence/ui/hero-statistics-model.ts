import type { DotaHeroStatisticDto, DotaHeroStatisticsDto } from '@alexeev/contracts';

export type Rank = 'all' | 'professional' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';
export type Sample = { picks: number; wins: number };
export type HeroRow = {
  heroId: number;
  name: string;
  winRate: number | null;
  games: number | null;
  pickRate: number | null;
  /** Percentage points against the previous snapshot; null when there is nothing comparable. */
  delta: number | null;
};

export const RANKS: ReadonlyArray<{ id: Rank; label: string }> = [
  { id: 'all', label: 'Все ранги' },
  { id: '1', label: 'Рекрут' },
  { id: '2', label: 'Страж' },
  { id: '3', label: 'Рыцарь' },
  { id: '4', label: 'Герой' },
  { id: '5', label: 'Легенда' },
  { id: '6', label: 'Властелин' },
  { id: '7', label: 'Божество' },
  { id: '8', label: 'Титан' },
  { id: 'professional', label: 'Про-сцена' }
];
// A delta over a handful of games is noise, not a trend.
const MINIMUM_DELTA_PICKS = 100;

function sampleFor(hero: DotaHeroStatisticDto, rank: Rank): Sample | null {
  if (rank === 'professional') {
    const { picks, wins } = hero.professional;
    return picks === null || wins === null ? null : { picks, wins };
  }
  const brackets = rank === 'all' ? Object.values(hero.ranked) : [hero.ranked[rank]];
  let picks = 0;
  let wins = 0;
  let known = false;
  for (const bracket of brackets) {
    if (!bracket || bracket.picks === null || bracket.wins === null) continue;
    picks += bracket.picks;
    wins += bracket.wins;
    known = true;
  }
  return known ? { picks, wins } : null;
}

const rate = (sample: Sample | null) => (sample && sample.picks > 0 ? (sample.wins / sample.picks) * 100 : null);

export function buildRows(
  latest: NonNullable<DotaHeroStatisticsDto['latest']>,
  previous: DotaHeroStatisticsDto['previous'],
  rank: Rank
): HeroRow[] {
  const samples = latest.heroes.map((hero) => ({ hero, sample: sampleFor(hero, rank) }));
  // Ten heroes are picked in every match, so the sum of picks / 10 is the number of matches.
  const matches = samples.reduce((sum, { sample }) => sum + (sample?.picks ?? 0), 0) / 10;
  const before = new Map(previous?.heroes.map((hero) => [hero.heroId, hero]));
  return samples.map(({ hero, sample }) => {
    const old = before.get(hero.heroId);
    const oldSample = old ? sampleFor(old, rank) : null;
    const comparable =
      sample && oldSample && sample.picks >= MINIMUM_DELTA_PICKS && oldSample.picks >= MINIMUM_DELTA_PICKS;
    const current = rate(sample);
    const oldRate = rate(oldSample);
    return {
      heroId: hero.heroId,
      name: hero.name,
      winRate: current,
      games: sample?.picks ?? null,
      pickRate: sample && matches > 0 ? (sample.picks / matches) * 100 : null,
      delta: comparable && current !== null && oldRate !== null ? current - oldRate : null
    };
  });
}

export type HeroSortKey = 'name' | 'winRate' | 'games' | 'pickRate' | 'delta';

export function sortRows(rows: HeroRow[], key: HeroSortKey, direction: 'ascending' | 'descending'): HeroRow[] {
  const sign = direction === 'ascending' ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (key === 'name') return sign * left.name.localeCompare(right.name, 'ru');
    const a = left[key];
    const b = right[key];
    // Missing values sink to the bottom whichever way the column is sorted.
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return sign * (a - b);
  });
}
