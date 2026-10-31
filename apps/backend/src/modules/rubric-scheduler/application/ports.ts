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
}

export type NewSlot = Omit<
  SlotRow,
  | 'build'
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
>;

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
  /** The rubric's newest slots, every status. */
  ofRubric(rubricKey: string, limit: number): Promise<SlotRow[]>;
  /** How many of the rubric's slots took a turn (sent or on their way): the bank's turn counter. */
  countingOf(rubricKey: string): Promise<number>;
  /** Live slots whose next action is due, oldest first. */
  due(now: number, limit: number): Promise<SlotRow[]>;
  live(): Promise<SlotRow[]>;
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
      nextActionAt: number;
      deadlineAt: number;
      leaseUntil: number | null;
      attempt: number;
      candIdx: number;
      rubricKey: string;
      build: SlotBuild | null;
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
