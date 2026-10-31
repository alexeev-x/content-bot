// A stored score row as the comparisons read it.

export interface PostSlices {
  hero: string | null;
  line: string | null;
  look: string | null;
  picture: boolean;
  /** Moscow hour and weekday (0 Monday … 6 Sunday) of the send. */
  hour: number;
  weekday: number;
  exploration: boolean;
}

export interface ScoreRow {
  chatId: string;
  messageId: number;
  slotId: string;
  rubric: string;
  role: 'main' | 'followup';
  sentAt: number;
  scoredAt: number;
  views24: number;
  likes24: number | null;
  comments24: number | null;
  voters24: number | null;
  views72: number | null;
  xViews: number;
  xReactions: number | null;
  xComments: number | null;
  xVotes: number | null;
  composite: number;
  slices: PostSlices;
}

export type Part = 'views' | 'reactions' | 'comments' | 'votes';
export type Parts = Record<Part, number | null>;

export const partsOf = (row: ScoreRow): Parts => ({
  views: row.xViews,
  reactions: row.xReactions,
  comments: row.xComments,
  votes: row.xVotes
});
