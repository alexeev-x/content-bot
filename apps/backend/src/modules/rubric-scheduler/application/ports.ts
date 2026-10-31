import type { SlotStatus } from '../domain/slot-machine';
import type { ChannelPost, Need, RubricDescriptor } from '../domain/types';

// What the scheduler reads and writes; app/container.ts binds each port to D1 or another module's index.

export interface ForecastSources {
  /** Every rubric as the scheduler sees it (RUBRIC_META mapped by app/). */
  rubrics(): RubricDescriptor[];
  /** The channel's posts from `since` on, ours and the news, past and scheduled. */
  channelPosts(since: number): Promise<ChannelPost[]>;
  /** The newest patch's time: rubrics with old numbers stay quiet after it. */
  latestPatchAt(): Promise<number | null>;
  /** What this Worker can run: Browser Rendering, the AI, STRATZ, the match base. */
  capabilities: ReadonlySet<Need>;
}

export interface SchedulerSettings {
  enabled: boolean;
  destinationId: string | null;
  horoscopeAnchorWeek: string | null;
  offCleanupDone: boolean;
  revision: number;
  updatedAt: number;
}

export interface RubricSettingRow {
  rubricKey: string;
  enabled: boolean;
  baseRestDays: number;
  restDays: number;
  restSource: 'default' | 'manual' | 'learned';
  lastSentAt: number | null;
  lastSentSeeded: boolean;
  lastFailedAt: number | null;
  lastFailCode: string | null;
  skipUntil: number | null;
  pausedReason: 'BANK_EXHAUSTED' | null;
  revision: number;
  updatedAt: number;
}

export interface SchedulerSettingsRepository {
  read(): Promise<SchedulerSettings>;
  /** Conditional on the revision; false when someone changed it meanwhile. */
  update(input: {
    enabled: boolean;
    destinationId: string | null;
    horoscopeAnchorWeek: string | null;
    revision: number;
    now: number;
  }): Promise<boolean>;
  markCleanupDone(now: number): Promise<void>;
  rubrics(): Promise<RubricSettingRow[]>;
  /** Missing rows only (INSERT OR IGNORE): a rubric's own row is never reset. */
  seedRubrics(
    rows: { rubricKey: string; restDays: number; lastSentAt: number | null; seeded: boolean }[],
    now: number
  ): Promise<void>;
  /** The owner's change, conditional on the revision; `restDays` sets the source to manual. */
  updateRubric(input: {
    rubricKey: string;
    revision: number;
    enabled?: boolean;
    restDays?: number;
    lastSentAt?: number;
    now: number;
  }): Promise<boolean>;
  rubricSent(rubricKey: string, at: number): Promise<void>;
  rubricFailed(rubricKey: string, at: number, code: string): Promise<void>;
  rubricSkipped(rubricKey: string, until: number): Promise<void>;
  pauseRubric(rubricKey: string, now: number, bankSize: number): Promise<void>;
  /** Claims a periodic step when it is due; true for the one tick that won it. */
  claimStep(step: 'plan' | 'health' | 'purge', now: number, nextDueAt: number): Promise<boolean>;
  stepDone(step: 'plan' | 'health' | 'purge', now: number, errorCode: string | null): Promise<void>;
  /** Makes the plan step due at once (a change the plan must see). */
  planDirty(): Promise<void>;
  lastPlanAt(): Promise<number | null>;
  stepHealth(step: 'plan' | 'health' | 'purge'): Promise<StepHealth>;
}

export interface SlotRow {
  id: string;
  mskDay: string;
  slotAt: number;
  kind: 'pool' | 'event' | 'anchor' | 'follow_up' | 'poll_close';
  rubricKey: string;
  candidates: string[];
  candIdx: number;
  attempt: number;
  status: SlotStatus;
  buildAt: number;
  nextActionAt: number;
  deadlineAt: number;
  leaseUntil: number | null;
  weight: 'V' | 'L';
  interactive: boolean;
  family: string;
  manual: boolean;
  dedupeKey: string;
  reason: { kind: string; text: string };
  build: SlotBuild | null;
  /** What the post is about (the rubrics' facts): later posts' inner rules read it. */
  facts: Record<string, unknown> | null;
  postId: string | null;
  publicationId: string | null;
  messageIds: string[];
  pollId: string | null;
  sentAt: number | null;
  errorCode: string | null;
  errorStep: string | null;
  createdAt: number;
  updatedAt: number;
}

/** What a build made: the studio posts in send order (a picture, then its poll) and what the slot needs to release. */
export interface SlotBuild {
  posts: { postId: string; revision: number; kind: 'text' | 'poll' }[];
  /** Their publications once released, in the same order. */
  publications?: string[];
  degradations: string[];
  hasPicture: boolean;
  hasPoll: boolean;
  /** The bank turn this post took (`bankTurn % bankSize` is the line). */
  bankTurn: number | null;
  /** Browser Rendering time the build used: the daily cap counts it (stage P). */
  browserMs?: number;
  /** A second post built with the first (04's answer): released `afterMinutes` after the first went out. */
  followUp?: {
    afterMinutes: number;
    posts: { postId: string; revision: number; kind: 'text' | 'poll' }[];
    /** 04: the riddle's hero, matched against the riddle's comments when the answer is released. */
    guessHero?: { name: string; key: string };
  };
  /** A follow-up's riddle hero (copied from its parent's build): «Первым угадал» is added at release. */
  guessHero?: { name: string; key: string };
}

export type NewSlot = Omit<
  SlotRow,
  | 'build'
  | 'facts'
  | 'postId'
  | 'publicationId'
  | 'messageIds'
  | 'pollId'
  | 'sentAt'
  | 'errorCode'
  | 'errorStep'
  | 'leaseUntil'
  | 'manual'
  | 'updatedAt'
> & {
  /** A trial hour (one pool slot in five an hour off its usual time): the hour learning needs these. */
  explore?: boolean;
};

export interface SlotAttemptRow {
  slotId: string;
  attempt: number;
  step:
    | 'capability'
    | 'data'
    | 'writer'
    | 'similarity'
    | 'scene'
    | 'render'
    | 'photo'
    | 'store'
    | 'release'
    | 'dispatch'
    | 'project';
  rubricKey: string;
  outcome: 'ok' | 'failed' | 'skipped' | 'degraded';
  provider: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  message: string | null;
  startedAt: number;
  finishedAt: number;
}

export interface SlotRepository {
  /** Slots with `slot_at` in `[from, to)`, every status, oldest first (≤ 500). */
  between(from: number, to: number): Promise<SlotRow[]>;
  byId(id: string): Promise<SlotRow | null>;
  /** Which rubric owns each publication (a slot's own, or one of a series in `build.publications`); ≤ 100 ids. */
  rubricOfPublications(publicationIds: string[]): Promise<Map<string, string>>;
  /** The rubric's newest slots, every status. */
  ofRubric(rubricKey: string, limit: number): Promise<SlotRow[]>;
  /** How many of the rubric's slots took a turn (sent or on their way): the bank's turn counter. */
  countingOf(rubricKey: string): Promise<number>;
  /** Live slots whose next action is due, oldest first. */
  due(now: number, limit: number): Promise<SlotRow[]>;
  live(): Promise<SlotRow[]>;
  /** The dedupe keys among these that a live, sent or skipped slot already holds. */
  taken(keys: readonly string[]): Promise<Set<string>>;
  /** Inserts what is not there yet (a taken time or dedupe key is skipped); returns how many went in. */
  insert(slots: NewSlot[], now: number): Promise<number>;
  /**
   * Moves a slot from one status to another, conditional on that status (and the attempt when given); false when
   * another tick moved it first.
   */
  transition(input: {
    id: string;
    from: SlotStatus;
    attempt?: number;
    to: SlotStatus;
    now: number;
    set?: Partial<{
      slotAt: number;
      nextActionAt: number;
      deadlineAt: number;
      leaseUntil: number | null;
      attempt: number;
      candIdx: number;
      rubricKey: string;
      build: SlotBuild | null;
      facts: Record<string, unknown> | null;
      postId: string | null;
      publicationId: string | null;
      messageIds: string[];
      pollId: string | null;
      sentAt: number | null;
      errorCode: string | null;
      errorStep: string | null;
      manual: boolean;
    }>;
  }): Promise<boolean>;
  recordAttempt(row: SlotAttemptRow): Promise<void>;
  attempts(slotId: string): Promise<SlotAttemptRow[]>;
  /** Removes attempts older than `before` (90 days). */
  purgeAttempts(before: number, limit: number): Promise<number>;
  /** Empties `build` and `facts` of ended slots that were due before `before` (90 days); the row stays as history. */
  purgeBuilds(before: number, limit: number): Promise<number>;
}

/** The owner's posts sent straight to the channel (migration 0125): only their time matters to the scheduler. */
export interface ChannelPostRepository {
  /** Stores one; a repeated update changes nothing. */
  record(chatId: string, messageId: number, at: number): Promise<void>;
  /** Posts of a channel from `since` on, newest first, at most 200. */
  since(chatId: string, since: number): Promise<{ at: number; messageId: number }[]>;
  /** Removes up to `limit` rows older than `before`; returns how many. */
  purge(before: number, limit: number): Promise<number>;
}

export interface NoticeRepository {
  /** Claims a notice key for the Moscow day; false when it was already sent or the day's cap is reached. */
  claim(input: {
    key: string;
    mskDay: string;
    kind: 'failure' | 'health' | 'bank' | 'summary';
    now: number;
    cap: number;
  }): Promise<boolean>;
  purge(before: string): Promise<void>;
}

export interface BreakerRepository {
  /** Records a failure; opens the breaker for `openMs` once `threshold` failures fall inside `windowMs`. */
  recordFailure(input: {
    scope: 'provider' | 'rubric';
    key: string;
    now: number;
    code: string;
    windowMs: number;
    threshold: number;
    openMs: number;
  }): Promise<{ opened: boolean; openedUntil: number | null }>;
  /** The breakers open at `now`. */
  open(scope: 'provider' | 'rubric', now: number): Promise<{ key: string; until: number; code: string | null }[]>;
}

export interface StepHealth {
  failCount: number;
  lastErrorCode: string | null;
  lastSuccessAt: number | null;
}

export interface OpenBet {
  id: string;
  chain: string;
  heroIds: number[];
  postSlotId: string;
  pollId: string | null;
  form: 'picture' | 'text';
  openedAt: number;
}

export interface BetRepository {
  open(): Promise<OpenBet | null>;
  /** Opens a bet; false when another is open (one at a time, by a unique index). */
  place(input: Omit<OpenBet, 'id' | 'openedAt'> & { id: string; now: number }): Promise<boolean>;
  /** Closes the open bet once its result went out; false when it was closed meanwhile. */
  resolve(input: { id: string; resultSlotId: string; votes: unknown; now: number }): Promise<boolean>;
}
