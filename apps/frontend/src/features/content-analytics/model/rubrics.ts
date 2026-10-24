import type { ContentItemDto, ContentRubricsDto } from '@alexeev/contracts';
import { HOUR_BLOCKS, median, mediansByPlatform, multipleOf, timeBlocks } from './report';

// «Рубрики Telegram» (plan B3): how each of the owner's rubrics does against the channel's usual post. The usual is
// the median views of the period's settled Telegram posts, so «1,4×» reads like the rest of the page.

/** A best time needs at least this many posts of the rubric in its block. */
const BEST_TIME_MIN_POSTS = 2;

export type RubricStat = {
  id: string;
  name: string;
  tag: string | null;
  posts: ContentItemDto[];
  /** Median «× к обычному» of its settled posts; null while all are young. */
  multiple: number | null;
  medianViews: number | null;
  /** The 4-hour block its posts did best in, from BEST_TIME_MIN_POSTS posts there; null otherwise. */
  bestHours: { from: number; to: number } | null;
  /** By «×», by views while none is settled. */
  best: ContentItemDto | null;
};

export type RubricsSummary = { stats: RubricStat[]; withoutRubric: number };

/**
 * The period's Telegram posts grouped by rubric, strongest first; rubrics without posts in the period go last.
 * `items`: the report's items of this period (any platform); `assigned`: the rubrics endpoint's answer.
 */
export function rubricStats(
  items: readonly ContentItemDto[],
  assigned: ContentRubricsDto,
  at: number,
  timezone: string
): RubricsSummary {
  const telegram = items.filter((item) => item.platform === 'telegram');
  const rubricOf = new Map(assigned.items.map((row) => [row.itemId, row.rubricId]));
  const medians = mediansByPlatform(telegram, at);
  const stats = assigned.rubrics.map((rubric): RubricStat => {
    const posts = telegram.filter((item) => rubricOf.get(item.id) === rubric.id);
    const scored = posts.map((item) => ({ item, multiple: multipleOf(item, medians, at) }));
    const settled = scored.filter(
      (entry): entry is { item: ContentItemDto; multiple: number } => entry.multiple !== null
    );
    const multiple = median(settled.map((entry) => entry.multiple));
    const blocks = timeBlocks(posts, timezone).filter(
      (block) => block.items >= BEST_TIME_MIN_POSTS && block.medianViews !== null
    );
    const bestBlock = [...blocks].sort((a, b) => (b.medianViews ?? 0) - (a.medianViews ?? 0))[0];
    const from = bestBlock === undefined ? undefined : HOUR_BLOCKS[bestBlock.block];
    return {
      id: rubric.id,
      name: rubric.name,
      tag: rubric.tag,
      posts,
      multiple: multiple === null ? null : Math.round(multiple * 10) / 10,
      medianViews: median(posts.filter((item) => item.views !== null).map((item) => item.views ?? 0)),
      bestHours: from === undefined ? null : { from, to: from + 4 },
      best:
        [...settled].sort((a, b) => b.multiple - a.multiple)[0]?.item ??
        [...posts].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0] ??
        null
    };
  });
  stats.sort(
    (a, b) =>
      Number(b.posts.length > 0) - Number(a.posts.length > 0) ||
      (b.multiple ?? -1) - (a.multiple ?? -1) ||
      b.posts.length - a.posts.length
  );
  return { stats, withoutRubric: telegram.filter((item) => !rubricOf.has(item.id)).length };
}
