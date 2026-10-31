import { describe, expect, it } from 'vitest';
import { compareRubrics, rubricSlices } from './aggregate';
import { scorePost } from './score';
import { clampRatio, median, weightedGeoMean } from './stats';
import { validateThemes } from './theme-validate';
import type { ScoreRow } from './types';

// The numbers the owner reads as «×1,6 к обычному»: a wrong formula or a NaN in a stored row would mislead every
// comparison and the learning built on them.

const baseline = (n: number, views = 1000, likes: number | null = 20, comments: number | null = 5) =>
  Array.from({ length: n }, () => ({ views24: views, likes24: likes, comments24: comments }));

describe('guards', () => {
  it('turns non-finite and non-positive into null and clamps', () => {
    expect(median([])).toBeNull();
    expect(median([Number.NaN, 3, 1, Number.POSITIVE_INFINITY])).toBe(2);
    expect(clampRatio(0)).toBeNull();
    expect(clampRatio(Number.NaN)).toBeNull();
    expect(clampRatio(50)).toBe(10);
    expect(clampRatio(0.01)).toBe(0.1);
    expect(weightedGeoMean([{ x: null, weight: 1 }])).toBeNull();
  });
});

describe('scorePost', () => {
  it('needs five baseline posts and views', () => {
    expect(scorePost({ views24: 1000, likes24: 1, comments24: 1, voters24: null }, baseline(4), [])).toBe(
      'NO_BASELINE'
    );
    expect(scorePost({ views24: 0, likes24: 1, comments24: 1, voters24: null }, baseline(5), [])).toBe('NO_VIEWS');
  });

  it('is ×1 for the usual post and weights the parts present', () => {
    const usual = scorePost({ views24: 1000, likes24: 20, comments24: 5, voters24: null }, baseline(6), []);
    expect(typeof usual).toBe('object');
    if (typeof usual === 'string') return;
    expect(usual.composite).toBeCloseTo(1, 5);
    expect(usual.xVotes).toBeNull();
    const twice = scorePost({ views24: 2000, likes24: 40, comments24: 10, voters24: null }, baseline(6), []);
    if (typeof twice === 'string') throw new Error(twice);
    expect(twice.xViews).toBe(2);
    // Reactions and comments are per view: twice the views at the usual rates lifts only the views part.
    expect(twice.composite).toBeCloseTo(2 ** (0.5 / 0.9), 5);
  });

  it('drops reactions when the preview hid them on most posts, and smooths a zero', () => {
    const blind = scorePost(
      { views24: 1000, likes24: null, comments24: 0, voters24: null },
      baseline(6, 1000, null, 0),
      []
    );
    if (typeof blind === 'string') throw new Error(blind);
    expect(blind.xReactions).toBeNull();
    expect(blind.xComments).toBe(1);
  });

  it('keeps comments unknown (null) when the post has no thread', () => {
    const score = scorePost({ views24: 1000, likes24: 20, comments24: null, voters24: null }, baseline(6), []);
    if (typeof score === 'string') throw new Error(score);
    expect(score.xComments).toBeNull();
  });
});

const row = (rubric: string, composite: number, hero: string | null = null): ScoreRow => ({
  chatId: 'c',
  messageId: Math.floor(Math.random() * 1e9),
  slotId: 's',
  rubric,
  role: 'main',
  sentAt: 0,
  scoredAt: 0,
  views24: 1,
  likes24: null,
  comments24: null,
  voters24: null,
  views72: null,
  xViews: composite,
  xReactions: null,
  xComments: null,
  xVotes: null,
  composite,
  slices: { hero, line: null, look: null, picture: true, hour: 12, weekday: 0, exploration: false }
});

describe('comparisons', () => {
  it('ranks rubrics with three posts or more and marks only when two qualify', () => {
    const rows = compareRubrics(
      [row('a', 2), row('a', 2), row('a', 2), row('b', 0.5), row('b', 0.5), row('b', 0.5), row('c', 9)],
      []
    );
    expect(rows.map((each) => [each.rubric, each.mark])).toEqual([
      ['a', 'best'],
      ['b', 'worst'],
      ['c', null]
    ]);
    expect(compareRubrics([row('a', 2), row('a', 2), row('a', 2)], [])[0]?.mark).toBeNull();
  });

  it('slices a rubric against its own usual post, few rows last', () => {
    const slices = rubricSlices([row('a', 2, '1'), row('a', 2, '1'), row('a', 2, '1'), row('a', 1, '2')], 2);
    const hero = slices.find((slice) => slice.dimension === 'hero');
    expect(hero?.rows.map((each) => [each.key, each.x, each.few])).toEqual([
      ['1', 1, false],
      ['2', 0.5, true]
    ]);
  });
});

describe('comment themes from the model', () => {
  const sent = [
    { i: 0, post: 0, t: 'круто' },
    { i: 1, post: 0, t: 'топ' },
    { i: 2, post: 1, t: 'не понял' }
  ];

  it('counts valid ids only and drops unsafe labels', () => {
    const themes = validateThemes(
      {
        posts: [
          {
            post: 0,
            kinds: [
              { kind: 'praise', ids: [0, 1, 1, 2, 99] },
              { kind: 'hack', ids: [0] }
            ],
            topics: [
              { label: 'Хвалят пикчу', ids: [0, 1] },
              { label: 'смотри t.me/x', ids: [0, 1] }
            ],
            quote_id: 2
          }
        ]
      },
      sent
    );
    const post = themes?.get(0);
    expect(post?.kinds.praise).toBe(2);
    expect(post?.topics).toEqual([{ label: 'Хвалят пикчу', count: 2 }]);
    // Comment 2 belongs to another post: no quote.
    expect(post?.quote).toBeNull();
  });

  it('refuses a malformed answer', () => {
    expect(validateThemes({ posts: 'x' }, sent)).toBeNull();
  });
});
