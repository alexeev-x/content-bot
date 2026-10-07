// Numbers that bound one Cron tick and one job (docs/BACKEND_ARCHITECTURE.md §5).

/**
 * Jobs claimed per tick. A job costs 5 D1 round trips (claim, target, revision, send mark, outcome
 * batch), at most 9 statements (5 in the outcome batch when it has an incident), and 1 subrequest
 * (the Telegram call). The true worst tick, counted per statement: reconcile 1 + 5, due scan 1,
 * 3 jobs x 9, one outcome-write retry 1 + 5 (re-read, rewrite), hourly cleanup 5, archive step 2,
 * alert origin read, alert claim and heartbeat 3 = 50 statements (27 round trips): exactly the Free
 * plan's 50 queries per invocation even if every statement of a batch were counted on its own, so any
 * new tick statement needs room made first. Pinned in tests/integration/dispatcher-budget.test.ts.
 */
export const DISPATCH_BATCH = 3;

/** Expired claims turned into a new state per tick; each needs up to 5 statements in one batch. */
export const RECONCILE_BATCH = 1;

/** How long a claim belongs to its dispatcher. A claim is made right before the job is processed. */
export const LEASE_MS = 2 * 60 * 1000;

/** Upper bound of the Telegram call; also what the lease must outlive. */
export const SEND_TIMEOUT_MS = 10_000;

/** Slack on top of the send timeout so the outcome write still happens inside the lease. */
const OUTCOME_WRITE_MARGIN_MS = 5_000;

export const MAX_ATTEMPTS = 5;

const BACKOFF_BASE_MS = 5_000;
const BACKOFF_CAP_MS = 10 * 60 * 1000;
const MAX_RETRY_AFTER_SEC = 24 * 60 * 60;
const MAX_JITTER_MS = 5_000;

/** The send is allowed only if the lease still covers the call and the outcome write. */
export function minLeaseForSend(now: number): number {
  return now + SEND_TIMEOUT_MS + OUTCOME_WRITE_MARGIN_MS;
}

export function attemptsExhausted(attempt: number): boolean {
  return attempt >= MAX_ATTEMPTS;
}

/** Exponential backoff after `attempt` failed attempts: 5 s, 10 s, 20 s ... capped at 10 min. */
export function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1), BACKOFF_CAP_MS);
}

/**
 * When a retry may run. `random` is in [0, 1). Telegram's `retry_after` is a floor (never retry
 * sooner than it asks); the backoff only matters when Telegram asks for less than it.
 */
export function retryRunAt(input: { now: number; attempt: number; retryAfterSec?: number; random: number }): number {
  const asked = Math.min(Math.max(input.retryAfterSec ?? 0, 0), MAX_RETRY_AFTER_SEC) * 1000;
  return input.now + Math.max(asked, backoffMs(input.attempt)) + Math.floor(input.random * MAX_JITTER_MS);
}
