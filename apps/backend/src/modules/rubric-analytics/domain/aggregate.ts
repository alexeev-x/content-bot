import { FEW } from '../constants';
import { topPart } from './score';
import { median, round2 } from './stats';
import { type Part, type Parts, partsOf, type ScoreRow } from './types';

// The comparisons (area-backend-analytics.md §7), computed on request from the stored rows: between rubrics by the
// median composite, inside one rubric by slices of its posts, and the weekday × hour heat-map.

export interface RubricCompareRow {
  rubric: string;
  scored: number;
  enough: boolean;
  x: number | null;
  xPrev: number | null;
  parts: Parts;
  rank: number | null;
  mark: 'best' | 'worst' | null;
  reason: Part | null;
}

const medianParts = (rows: readonly ScoreRow[]): Parts => {
  const parts = rows.map(partsOf);
  return {
    views: round2(median(parts.map((part) => part.views))),
    reactions: round2(median(parts.map((part) => part.reactions))),
    comments: round2(median(parts.map((part) => part.comments))),
    votes: round2(median(parts.map((part) => part.votes)))
  };
};

/** Rubrics ranked by their median composite; marks only when two or more have enough posts. */
export function compareRubrics(current: readonly ScoreRow[], previous: readonly ScoreRow[]): RubricCompareRow[] {
  const byRubric = groupBy(
    current.filter((row) => row.role === 'main'),
    (row) => row.rubric
  );
  const prevBy = groupBy(
    previous.filter((row) => row.role === 'main'),
    (row) => row.rubric
  );
  const rows: RubricCompareRow[] = [...byRubric].map(([rubric, posts]) => {
    const parts = medianParts(posts);
    return {
      rubric,
      scored: posts.length,
      enough: posts.length >= FEW,
      x: round2(median(posts.map((row) => row.composite))),
      xPrev: round2(median((prevBy.get(rubric) ?? []).map((row) => row.composite))),
      parts,
      rank: null,
      mark: null,
      reason: topPart(parts)
    };
  });
  const enough = rows.filter((row) => row.enough).sort((a, b) => (b.x ?? 0) - (a.x ?? 0));
  enough.forEach((row, index) => {
    row.rank = index + 1;
  });
  if (enough.length >= 2) {
    (enough[0] as RubricCompareRow).mark = 'best';
    (enough.at(-1) as RubricCompareRow).mark = 'worst';
  }
  const few = rows.filter((row) => !row.enough).sort((a, b) => b.scored - a.scored);
  return [...enough, ...few];
}

export interface SliceRow {
  key: string;
  label: string;
  n: number;
  x: number | null;
  few: boolean;
  mark: 'best' | 'worst' | null;
}

export type SliceDimension = 'hero' | 'line' | 'look' | 'picture' | 'hour' | 'weekday';

/** One rubric's posts, each against the rubric's own median (×1.0 is its usual post), sliced. */
export function rubricSlices(
  rows: readonly ScoreRow[],
  usual: number
): { dimension: SliceDimension; rows: SliceRow[] }[] {
  const keyOf: Record<SliceDimension, (row: ScoreRow) => string | null> = {
    hero: (row) => row.slices.hero,
    line: (row) => row.slices.line,
    look: (row) => row.slices.look,
    picture: (row) => (row.slices.picture ? 'picture' : 'text'),
    hour: (row) => String(row.slices.hour),
    weekday: (row) => String(row.slices.weekday)
  };
  return (Object.keys(keyOf) as SliceDimension[])
    .map((dimension) => {
      const groups = groupBy(
        rows.filter((row) => keyOf[dimension](row) !== null),
        (row) => keyOf[dimension](row) as string
      );
      const sliceRows: SliceRow[] = [...groups].map(([key, posts]) => ({
        key,
        label: key,
        n: posts.length,
        x: round2(median(posts.map((row) => row.composite / usual))),
        few: posts.length < FEW,
        mark: null
      }));
      const solid = sliceRows.filter((row) => !row.few).sort((a, b) => (b.x ?? 0) - (a.x ?? 0));
      if (solid.length >= 2) {
        (solid[0] as SliceRow).mark = 'best';
        (solid.at(-1) as SliceRow).mark = 'worst';
      }
      return { dimension, rows: [...solid, ...sliceRows.filter((row) => row.few).sort((a, b) => b.n - a.n)] };
    })
    .filter((slice) => slice.rows.length > 1);
}

export interface HeatCell {
  weekday: number;
  hour: number;
  n: number;
  x: number | null;
  trial: boolean;
}

/** Weekday (Monday 0) × Moscow hour 8–23: the median composite of the rubric posts sent there, null below 3. */
export function heatCells(rows: readonly ScoreRow[]): HeatCell[] {
  const cells = groupBy(
    rows.filter((row) => row.role === 'main' && row.slices.hour >= 8),
    (row) => `${row.slices.weekday}:${row.slices.hour}`
  );
  return [...cells].map(([key, posts]) => {
    const [weekday, hour] = key.split(':').map(Number) as [number, number];
    return {
      weekday,
      hour,
      n: posts.length,
      x: posts.length >= FEW ? round2(median(posts.map((row) => row.composite))) : null,
      trial: posts.some((row) => row.slices.exploration)
    };
  });
}

export function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const name = key(item);
    const list = groups.get(name);
    if (list === undefined) groups.set(name, [item]);
    else list.push(item);
  }
  return groups;
}
