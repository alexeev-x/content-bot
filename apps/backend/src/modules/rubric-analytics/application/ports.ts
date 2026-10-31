import type { WeekBlock, WeekSlotsSummary } from '../domain/week-block';
import type { PostSlices, ScoreRow } from '../domain/types';
import type { CommentKind } from '../constants';

// What the rubric analytics reads and writes. The sources are other modules' data; the app wires them.

/** A rubric post the scheduler sent: its first message, where it went, what it was about. */
export interface RubricPostSource {
  slotId: string;
  rubric: string;
  role: 'main' | 'followup';
  sentAt: number;
  /** The channel the post went to, as a lower-case username (null: a channel without one, or unknown). */
  channel: string | null;
  messageId: number;
  /** The poll's message when the post had one (the votes are read there). */
  pollMessageId: number | null;
  slices: Omit<PostSlices, 'hour' | 'weekday'>;
}

/** A channel post's numbers at fixed ages (content analytics' checkpoints and snapshots). */
export interface ChannelSample {
  messageId: number;
  publishedAt: number;
  v24h: number | null;
  v72h: number | null;
  likes24: number | null;
  likes72: number | null;
  contaminated: boolean;
}

export interface ScoreSources {
  /** The analytics channel (lower-case username), or null when not configured. */
  channel: string | null;
  sentRubricPosts(since: number, until: number, limit: number): Promise<RubricPostSource[]>;
  channelSamples(range: { from: number; to: number } | { messageIds: number[] }): Promise<ChannelSample[]>;
  /** Comments at 24/72 h of the channel's posts that have a thread row; absent = unknown. */
  comments(messageIds: number[]): Promise<Map<number, { c24: number; c72: number | null }>>;
  /** Comment counts of the channel's posts in a time range (the baseline's comment rate). */
  commentsInRange(from: number, to: number): Promise<Map<number, number>>;
  /** Poll voters at 24/72 h by poll message; null voters when nothing came back while the audience was quiet. */
  pollVoters(messageIds: number[]): Promise<Map<number, { v24: number | null; v72: number | null }>>;
  /** Poll posts of the channel in a range with their 24 h voters (the vote rate). */
  pollsInRange(from: number, to: number): Promise<{ messageId: number; voters24: number }[]>;
}

export interface ScoreRepository {
  scoredKeys(chatId: string, messageIds: number[]): Promise<Set<number>>;
  insert(rows: (ScoreRow & { version: number; base: object })[]): Promise<number>;
  /** Rows sent before `before` still missing their 72 h numbers. */
  lateRows(
    before: number,
    limit: number
  ): Promise<{ chatId: string; messageId: number; sentAt: number; poll: number | null }[]>;
  fillLate(
    rows: {
      chatId: string;
      messageId: number;
      views72: number | null;
      likes72: number | null;
      comments72: number | null;
      voters72: number | null;
    }[]
  ): Promise<void>;
  /** By send time, newest first, bounded. */
  bySent(range: { from: number; to: number; rubric?: string }, limit: number): Promise<ScoreRow[]>;
  byScored(from: number, to: number): Promise<ScoreRow[]>;
  countsSince(since: number): Promise<Map<string, number>>;
}

export interface WeekBlockRepository {
  get(weekKey: string): Promise<{ weekKey: string; cutFrom: number; cutTo: number; data: WeekBlock } | null>;
  latest(): Promise<{ weekKey: string; cutTo: number } | null>;
  insert(row: {
    weekKey: string;
    cutFrom: number;
    cutTo: number;
    data: WeekBlock;
    createdAt: number;
  }): Promise<boolean>;
}

export interface WeekSlotsSource {
  summary(from: number, to: number): Promise<WeekSlotsSummary>;
}

export interface ThemeRow {
  chatId: string;
  messageId: number;
  rubric: string;
  runDay: string;
  comments: number;
  commenters: number;
  limited: boolean;
  kinds: Record<CommentKind, number>;
  topics: { label: string; count: number }[];
  quote: string | null;
  createdAt: number;
}

export interface ThemesRepository {
  /** Claims the day's run: true for the one caller that may make the AI call. */
  claimRun(day: string, now: number, leaseMs: number): Promise<boolean>;
  finishRun(
    day: string,
    result: { status: 'done' | 'failed' | 'skipped'; errorCode?: string; model?: string; inputComments?: number },
    now: number
  ): Promise<void>;
  lastRun(): Promise<{ day: string; status: string; errorCode: string | null } | null>;
  themed(chatId: string, messageIds: number[]): Promise<Set<number>>;
  insert(rows: ThemeRow[]): Promise<void>;
  since(since: number, rubric?: string): Promise<ThemeRow[]>;
}

/** The scheduler's rests as the learning reads and changes them (its own table; the app wires it). */
export interface RestSettings {
  read(): Promise<{ rubric: string; restDays: number; source: 'default' | 'manual' | 'learned' }[]>;
  /** Changes a rest only when it still is `from` and not the owner's: the outcome says what happened. */
  apply(
    rubric: string,
    from: number,
    to: number,
    now: number
  ): Promise<'applied' | 'conflict' | 'manual' | 'out_of_range'>;
}

/** The scheduler's slot hours (rubric_hour_slots). */
export interface HourPlan {
  readSlots(): Promise<
    { group: string; part: 'day' | 'evening'; minute: number; source: 'learned' | 'manual'; changedAt: number }[]
  >;
  apply(
    group: string,
    part: 'day' | 'evening',
    from: number,
    to: number,
    now: number
  ): Promise<'applied' | 'conflict' | 'manual' | 'out_of_range'>;
}

export interface LearningLogRow {
  weekKey: string;
  kind: 'rest' | 'hour';
  subject: string;
  from: number;
  to: number;
  applied: boolean;
  outcome: 'advised' | 'applied' | 'conflict' | 'manual' | 'out_of_range';
  reason: string;
  createdAt: number;
}

export interface LearningRepository {
  state(): Promise<{ startedAt: number | null; applyEnabled: boolean }>;
  /** Sets the start once (the first scored post); later calls change nothing. */
  start(at: number, now: number): Promise<void>;
  /** True when the value changed. */
  setApply(enabled: boolean, now: number): Promise<boolean>;
  /** Claims a log row: true for the one run that may act on it. */
  claim(row: LearningLogRow & { id: string; numbers: object }): Promise<boolean>;
  settle(weekKey: string, kind: 'rest' | 'hour', subject: string, outcome: LearningLogRow['outcome']): Promise<void>;
  history(kind: 'rest' | 'hour', limit: number): Promise<LearningLogRow[]>;
  firstScoredAt(): Promise<number | null>;
}
