import { describe, expect, it } from 'vitest';
import { settledWeeks } from './tier-list';

// A half-counted newest STRATZ week would put thin samples into every rate of the picture.
const row = (week: number, matches: number, wins = 0) => ({ heroId: 1, week, matches, wins });

describe('settledWeeks', () => {
  it('drops the newest week while it is still filling', () => {
    const weeks = settledWeeks([row(12, 100), row(11, 1000), row(10, 1000)]);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]?.get(1)?.matches).toBe(1000);
  });

  it('keeps the newest week once it is as full as the one before', () => {
    const weeks = settledWeeks([row(12, 900, 450), row(11, 1000)]);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]?.get(1)).toEqual({ matches: 900, wins: 450 });
  });
});
