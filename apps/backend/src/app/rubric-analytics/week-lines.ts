import { RUBRIC_TITLES, type RubricKey } from '@alexeev/contracts';
import type { RubricWeekLines } from '../../modules/content-analytics';
import type { WeekBlockRepository } from '../../modules/rubric-analytics';
import { mskParts } from '../../shared/msk-time';

// The Monday report's «Рубрики» block: this Monday's stored block (rubric analytics) worded for the report
// (content analytics), rubric keys turned into their titles here, where the two modules meet.

const title = (key: string) => RUBRIC_TITLES[key as RubricKey] ?? key;

export async function readRubricWeekLines(blocks: WeekBlockRepository, now: number): Promise<RubricWeekLines | null> {
  const block = await blocks.get(mskParts(now).day);
  if (block === null) return null;
  const { data } = block;
  return {
    posts: data.posts,
    rows: data.rubrics.map((row) => ({
      title: title(row.key),
      posts: row.posts,
      x: row.x,
      parts: row.parts,
      few: row.few
    })),
    best: data.best === null ? null : { title: title(data.best.rubric), x: data.best.x, part: data.best.topPart },
    worst: data.worst === null ? null : { title: title(data.worst.rubric), x: data.worst.x, part: data.worst.topPart },
    bestPost:
      data.bestPost === null
        ? null
        : { title: title(data.bestPost.rubric), x: data.bestPost.x, url: data.bestPost.url },
    worstPost:
      data.worstPost === null
        ? null
        : { title: title(data.worstPost.rubric), x: data.worstPost.x, url: data.worstPost.url },
    rest: data.rest.map((row) => ({
      title: title(row.rubric),
      from: row.from,
      to: row.to,
      applied: row.outcome === 'applied'
    })),
    slots: data.slots
  };
}
