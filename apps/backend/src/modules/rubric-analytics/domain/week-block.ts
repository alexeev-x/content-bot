import { FEW, WEEK_BLOCK_ROWS } from '../constants';
import { compareRubrics } from './aggregate';
import { topPart } from './score';
import { round2 } from './stats';
import { type Part, type Parts, partsOf, type ScoreRow } from './types';

// The Monday report's «Рубрики» block (area-backend-analytics.md §9): the rows scored since the last block, the
// best and worst rubric and post, the week's slot outcomes, the learning changes. Numbers only; the report words them.

export interface WeekSlotsSummary {
  sent: number;
  missed: number;
  empty: number;
  skipped: number;
  failed: number;
  unresolved: number;
  causes: { rubric: string; code: string; count: number }[];
}

export interface WeekBlock {
  v: 1;
  window: { from: number; to: number };
  posts: number;
  rubrics: { key: string; posts: number; x: number | null; parts: Parts; few: boolean }[];
  best: { rubric: string; x: number; topPart: Part | null } | null;
  worst: { rubric: string; x: number; topPart: Part | null } | null;
  bestPost: { rubric: string; sentAt: number; x: number; messageId: number; url: string | null } | null;
  worstPost: { rubric: string; sentAt: number; x: number; messageId: number; url: string | null } | null;
  rest: { rubric: string; from: number; to: number; outcome: string }[];
  slots: WeekSlotsSummary;
}

export function buildWeekBlock(input: {
  window: { from: number; to: number };
  /** Main posts scored inside the window. */
  week: readonly ScoreRow[];
  /** The rubrics' scored counts over 90 days: a rubric under 3 is «мало данных». */
  counts90: ReadonlyMap<string, number>;
  slots: WeekSlotsSummary;
  rest: WeekBlock['rest'];
  url: (row: ScoreRow) => string | null;
}): WeekBlock {
  const main = input.week.filter((row) => row.role === 'main');
  const compared = compareRubrics(main, []);
  const rubrics = compared.slice(0, WEEK_BLOCK_ROWS).map((row) => ({
    key: row.rubric,
    posts: row.scored,
    x: row.x,
    parts: row.parts,
    few: (input.counts90.get(row.rubric) ?? 0) < FEW
  }));
  const solid = rubrics.filter((row) => !row.few && row.x !== null).sort((a, b) => (b.x ?? 0) - (a.x ?? 0));
  const pick = (row: (typeof solid)[number] | undefined) =>
    row === undefined ? null : { rubric: row.key, x: row.x as number, topPart: topPart(row.parts) };
  const sorted = [...main].sort((a, b) => b.composite - a.composite);
  const post = (row: ScoreRow | undefined) =>
    row === undefined
      ? null
      : {
          rubric: row.rubric,
          sentAt: row.sentAt,
          x: round2(row.composite) as number,
          messageId: row.messageId,
          url: input.url(row)
        };
  return {
    v: 1,
    window: input.window,
    posts: main.length,
    rubrics,
    best: pick(solid[0]),
    worst: solid.length >= 2 ? pick(solid.at(-1)) : null,
    bestPost: post(sorted[0]),
    worstPost: sorted.length >= 2 ? post(sorted.at(-1)) : null,
    rest: input.rest,
    slots: input.slots
  };
}

export { partsOf };
