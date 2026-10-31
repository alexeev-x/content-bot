// A slot's life (docs/scheduler/area-backend-core.md §7): planned → building → ready → released → sent, with an exit
// at every step. Every live state has its next action and its deadline, so no slot can hang: the tick moves it on or
// ends it, whatever crashed before.

export const LIVE_STATUSES = ['planned', 'building', 'ready', 'released', 'waiting_parent', 'unknown'] as const;
export const ENDED_STATUSES = [
  'sent',
  'partial',
  'unresolved',
  'send_failed',
  'missed',
  'empty',
  'skipped',
  'yielded',
  'cancelled',
  'superseded'
] as const;
export type LiveStatus = (typeof LIVE_STATUSES)[number];
export type SlotStatus = LiveStatus | (typeof ENDED_STATUSES)[number];

/** Slots that count as the rubric's posts: they consume its rest and its turn in the bank. */
export const COUNTING_STATUSES: readonly SlotStatus[] = [
  'sent',
  'partial',
  'unresolved',
  'unknown',
  'ready',
  'released'
];

const MINUTE_MS = 60_000;
/** The post is built this long before its slot (patch chains and events build at once). */
export const BUILD_LEAD_MS = 3 * 60 * MINUTE_MS;
/** How long one build may take before the tick takes it back. */
export const BUILD_LEASE_MS = 15 * MINUTE_MS;
/** Released a minute before its time, so the dispatcher's next tick sends it on time. */
export const RELEASE_LEAD_MS = MINUTE_MS;
/** A ready post not released by then is missed: it would go out late. */
export const RELEASE_LATE_MS = 4 * MINUTE_MS;
/** The publication's `not_after`: never later than this after its slot. */
export const NOT_AFTER_MS = 20 * MINUTE_MS;
/** A released slot is read back this often until it is sent or ends. */
export const PROJECT_EVERY_MS = MINUTE_MS;
/** An unconfirmed send waits this long for the owner's reconciliation before it is `unresolved`. */
export const UNKNOWN_WAIT_MS = 7 * 24 * 60 * MINUTE_MS;

export interface SlotTimes {
  slotAt: number;
  buildAt: number;
}

/** The next action and the deadline of a slot entering `status` at `now`. */
export function scheduleOf(
  status: LiveStatus,
  times: SlotTimes,
  now: number
): { nextActionAt: number; deadlineAt: number } {
  switch (status) {
    case 'planned':
      return { nextActionAt: Math.max(times.buildAt, now), deadlineAt: times.slotAt + RELEASE_LATE_MS };
    case 'building':
      return { nextActionAt: now + BUILD_LEASE_MS, deadlineAt: times.slotAt + RELEASE_LATE_MS };
    case 'ready':
      return {
        nextActionAt: Math.max(times.slotAt - RELEASE_LEAD_MS, now),
        deadlineAt: times.slotAt + RELEASE_LATE_MS
      };
    case 'released':
    case 'waiting_parent':
      return { nextActionAt: now + PROJECT_EVERY_MS, deadlineAt: times.slotAt + NOT_AFTER_MS + 10 * MINUTE_MS };
    case 'unknown':
      return { nextActionAt: now + 10 * MINUTE_MS, deadlineAt: now + UNKNOWN_WAIT_MS };
  }
}

/** Where a live slot ends when its deadline passes with nothing done. */
export function exitOf(status: LiveStatus): SlotStatus {
  switch (status) {
    case 'planned':
    case 'building':
      return 'empty';
    case 'ready':
      return 'missed';
    case 'released':
    case 'waiting_parent':
      return 'missed';
    case 'unknown':
      return 'unresolved';
  }
}

/** What publishing's status of the slot's publication means for the slot. */
export function projectedStatus(
  publication:
    'scheduled' | 'queued' | 'preparing' | 'sending' | 'retry_wait' | 'sent' | 'failed' | 'unknown' | 'cancelled',
  lastErrorCode: string | null
): SlotStatus | null {
  switch (publication) {
    case 'sent':
      return 'sent';
    case 'failed':
      return 'send_failed';
    case 'unknown':
      return 'unknown';
    case 'cancelled':
      // Past its `not_after` the dispatcher dropped it: the slot was missed, not cancelled by the owner.
      return lastErrorCode === 'NOT_AFTER_PASSED' ? 'missed' : 'cancelled';
    default:
      return null;
  }
}
