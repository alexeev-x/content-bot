import type { DestinationKind, PublicationStatus } from '@alexeev/contracts';
import type { IdempotencyClaim } from '../../../platform/idempotency/d1-idempotency-store';
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

export interface DestinationRepository {
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
}
