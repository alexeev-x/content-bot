import { mskParts } from '../../../shared/msk-time';
import { DAY_MS } from '../constants';
import { buildWeekBlock, type WeekBlock } from '../domain/week-block';
import type { ScoreRow } from '../domain/types';
import type { ScoreRepository, WeekBlockRepository, WeekSlotsSource } from './ports';

// The `week` step (area-backend-analytics.md §9.1): once a Monday (Moscow), the rows scored since the last block.
// By `scored_at`, so every scored post lands in exactly one report. Immutable once written.

export async function buildRubricWeekBlock(deps: {
  scores: ScoreRepository;
  blocks: WeekBlockRepository;
  slots: WeekSlotsSource;
  rest?: () => Promise<WeekBlock['rest']>;
  url: (row: ScoreRow) => string | null;
  now: number;
}): Promise<'built' | 'exists' | 'not_monday'> {
  const { now } = deps;
  const parts = mskParts(now);
  if (parts.weekday !== 1) return 'not_monday';
  const weekKey = parts.day;
  if ((await deps.blocks.get(weekKey)) !== null) return 'exists';
  const previous = await deps.blocks.latest();
  const from = previous?.cutTo ?? now - 7 * DAY_MS;
  const [week, counts90, slots, rest] = await Promise.all([
    deps.scores.byScored(from, now),
    deps.scores.countsSince(now - 90 * DAY_MS),
    deps.slots.summary(from, now),
    deps.rest?.() ?? Promise.resolve([])
  ]);
  const data = buildWeekBlock({ window: { from, to: now }, week, counts90, slots, rest, url: deps.url });
  await deps.blocks.insert({ weekKey, cutFrom: from, cutTo: now, data, createdAt: now });
  return 'built';
}
