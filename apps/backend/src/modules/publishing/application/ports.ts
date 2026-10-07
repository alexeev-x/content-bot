import type { DestinationKind, PublicationDto, PublicationStatus } from '@alexeev/contracts';
import type { IdempotencyClaim } from '../../../platform/idempotency/d1-idempotency-store';
import type { PostingProblem } from '../domain/bot-posting-rights';
import type { SchedulablePost } from '../domain/schedulable';
import type { JobSnapshot } from '../domain/status-projection';

// The interface belongs to the consumer (docs/BACKEND_ARCHITECTURE.md §4).
export type SendOutcome =
  | { kind: 'sent'; externalMessageId: string }
  | { kind: 'rate_limited'; retryAfterSec: number } // 429: Telegram refused, nothing was published
  | { kind: 'rejected'; code: 'CHAT_MIGRATED' | 'CONTENT_INVALID' | 'DESTINATION_UNAVAILABLE' | 'BOT_UNAUTHORIZED' }
  | { kind: 'unknown'; reason: string }; // timeout, network, 5xx, ok without message_id

export interface PublicationTransport {
  /** `text` is Telegram HTML (see domain/format-message.ts); the adapter owns parse mode, previews and the timeout. */
  send(input: { chatId: string; text: string; imageKey?: string }): Promise<SendOutcome>;
}

/**
 * Tells the owner that a publication was scheduled or moved. It is not the publishing transport and
 * never touches job state. Called once, after the D1 write that made the change, and never for a
 * replay. An implementation must not throw or block: the change already happened.
 */
export interface ScheduleNotifier {
  scheduled(publication: PublicationDto): void;
  rescheduled(publication: PublicationDto): void;
}

/** The approved revision a publication sends; `app/container.ts` backs it with the content module. */
export interface PostRevisionSource {
  findRevision(postId: string, revision: number): Promise<{ title: string; body: string } | null>;
}

export interface ClaimedJob {
  jobId: string;
  publicationId: string | null;
  /** jobs.attempts after the claim: identifies this attempt in every later guarded write. */
  attempt: number;
}

export interface DispatchTarget {
  postId: string;
  postRevision: number;
  chatId: string;
  destinationTitle: string;
  destinationEnabled: boolean;
}

export interface ExpiredClaim {
  jobId: string;
  publicationId: string | null;
  attempt: number;
  sendStartedAt: number | null;
  /** The job's last write (the claim, or the send mark): when the attempt began, approximately. */
  startedAt: number;
}

export type ResolvedJobStatus = 'succeeded' | 'failed' | 'unknown' | 'retry_wait';

export interface JobIncident {
  id: string;
  kind: 'publish_failed' | 'publish_unknown';
  code: string;
  details: Record<string, string | number>;
}

/**
 * An incident whose write was applied, handed back to the caller so the owner can be told after the
 * state change. The titles are what the dispatcher already had in hand (null when the incident came
 * before they were loaded, or from reconcile, which loads nothing): telling the owner costs no extra read.
 */
export interface RaisedIncident {
  id: string;
  kind: JobIncident['kind'];
  code: string;
  publicationId: string | null;
  postTitle: string | null;
  channelTitle: string | null;
}

/** Everything one guarded batch writes when an attempt ends. */
export interface JobResolution {
  jobId: string;
  publicationId: string | null;
  attempt: number;
  startedAt: number;
  finishedAt: number;
  status: ResolvedJobStatus;
  /** Only for `retry_wait`. */
  runAt?: number;
  attemptOutcome: 'sent' | 'rate_limited' | 'rejected' | 'unknown' | 'skipped' | 'lease_expired';
  errorCode: string | null;
  retryAfterSec: number | null;
  externalMessageId: string | null;
  incident: JobIncident | null;
  auditAction: string;
}

export interface ExpiredResolution {
  resolution: JobResolution;
  /** What reconcile saw: the guard demands the same send mark state at write time. */
  sendStarted: boolean;
}

export interface DispatchRepository {
  /** Due `pending`/`retry_wait` publish jobs, oldest `run_at` first. */
  findDueJobIds(now: number, limit: number): Promise<string[]>;
  /** The conditional claim of docs/BACKEND_ARCHITECTURE.md §5; null when another tick (or the owner) won. */
  claim(jobId: string, now: number, leaseUntil: number): Promise<ClaimedJob | null>;
  loadTarget(publicationId: string): Promise<DispatchTarget | null>;
  /**
   * The confirmed "about to call Telegram" mark. False when the job is no longer ours, the mark is
   * already set, or the lease would not outlive the send: the caller must not send.
   */
  markSendStarted(input: { jobId: string; attempt: number; now: number; minLeaseUntil: number }): Promise<boolean>;
  /** True when the job and its attempt row already show this resolution (a write that committed but threw). */
  outcomeInPlace(resolution: JobResolution): Promise<boolean>;
  /** One batch (attempt row, incident, publication, audit, job), guarded by `claimed` and the same attempt. */
  resolve(resolution: JobResolution): Promise<boolean>;
  findExpiredClaims(now: number, limit: number): Promise<ExpiredClaim[]>;
  /** One batch for all of them; each is guarded by an expired lease, the same attempt and the same send mark. */
  resolveExpired(items: readonly ExpiredResolution[], now: number): Promise<boolean[]>;
  /**
   * The conditional claim of the owner alert: sets `owner_notified_at` where it is still NULL and
   * returns the ids this call set. An id missing from the result was claimed by another tick (or does
   * not exist): the caller must not alert for it. One statement for all ids.
   */
  claimOwnerNotices(incidentIds: readonly string[], now: number): Promise<string[]>;
  /** How many incidents are unresolved, counted up to `limit` (so the read is bounded). */
  countOpenIncidents(limit: number): Promise<number>;
}

/** What publishing needs to know about a post; `app/container.ts` backs it with the content module. */
export interface PostSource {
  findState(postId: string): Promise<SchedulablePost | null>;
}

export interface IdempotencyRef {
  scope: string;
  key: string;
  requestHash: string;
  claimedAt: number;
}

export interface IdempotencyGate {
  claim(scope: string, key: string, requestHash: string, now: number): Promise<IdempotencyClaim>;
  release(ref: IdempotencyRef): Promise<void>;
}

/** The response stored with the key in the same atomic write, so a replay returns exactly this. */
export interface StoredResponse {
  status: number;
  body: string;
}

export interface DestinationRecord {
  id: string;
  title: string;
  chatId: string;
  kind: DestinationKind;
  enabled: boolean;
  revision: number;
  /** UTC epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
}

export interface NewDestination {
  record: DestinationRecord;
  actor: string;
  idempotency: IdempotencyRef;
  response: StoredResponse;
}

export interface ListDestinationsQuery {
  enabled?: boolean;
  after?: { title: string; id: string };
  limit: number;
}

export interface DestinationChange {
  id: string;
  expectedRevision: number;
  title?: string;
  chatId?: string;
  enabled?: boolean;
  actor: string;
  now: number;
}

/** What Telegram says about a chat the owner may add, and whether this bot can post there. */
export interface ChatInspection {
  /** Canonical numeric id. */
  chatId: string;
  username: string | null;
  title: string;
  kind: DestinationKind;
  botCanPost: boolean;
  problem: PostingProblem | null;
}

export interface ChatInspector {
  /** Read-only. Throws `AppError`: NOT_FOUND CHAT_NOT_FOUND, VALIDATION_ERROR NOT_A_CHANNEL_OR_GROUP, RATE_LIMIT, UNAVAILABLE. */
  inspect(chatId: string): Promise<ChatInspection>;
}

export interface DestinationRepository {
  /** The destination saved under the numeric chat id or the `@username` (case-insensitive), or null. */
  findIdByChat(chat: { chatId: string; username: string | null }): Promise<string | null>;
  /**
   * Writes the destination, the audit row and the idempotency result in one batch.
   * `claim_lost`: the idempotency claim is no longer ours and nothing was written.
   */
  create(input: NewDestination): Promise<'created' | 'claim_lost' | 'chat_id_taken'>;
  findById(id: string): Promise<DestinationRecord | null>;
  list(query: ListDestinationsQuery): Promise<DestinationRecord[]>;
  /** `not_applied`: the revision guard did not hold (or the destination does not exist). */
  update(
    change: DestinationChange
  ): Promise<{ kind: 'updated'; record: DestinationRecord } | { kind: 'not_applied' } | { kind: 'chat_id_taken' }>;
}

export interface PublicationRecord {
  id: string;
  postId: string;
  postRevision: number;
  destinationId: string;
  /** UTC epoch milliseconds. */
  scheduledAt: number;
  timezone: string;
  revision: number;
  externalMessageId: string | null;
  lastErrorCode: string | null;
  createdAt: number;
  updatedAt: number;
  /** The publication's job: delivery state has exactly one owner. */
  job: JobSnapshot;
}

export interface NewPublication {
  id: string;
  jobId: string;
  postId: string;
  postRevision: number;
  destinationId: string;
  scheduledAt: number;
  timezone: string;
  now: number;
  actor: string;
  idempotency: IdempotencyRef;
  response: StoredResponse;
}

export interface ListPublicationsQuery {
  status?: PublicationStatus;
  postId?: string;
  destinationId?: string;
  after?: { scheduledAt: number; id: string };
  limit: number;
  /** Separates `scheduled` from `queued` for pending jobs. */
  now: number;
}

export interface PublicationChange {
  id: string;
  expectedRevision: number;
  actor: string;
  now: number;
}

export interface PublicationRescheduleChange extends PublicationChange {
  scheduledAt: number;
  timezone: string;
}

/** `current` is read in the same atomic batch as the write, so it explains why `applied` is false. */
export interface PublicationChangeOutcome {
  applied: boolean;
  current: PublicationRecord | null;
}

/** What one post's publications amount to (the read model behind the post list and the delete dialog). */
export interface PostPublicationSummary {
  counts: Record<PublicationStatus, number>;
  /** The earliest `scheduledAt` among scheduled, queued and retry_wait publications, and where it goes. */
  nextScheduled: { scheduledAt: number; destinationId: string } | null;
  /** The latest time a publication of the post was confirmed sent. */
  lastSentAt: number | null;
  /** Destinations of publications that are live or went out (not failed, not cancelled), by title. */
  destinations: { id: string; title: string }[];
}

/** A publication that is waiting to be sent, with what a one-line summary needs. */
export interface UpcomingPublication {
  id: string;
  postId: string;
  postRevision: number;
  destinationTitle: string;
  /** UTC epoch milliseconds. */
  scheduledAt: number;
  timezone: string;
}

/** What the publications scheduled inside one time range amount to. */
export interface RangeSummary {
  counts: Record<PublicationStatus, number>;
  /** The earliest `scheduledAt` among the waiting ones (scheduled, queued, retry_wait). */
  nextWaitingAt: number | null;
}

export interface PublicationRepository {
  /**
   * Writes publication, job, audit row and the idempotency result in one batch, guarded by the
   * post still being the approved revision and the destination still being enabled.
   * Returns false when a guard or the idempotency claim no longer holds; nothing was written.
   */
  create(input: NewPublication): Promise<boolean>;
  findById(id: string): Promise<PublicationRecord | null>;
  list(query: ListPublicationsQuery): Promise<PublicationRecord[]>;
  reschedule(change: PublicationRescheduleChange): Promise<PublicationChangeOutcome>;
  cancel(change: PublicationChange): Promise<PublicationChangeOutcome>;
  /**
   * One grouped read for up to 100 posts. Posts without publications are absent from the map. `now`
   * separates `scheduled` from `queued`.
   */
  summarizeByPost(postIds: readonly string[], now: number): Promise<Map<string, PostPublicationSummary>>;
  /** The next jobs to run (pending or retry_wait), earliest first; at most `limit`. */
  listUpcoming(limit: number): Promise<UpcomingPublication[]>;
  /** Counts of the publications scheduled in [from, to), read from at most RANGE_SUMMARY_ROWS of them. */
  summarizeRange(range: { from: number; to: number; now: number }): Promise<RangeSummary>;
}
