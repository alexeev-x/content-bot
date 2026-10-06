import { describe, expect, it } from 'vitest';
import { isInScheduleWindow, SCHEDULE_MAX_AHEAD_MS, SCHEDULE_PAST_GRACE_MS } from './schedule-window';

const NOW = 1_800_000_000_000;

describe('isInScheduleWindow', () => {
  it.each([
    ['exactly now', NOW, true],
    ['five minutes in the past', NOW - SCHEDULE_PAST_GRACE_MS, true],
    ['one millisecond over the past grace', NOW - SCHEDULE_PAST_GRACE_MS - 1, false],
    ['366 days ahead', NOW + SCHEDULE_MAX_AHEAD_MS, true],
    ['one millisecond over 366 days', NOW + SCHEDULE_MAX_AHEAD_MS + 1, false],
    ['not a number', Number.NaN, false]
  ])('%s', (_name, scheduledAt, expected) => {
    expect(isInScheduleWindow(scheduledAt, NOW)).toBe(expected);
  });
});
