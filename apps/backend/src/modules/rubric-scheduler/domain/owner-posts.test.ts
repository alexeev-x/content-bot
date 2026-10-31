import { describe, expect, it } from 'vitest';
import { fromMsk } from '../../../shared/msk-time';
import { GAP_MS, shiftedAt, violations } from './constraints';
import type { ChannelPost, RubricDescriptor } from './types';

// The owner's own posts (31.10.2026) never use up the day's limits; they only keep the two-hour gap, and a slot that
// lands in it moves behind them or yields.

const HOUR = 3_600_000;
const DAY = '2026-11-03';
const at = (hour: number, minute = 0) => fromMsk(DAY, hour * 60 + minute);
const rubric: RubricDescriptor = {
  key: 'quote',
  title: 'quote',
  family: 'quote',
  weight: 'L',
  interactive: false,
  trigger: 'pool',
  needs: [],
  restDays: 7,
  slot: 'any',
  sameDay: [],
  sameWeek: [],
  apart: [],
  silentAfterPatchDays: null,
  hasPicture: false,
  hasPoll: false
};
const context = { rubrics: new Map([[rubric.key, rubric]]) };
const owner = (time: number, extra: Partial<ChannelPost> = {}): ChannelPost => ({
  at: time,
  weight: 'L',
  rubric: null,
  interactive: false,
  family: null,
  owner: true,
  ...extra
});
const candidate = (time: number) => ({
  at: time,
  weight: 'V' as const,
  rubric: 'quote',
  interactive: false,
  family: null
});

describe('the owner posts by hand', () => {
  it('do not use up the day limit: four of his posts leave the day open', () => {
    const posts = [9, 12, 15, 18].map((hour) => owner(at(hour)));
    expect(violations(candidate(at(21)), posts, context)).toEqual([]);
  });

  it('still keep the gap: a slot within two hours after his post is refused', () => {
    expect(violations(candidate(at(12, 30)), [owner(at(11))], context)).toContain('GAP');
  });

  it('do not break a run of picture posts', () => {
    const posts = [owner(at(9), { weight: 'V' }), owner(at(11), { weight: 'V' })];
    expect(violations(candidate(at(14)), posts, context)).toEqual([]);
  });

  it('move a ready slot one hour behind his post to his post plus two hours', () => {
    expect(shiftedAt(candidate(at(12)), [owner(at(11))], context)).toBe(at(11) + GAP_MS);
  });

  it('leave a slot alone when his post is not within the gap', () => {
    expect(shiftedAt(candidate(at(14)), [owner(at(11))], context)).toBe(at(14));
  });

  it('make a slot yield when no room is left on the same day', () => {
    expect(shiftedAt(candidate(at(22)), [owner(at(21, 30))], context)).toBeNull();
  });

  it('keep the shifted slot clear of the other posts of the day', () => {
    const other: ChannelPost = { ...owner(at(14)), owner: false };
    expect(shiftedAt(candidate(at(12)), [owner(at(11)), other], context)).toBe(at(16));
    expect(HOUR).toBe(3_600_000);
  });
});
