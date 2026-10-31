import { mskDayIndex, mskMinuteOfDay, mskWeekday } from '../../../shared/msk-time';
import type { ChannelPost, RubricDescriptor, Violation } from './types';

// The owner's hard rules over every post of the channel, ours and the news (RUBRICS_SCHEDULER.md, release-model.md):
// a candidate post either fits all of them at its time or is not placed. Pure: the same occupants give the same answer.

const HOUR_MS = 3_600_000;
export const WINDOW_FROM_MINUTE = 8 * 60;
export const WINDOW_TO_MINUTE = 23 * 60;
export const DAY_POSTS_MAX = 3;
export const DAY_RUBRICS_MAX = 2;
export const GAP_MS = 2 * HOUR_MS;
const INTERACTIVE_WEEK_MAX = 4;
const INTERACTIVE_GAP_MS = 40 * HOUR_MS;
/** Three news posts in a day make it heavy: one rubric at most, and a light one. */
const HEAVY_DAY_NEWS = 3;
/** No third picture post in a row, no second text post in a row (over every post of the channel). */
const V_RUN_MAX = 2;
const L_RUN_MAX = 1;

/** Monday-based week index of a Moscow day (Moscow Monday 00:00 starts it). */
function mskWeekIndex(utc: number): number {
  // 1970-01-01 was a Thursday: shift so that weeks start on Monday.
  return Math.floor((mskDayIndex(utc) + 3) / 7);
}

/** How long the run of the candidate's weight becomes once it is placed among the posts at its time. */
function runLength(posts: ChannelPost[], candidate: ChannelPost): number {
  const sorted = [...posts, candidate].sort((a, b) => a.at - b.at);
  const index = sorted.indexOf(candidate);
  let length = 1;
  for (let i = index - 1; i >= 0 && sorted[i]?.weight === candidate.weight; i -= 1) length += 1;
  for (let i = index + 1; i < sorted.length && sorted[i]?.weight === candidate.weight; i += 1) length += 1;
  return length;
}

export interface ConstraintContext {
  /** The descriptors by key: the pairing rules of the rubrics already placed. */
  rubrics: ReadonlyMap<string, RubricDescriptor>;
  /** Whether this candidate is an anchor (horoscope Monday): the day may then carry a third rubric. */
  anchor?: boolean;
}

export function violations(
  candidate: ChannelPost & { rubric: string },
  occupants: readonly ChannelPost[],
  context: ConstraintContext
): Violation[] {
  const found: Violation[] = [];
  const minute = mskMinuteOfDay(candidate.at);
  if (minute < WINDOW_FROM_MINUTE || minute > WINDOW_TO_MINUTE) found.push('WINDOW');

  const day = mskDayIndex(candidate.at);
  const sameDay = occupants.filter((post) => mskDayIndex(post.at) === day);
  if (sameDay.length + 1 > DAY_POSTS_MAX) found.push('DAY_POSTS');
  const rubricsToday = sameDay.filter((post) => post.rubric !== null);
  if (rubricsToday.length + 1 > DAY_RUBRICS_MAX + (context.anchor === true ? 1 : 0)) found.push('DAY_RUBRICS');
  const newsToday = sameDay.length - rubricsToday.length;
  if (newsToday >= HEAVY_DAY_NEWS && (rubricsToday.length > 0 || candidate.weight !== 'L')) found.push('HEAVY_DAY');

  if (occupants.some((post) => Math.abs(post.at - candidate.at) < GAP_MS)) found.push('GAP');

  if (candidate.interactive) {
    const interactive = occupants.filter((post) => post.interactive);
    if (interactive.some((post) => mskDayIndex(post.at) === day)) found.push('INTERACTIVE_DAY');
    if (interactive.some((post) => Math.abs(post.at - candidate.at) < INTERACTIVE_GAP_MS))
      found.push('INTERACTIVE_GAP');
    const window = interactive.filter((post) => Math.abs(post.at - candidate.at) < 7 * 24 * HOUR_MS);
    if (window.length + 1 > INTERACTIVE_WEEK_MAX) found.push('INTERACTIVE_WEEK');
  }

  if (candidate.family !== null && rubricsToday.some((post) => post.family === candidate.family))
    found.push('FAMILY_DAY');

  const own = context.rubrics.get(candidate.rubric);
  const week = mskWeekIndex(candidate.at);
  for (const post of occupants) {
    if (post.rubric === null) continue;
    const other = context.rubrics.get(post.rubric);
    const pairedDay =
      (own?.sameDay.includes(post.rubric) ?? false) || (other?.sameDay.includes(candidate.rubric) ?? false);
    if (pairedDay && mskDayIndex(post.at) === day) found.push('SAME_DAY');
    const pairedWeek =
      (own?.sameWeek.includes(post.rubric) ?? false) || (other?.sameWeek.includes(candidate.rubric) ?? false);
    if (pairedWeek && mskWeekIndex(post.at) === week) found.push('SAME_WEEK');
    const apart =
      own?.apart.find((rule) => rule.key === post.rubric)?.days ??
      other?.apart.find((rule) => rule.key === candidate.rubric)?.days;
    if (apart !== undefined && Math.abs(post.at - candidate.at) < apart * 24 * HOUR_MS) found.push('APART');
  }

  if (runLength([...occupants], candidate) > (candidate.weight === 'V' ? V_RUN_MAX : L_RUN_MAX))
    found.push('ALTERNATION');
  return [...new Set(found)];
}

/** Whether a rubric's own window lets it take a slot at this time (its weekday and part of the day). */
export function fitsSlot(rubric: RubricDescriptor, at: number, part: 'morning' | 'day' | 'evening'): boolean {
  const weekday = mskWeekday(at);
  const slot = rubric.slot;
  if (typeof slot === 'object') {
    if ('exactMsk' in slot) return part === 'morning';
    return part !== 'morning';
  }
  if (part === 'morning') return false;
  switch (slot) {
    case 'day':
      return part === 'day';
    case 'evening':
      return part === 'evening';
    case 'any':
      return true;
    case 'weekend':
      return weekday === 0 || weekday === 6;
    case 'fri_evening':
      return weekday === 5 && part === 'evening';
    case 'fri_sat_evening':
      return (weekday === 5 || weekday === 6) && part === 'evening';
  }
}
