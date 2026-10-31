import { BASELINE_MIN_POSTS, VOTE_BASELINE_MIN, WEIGHTS } from '../constants';
import { clampRatio, finite, median, round2, weightedGeoMean } from './stats';

// One rubric post against the channel's usual post of the 28 days before it (area-backend-analytics.md §6.3):
// views by the median, reactions, comments and votes by the median rate per view, smoothed by +1, each clamped to
// [0.1, 10]; the composite is their weighted geometric mean. Views are required: without them there is no row.

export interface ScoredNumbers {
  views24: number;
  /** null: no reaction element in the preview. */
  likes24: number | null;
  /** null: the post has no comment thread the bot saw (unknown, never 0). */
  comments24: number | null;
  /** null: no poll, or votes unknown. */
  voters24: number | null;
}

export interface BaselinePost {
  views24: number;
  likes24: number | null;
  comments24: number | null;
}

export interface Score {
  xViews: number;
  xReactions: number | null;
  xComments: number | null;
  xVotes: number | null;
  composite: number;
  base: {
    n: number;
    viewsMedian: number;
    reactionRate: number | null;
    commentRate: number | null;
    voteRate: number | null;
  };
}

export type ScoreSkip = 'NO_BASELINE' | 'NO_VIEWS';

/** The median of count/views over the posts that have the reading; null below `min` readings. */
function rate(rows: readonly { views: number; count: number | null }[], min: number): number | null {
  const rates = rows
    .filter((row) => row.count !== null && row.views > 0)
    .map((row) => finite((row.count ?? 0) / row.views));
  return rates.length >= min ? median(rates) : null;
}

const counted = (observed: number | null, expectedRate: number | null, views: number): number | null => {
  if (observed === null || expectedRate === null) return null;
  const expected = expectedRate * views;
  return clampRatio((observed + 1) / (expected + 1));
};

export function scorePost(
  post: ScoredNumbers,
  baseline: readonly BaselinePost[],
  voteBaseline: readonly { views24: number; voters24: number }[]
): Score | ScoreSkip {
  const views = finite(post.views24);
  if (views === null || views <= 0) return 'NO_VIEWS';
  const usable = baseline.filter((row) => finite(row.views24) !== null && row.views24 > 0);
  if (usable.length < BASELINE_MIN_POSTS) return 'NO_BASELINE';
  const viewsMedian = median(usable.map((row) => row.views24));
  if (viewsMedian === null || viewsMedian <= 0) return 'NO_BASELINE';
  const xViews = clampRatio(views / viewsMedian);
  if (xViews === null) return 'NO_VIEWS';

  // A missing reaction element counts as 0 only while the preview shows reactions on at least half of the posts;
  // otherwise the preview may be broken and the component is dropped.
  const withLikes = usable.filter((row) => row.likes24 !== null).length;
  const likesTrusted = withLikes * 2 >= usable.length;
  const reactionRate = likesTrusted
    ? rate(
        usable.map((row) => ({ views: row.views24, count: row.likes24 ?? 0 })),
        BASELINE_MIN_POSTS
      )
    : null;
  const commentRate = rate(
    usable.map((row) => ({ views: row.views24, count: row.comments24 })),
    BASELINE_MIN_POSTS
  );
  const voteRate = rate(
    voteBaseline.map((row) => ({ views: row.views24, count: row.voters24 })),
    VOTE_BASELINE_MIN
  );

  const xReactions = likesTrusted ? counted(post.likes24 ?? 0, reactionRate, views) : null;
  const xComments = counted(post.comments24, commentRate, views);
  const xVotes = counted(post.voters24, voteRate, views);
  const composite = weightedGeoMean([
    { x: xViews, weight: WEIGHTS.views },
    { x: xReactions, weight: WEIGHTS.reactions },
    { x: xComments, weight: WEIGHTS.comments },
    { x: xVotes, weight: WEIGHTS.votes }
  ]);
  if (composite === null) return 'NO_VIEWS';
  return {
    xViews,
    xReactions,
    xComments,
    xVotes,
    composite,
    base: {
      n: usable.length,
      viewsMedian: Math.round(viewsMedian),
      reactionRate: round6(reactionRate),
      commentRate: round6(commentRate),
      voteRate: round6(voteRate)
    }
  };
}

const round6 = (value: number | null) => (value === null ? null : Math.round(value * 1e6) / 1e6);

/** The component that moved the composite most (`w·|ln x|`): the reason shown next to a rubric. */
export function topPart(parts: {
  views: number | null;
  reactions: number | null;
  comments: number | null;
  votes: number | null;
}): 'views' | 'reactions' | 'comments' | 'votes' | null {
  let best: 'views' | 'reactions' | 'comments' | 'votes' | null = null;
  let size = 0;
  for (const key of ['views', 'reactions', 'comments', 'votes'] as const) {
    const x = parts[key];
    if (x === null || !(x > 0)) continue;
    const weight = WEIGHTS[key] * Math.abs(Math.log(x));
    if (weight > size) {
      size = weight;
      best = key;
    }
  }
  return best;
}

export { round2 };
