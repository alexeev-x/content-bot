// Numbers that bound one Cron tick and one job (docs/BACKEND_ARCHITECTURE.md §5).

/**
 * Jobs claimed per tick. A job costs 5 D1 round trips (claim, target, revision, send mark, outcome
 * batch), at most 8 statements (the incident aggregate is maintained by the D1 insert trigger), and
 * 1 Telegram subrequest. The measured worst mix is pinned below the Free-plan query ceiling in
 * tests/integration/dispatcher-budget.test.ts; incident alert groups are paged separately.
 */
export const DISPATCH_BATCH = 2;

/** Expired claims turned into a new state per tick; each needs up to 5 statements in one batch. */
export const RECONCILE_BATCH = 1;

/** How long a claim belongs to its dispatcher. A claim is made right before the job is processed. */
export const LEASE_MS = 2 * 60 * 1000;

/** Upper bound of a Telegram call without media; also what the lease must outlive. */
export const SEND_TIMEOUT_MS = 10_000;

// A post's files are uploaded within the same call, so its bound grows with their size (DEV 22.10.2026: a 40+ MB
// video was cut off at 10 s and the post went unknown without reaching the channel). 1 MB/s is a pessimistic upload
// rate from a Worker to Telegram; the cap keeps the call, the outcome write and the claim's first steps in the lease.
// Decimal megabytes, so the 90 MB limit the owner reads is the one applied.
const UPLOAD_BYTES_PER_SECOND = 1_000_000;
export const MAX_SEND_TIMEOUT_MS = 100_000;
/** Files that cannot be uploaded within the cap are refused before the send, never left unknown. */
export const MAX_SEND_MEDIA_BYTES = ((MAX_SEND_TIMEOUT_MS - SEND_TIMEOUT_MS) / 1000) * UPLOAD_BYTES_PER_SECOND;

/** Slack on top of the send timeout so the outcome write still happens inside the lease. */
const OUTCOME_WRITE_MARGIN_MS = 5_000;

/** The bound of one send: the base plus the upload time of its files at the pessimistic rate, capped. */
export function sendTimeoutMs(mediaBytes: number): number {
  const upload = Math.ceil((Math.max(0, mediaBytes) / UPLOAD_BYTES_PER_SECOND) * 1000);
  return Math.min(SEND_TIMEOUT_MS + upload, MAX_SEND_TIMEOUT_MS);
}

export const MAX_ATTEMPTS = 5;

const BACKOFF_BASE_MS = 5_000;
const BACKOFF_CAP_MS = 10 * 60 * 1000;
const MAX_RETRY_AFTER_SEC = 24 * 60 * 60;
const MAX_JITTER_MS = 5_000;

/** The send is allowed only if the lease still covers the call and the outcome write. */
export function minLeaseForSend(now: number, timeoutMs: number = SEND_TIMEOUT_MS): number {
  return now + timeoutMs + OUTCOME_WRITE_MARGIN_MS;
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
