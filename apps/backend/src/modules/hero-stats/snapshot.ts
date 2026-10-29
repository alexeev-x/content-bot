import type { Band, SnapshotRow, Span, StatsRow } from './d1-hero-stats';
import { TOP_BAND_MIN } from './d1-hero-stats';

// The nightly snapshot of one hero (plan §3, reviewed 29.10.2026). Win rates skip the followed players' own rows:
// they win more than their lobby (probe: +2.4 pp), so counting them would flatter their heroes. What is bought and
// when counts every row (the build does not depend on who won). An item's effect compares only games that lasted to
// its usual minute: buyers by then against those without it, so late items are not credited with long games.

const DAY_MS = 86_400_000;
export const SPANS: { span: Span; days: number | null }[] = [
  { span: 'd8', days: 8 },
  { span: 'd14', days: 14 },
  { span: 'patch', days: null }
];
const BAND_LIST: Band[] = ['all', 'immortal', 'top'];
/** Pairs below this many games are left out of the matchups (their delta is noise). */
export const PAIR_MIN = 20;
/** Items bought in fewer than this share of games are left out. */
const ITEM_SHARE_MIN = 0.02;
const ITEMS_MAX = 40;
/** Games on each side of an item's effect below which it is not given (reviewed 29.10.2026: ≥ 30 per bucket). */
const EFFECT_MIN = 30;
const STARTS_MAX = 6;
const NEUTRALS_MAX = 12;
const SKILL_LEVELS = 10;
const DURATION_EDGES = [25, 35, 45, 55];

export interface Rate {
  n: number;
  w: number;
}

export interface SnapshotData {
  /** Untracked games and wins with the Wilson 95% interval of the win rate. */
  n: number;
  w: number;
  lo: number;
  hi: number;
  /** Every row, followed players included (the pick count). */
  picks: number;
  /** Win rate by game length: games up to `to` minutes (the last bucket is open). */
  duration: { to: number | null; n: number; w: number }[];
  lane: { n: number; won: number; even: number; lost: number };
  median: {
    kills: number | null;
    deaths: number | null;
    assists: number | null;
    gpm: number | null;
    xpm: number | null;
    nw10: number | null;
  };
  items: {
    id: number;
    buyers: number;
    share: number;
    median: number;
    p25: number;
    p75: number;
    /** Untracked buyers' win rate. */
    wr: number | null;
    /** Win-rate points of buying it by its median minute, among games that lasted that long. */
    effect: number | null;
    effectN: number;
  }[];
  starts: { items: number[]; n: number; w: number }[];
  skills: { order: number[]; n: number; share: number } | null;
  neutrals: { id: number; n: number; w: number }[];
  /** Teammates and opponents as «hero:position», observed win rate against the one expected from base rates. */
  allies: { h: number; p: number; n: number; w: number; delta: number }[];
  enemies: { h: number; p: number; n: number; w: number; delta: number }[];
}

/** Wilson score interval at 95%. */
export function wilson(wins: number, games: number): { lo: number; hi: number } {
  if (games === 0) return { lo: 0, hi: 1 };
  const z = 1.96;
  const p = wins / games;
  const denominator = 1 + (z * z) / games;
  const centre = p + (z * z) / (2 * games);
  const margin = z * Math.sqrt((p * (1 - p)) / games + (z * z) / (4 * games * games));
  return { lo: Math.max(0, (centre - margin) / denominator), hi: Math.min(1, (centre + margin) / denominator) };
}

/** The value at quantile `q` of sorted numbers (nearest rank). */
export function quantile(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] ?? null;
}

const median = (values: (number | null)[]) =>
  quantile(
    values.filter((value): value is number => value !== null).sort((a, b) => a - b),
    0.5
  );

const logit = (p: number) => Math.log(p / (1 - p));
const logistic = (x: number) => 1 / (1 + Math.exp(-x));
/** A base rate kept away from 0 and 1 so its log-odds stay finite. */
const bounded = (rate: Rate | undefined) =>
  rate === undefined || rate.n === 0 ? 0.5 : Math.min(0.99, Math.max(0.01, (rate.w + 1) / (rate.n + 2)));

export function inBand(row: StatsRow, band: Band): boolean {
  if (band === 'immortal') return row.bracket >= 8;
  if (band === 'top') return row.topPlayers >= TOP_BAND_MIN;
  return row.bracket >= 7;
}

const slots = (text: string) =>
  text
    .split(',')
    .map((each) => each.split(':').map(Number) as [number, number])
    .filter(([hero, position]) => Number.isInteger(hero) && hero > 0 && position >= 1 && position <= 5);

/** The data of one hero at one position over one set of rows (already cut to a band and a span). */
export function snapshotData(
  rows: readonly StatsRow[],
  heroId: number,
  position: number,
  band: Band,
  base: ReadonlyMap<string, Rate>
): SnapshotData {
  const fair = rows.filter((row) => !row.tracked);
  const wins = fair.filter((row) => row.won).length;
  const { lo, hi } = wilson(wins, fair.length);

  const duration = [...DURATION_EDGES, null].map((to, index) => {
    const from = index === 0 ? 0 : (DURATION_EDGES[index - 1] ?? 0);
    const games = fair.filter((row) => row.minutes > from && (to === null || row.minutes <= to));
    return { to, n: games.length, w: games.filter((row) => row.won).length };
  });

  const laned = fair.filter((row) => row.lane !== null);
  const lane = {
    n: laned.length,
    won: laned.filter((row) => row.lane === 1).length,
    even: laned.filter((row) => row.lane === 0).length,
    lost: laned.filter((row) => row.lane === -1).length
  };

  // Items: the first purchase minute of each item per game, computed once (the starting set, minute < 0, apart).
  const firstBuys = rows.map((row) => {
    const first = new Map<number, number>();
    for (const [item, minute] of row.detail.p) if (minute >= 0 && !first.has(item)) first.set(item, minute);
    return first;
  });
  const buyMinutes = new Map<number, number[]>();
  firstBuys.forEach((buys) => {
    for (const [item, minute] of buys) {
      const list = buyMinutes.get(item);
      if (list === undefined) buyMinutes.set(item, [minute]);
      else list.push(minute);
    }
  });
  const items: SnapshotData['items'] = [];
  for (const [id, minutes] of buyMinutes) {
    if (minutes.length / rows.length < ITEM_SHARE_MIN) continue;
    minutes.sort((a, b) => a - b);
    const at = quantile(minutes, 0.5) ?? 0;
    // One pass over the fair games: buyers' wins, and among games that lasted past the median minute, bought by
    // then against not bought by then.
    const counts = { buyers: 0, buyerWins: 0, by: 0, byWins: 0, without: 0, withoutWins: 0 };
    rows.forEach((row, index) => {
      if (row.tracked) return;
      const minute = firstBuys[index]?.get(id);
      if (minute !== undefined) {
        counts.buyers += 1;
        if (row.won) counts.buyerWins += 1;
      }
      if (row.minutes <= at) return;
      if (minute !== undefined && minute <= at) {
        counts.by += 1;
        if (row.won) counts.byWins += 1;
      } else {
        counts.without += 1;
        if (row.won) counts.withoutWins += 1;
      }
    });
    items.push({
      id,
      buyers: minutes.length,
      share: minutes.length / rows.length,
      median: at,
      p25: quantile(minutes, 0.25) ?? at,
      p75: quantile(minutes, 0.75) ?? at,
      wr: counts.buyers === 0 ? null : counts.buyerWins / counts.buyers,
      effect:
        counts.by < EFFECT_MIN || counts.without < EFFECT_MIN
          ? null
          : (counts.byWins / counts.by - counts.withoutWins / counts.without) * 100,
      effectN: Math.min(counts.by, counts.without)
    });
  }
  items.sort((a, b) => b.share - a.share);

  const startCounts = new Map<string, Rate & { items: number[] }>();
  // Starting sets: counted on the fair rows, so their win rates are not pulled down by uncounted wins.
  for (const row of fair) {
    const set = row.detail.p
      .filter(([, minute]) => minute < 0)
      .map(([item]) => item)
      .sort((a, b) => a - b);
    if (set.length === 0) continue;
    const key = set.join(',');
    const known = startCounts.get(key) ?? { items: set, n: 0, w: 0 };
    known.n += 1;
    if (row.won) known.w += 1;
    startCounts.set(key, known);
  }

  const orders = new Map<string, number>();
  for (const row of rows) {
    const order = row.detail.s.slice(0, SKILL_LEVELS);
    if (order.length < SKILL_LEVELS) continue;
    const key = order.join(',');
    orders.set(key, (orders.get(key) ?? 0) + 1);
  }
  const topOrder = [...orders.entries()].sort((a, b) => b[1] - a[1])[0];
  const ordered = [...orders.values()].reduce((sum, count) => sum + count, 0);

  const neutralCounts = new Map<number, Rate>();
  for (const row of fair) {
    if (row.detail.n === null) continue;
    const known = neutralCounts.get(row.detail.n) ?? { n: 0, w: 0 };
    known.n += 1;
    if (row.won) known.w += 1;
    neutralCounts.set(row.detail.n, known);
  }

  // Matchups by «hero:position»: observed against expected from both base rates in log-odds (an ally adds its
  // strength, an opponent takes its strength away).
  const own = logit(bounded(base.get(`${band}:${heroId}:${position}`) ?? { n: fair.length, w: wins }));
  const pairs = (side: 'allies' | 'enemies') => {
    const counts = new Map<string, Rate & { h: number; p: number }>();
    for (const row of fair)
      for (const [h, p] of slots(row[side])) {
        const key = `${h}:${p}`;
        const known = counts.get(key) ?? { h, p, n: 0, w: 0 };
        known.n += 1;
        if (row.won) known.w += 1;
        counts.set(key, known);
      }
    return [...counts.values()]
      .filter((pair) => pair.n >= PAIR_MIN)
      .map((pair) => {
        const other = logit(bounded(base.get(`${band}:${pair.h}:${pair.p}`)));
        const expected = logistic(side === 'allies' ? own + other : own - other);
        return { ...pair, delta: Math.round((pair.w / pair.n - expected) * 1000) / 10 };
      })
      .sort((a, b) => b.delta - a.delta);
  };

  return {
    n: fair.length,
    w: wins,
    lo,
    hi,
    picks: rows.length,
    duration,
    lane,
    median: {
      kills: median(fair.map((row) => row.kills)),
      deaths: median(fair.map((row) => row.deaths)),
      assists: median(fair.map((row) => row.assists)),
      gpm: median(fair.map((row) => row.gpm)),
      xpm: median(fair.map((row) => row.xpm)),
      nw10: median(fair.map((row) => row.nw10))
    },
    items: items.slice(0, ITEMS_MAX),
    starts: [...startCounts.values()].sort((a, b) => b.n - a.n).slice(0, STARTS_MAX),
    skills:
      topOrder === undefined
        ? null
        : {
            order: topOrder[0].split(',').map(Number),
            n: topOrder[1],
            share: ordered === 0 ? 0 : topOrder[1] / ordered
          },
    neutrals: [...neutralCounts.entries()]
      .map(([id, rate]) => ({ id, ...rate }))
      .sort((a, b) => b.n - a.n)
      .slice(0, NEUTRALS_MAX),
    allies: pairs('allies'),
    enemies: pairs('enemies')
  };
}

/**
 * Every snapshot of a hero: per position, band and span over `rows` (one patch), plus the per-day counts of the last
 * `daysBack` days for trends.
 */
export function heroSnapshots(
  rows: readonly StatsRow[],
  heroId: number,
  patch: number,
  now: number,
  base: ReadonlyMap<string, Rate>,
  daysBack = 2
): {
  snapshots: SnapshotRow[];
  days: { day: number; heroId: number; position: number; band: Band; matches: number; wins: number }[];
} {
  const snapshots: SnapshotRow[] = [];
  const days: { day: number; heroId: number; position: number; band: Band; matches: number; wins: number }[] = [];
  const today = Math.floor(now / DAY_MS);
  for (let position = 1; position <= 5; position += 1) {
    const atPosition = rows.filter((row) => row.position === position);
    if (atPosition.length === 0) continue;
    for (const band of BAND_LIST) {
      const banded = atPosition.filter((row) => inBand(row, band));
      if (banded.length === 0) continue;
      for (const { span, days: length } of SPANS) {
        const cut = length === null ? banded : banded.filter((row) => row.startedAt >= now - length * DAY_MS);
        if (cut.length === 0) continue;
        const data = snapshotData(cut, heroId, position, band, base);
        snapshots.push({
          patch,
          heroId,
          position,
          band,
          span,
          matches: data.n,
          wins: data.w,
          data: JSON.stringify(data)
        });
      }
      for (let back = 0; back < daysBack; back += 1) {
        const day = today - back;
        const fair = banded.filter((row) => !row.tracked && Math.floor(row.startedAt / DAY_MS) === day);
        days.push({ day, heroId, position, band, matches: fair.length, wins: fair.filter((row) => row.won).length });
      }
    }
  }
  return { snapshots, days };
}
