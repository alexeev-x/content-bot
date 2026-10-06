import type { DestinationKind, PublicationStatus } from '@alexeev/contracts';
import type { IdempotencyClaim } from '../../../platform/idempotency/d1-idempotency-store';
import type { SchedulablePost } from '../domain/schedulable';
import type { JobSnapshot } from '../domain/status-projection';

// The interface belongs to the consumer (docs/BACKEND_ARCHITECTURE.md §4).
export type SendOutcome =
  | { kind: 'sent'; externalMessageId: string }
  | { kind: 'rate_limited'; retryAfterSec: number } // 429: Telegram refused, nothing was published
  | { kind: 'rejected'; code: 'CHAT_MIGRATED' | 'CONTENT_INVALID' | 'DESTINATION_UNAVAILABLE' }
  | { kind: 'unknown'; reason: string }; // timeout, network, 5xx, ok without message_id

export interface PublicationTransport {
  send(input: { chatId: string; text: string; imageKey?: string }): Promise<SendOutcome>;
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
