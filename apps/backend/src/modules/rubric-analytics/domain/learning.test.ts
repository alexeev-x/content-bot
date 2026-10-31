import { describe, expect, it } from 'vitest';
import { cellEstimates, hourAdvice, type HourPost } from './hour-advice';
import { restAdvice, type RestSubject } from './rest-advice';

// The learning changes the channel's rhythm by itself after four weeks: a wrong edge moves rubrics or hours for good.

const NOW = Date.UTC(2026, 11, 7);
const subject = (composites: number[], extra: Partial<RestSubject> = {}): RestSubject => ({
  rubric: 'r',
  restDays: 14,
  source: 'default',
  lastChangeAt: null,
  composites,
  ...extra
});

describe('rest advice', () => {
  it('shortens a strong rubric and lengthens a weak one by 10 % (1–5 days)', () => {
    expect(restAdvice([subject([3, 3, 3, 3, 3, 3, 3, 3])], NOW)).toMatchObject([
      { from: 14, to: 13, reason: 'better' }
    ]);
    expect(restAdvice([subject([0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3], { restDays: 60 })], NOW)).toEqual([]);
    expect(restAdvice([subject([0.3, 0.3, 0.3, 0.3], { restDays: 50 })], NOW)).toMatchObject([
      { to: 55, reason: 'worse' }
    ]);
    expect(restAdvice([subject([3, 3, 3, 3], { restDays: 7 })], NOW)).toEqual([]);
  });

  it('keeps the dead zone, the minimum of four posts, the owner and the cool-down', () => {
    expect(restAdvice([subject([1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2])], NOW)).toEqual([]);
    expect(restAdvice([subject([3, 3, 3])], NOW)).toEqual([]);
    expect(restAdvice([subject([3, 3, 3, 3], { source: 'manual' })], NOW)).toEqual([]);
    expect(restAdvice([subject([3, 3, 3, 3], { lastChangeAt: NOW - 13 * 86_400_000 })], NOW)).toEqual([]);
    expect(restAdvice([subject([3, 3, 3, 3], { lastChangeAt: NOW - 14 * 86_400_000 })], NOW)).toHaveLength(1);
    expect(restAdvice([subject([Number.NaN, 3, 3, 3])], NOW)).toEqual([]);
  });

  it('changes at most three rubrics a week, the clearest first', () => {
    const many = ['a', 'b', 'c', 'd'].map((rubric, index) => subject(Array(4).fill(2 + index), { rubric }));
    expect(restAdvice(many, NOW).map((each) => each.rubric)).toEqual(['d', 'c', 'b']);
  });
});

describe('hour advice', () => {
  // Three rubrics, each with posts at 12 and at 13: the 13:00 posts land twice as well inside their rubric.
  const posts: HourPost[] = ['a', 'b', 'c'].flatMap((rubric) =>
    Array.from({ length: 6 }, (_, index) => ({
      rubric,
      composite: index % 2 === 0 ? 1 : 2,
      weekday: index % 5,
      hour: index % 2 === 0 ? 12 : 13
    }))
  );

  it('moves the day slot one hour toward the better hour', () => {
    expect(hourAdvice(posts, [], NOW)).toMatchObject([{ group: 'wd', part: 'day', from: 750, to: 810 }]);
  });

  it('needs twelve posts in a group and keeps the owner and the cool-down', () => {
    expect(hourAdvice(posts.slice(0, 11), [], NOW)).toEqual([]);
    expect(hourAdvice(posts, [{ group: 'wd', part: 'day', minute: 750, source: 'manual', changedAt: 0 }], NOW)).toEqual(
      []
    );
    expect(
      hourAdvice(
        posts,
        [{ group: 'wd', part: 'day', minute: 750, source: 'learned', changedAt: NOW - 86_400_000 }],
        NOW
      )
    ).toEqual([]);
  });

  it('shrinks a thin cell toward its block', () => {
    const cells = cellEstimates([{ hour: 9, r: 1 }]);
    expect(cells.get(9)?.est).toBeLessThan(1);
    expect(cells.get(8)?.n).toBe(0);
  });
});
