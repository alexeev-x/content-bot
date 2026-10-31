// Every number of the rubric analytics in one place (docs/scheduler/area-backend-analytics.md §1).

const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** A post is scored at 24 h, once the v24h checkpoint window (90 min) has closed. */
export const SCORE_READY_MS = 25.5 * HOUR_MS;
/** The *72 columns fill once the v72h checkpoint is final. */
export const LATE_FILL_MS = 73.5 * HOUR_MS;
/** Rubric posts looked at by one score run: the last two weeks, at most this many. */
export const SCORE_LOOKBACK_MS = 14 * DAY_MS;
export const SCORE_BATCH = 50;
/** The channel's usual post: its posts of the 28 days before the scored one. */
export const BASELINE_WINDOW_MS = 28 * DAY_MS;
/** Poll posts for the vote rate: 90 days. */
export const VOTE_BASELINE_WINDOW_MS = 90 * DAY_MS;
export const BASELINE_MIN_POSTS = 5;
export const VOTE_BASELINE_MIN = 3;
/** Fewer scored posts than this is «мало данных». */
export const FEW = 3;
export const WEIGHTS = { views: 0.5, reactions: 0.2, comments: 0.2, votes: 0.1 } as const;
export const RATIO_MIN = 0.1;
export const RATIO_MAX = 10;
/** Raised when a weight or formula changes: rows keep their raw numbers, so they can be re-scored. */
export const SCORE_VERSION = 1;

/** Comment themes: one AI call a day at most, bounded input. */
export const THEMES_MIN_COMMENTS = 8;
export const THEMES_MAX_COMMENTS = 120;
export const THEMES_PER_POST = 40;
export const THEMES_COMMENT_CHARS = 240;
export const THEMES_LEASE_MS = 15 * 60_000;
export const THEMES_MAX_ATTEMPTS = 3;
export const COMMENT_KINDS = [
  'praise',
  'joke',
  'disagree',
  'confused',
  'request',
  'complaint',
  'recognition',
  'offtopic'
] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];

/** The Monday block's table: at most this many rubrics. */
export const WEEK_BLOCK_ROWS = 12;
