import type {
  PostEntity,
  PostKind,
  PostMediaDto,
  PostPoll,
  PostSendOptions,
  PublicationStatus
} from '@alexeev/contracts';
import type { IdempotencyClaim } from '../../../platform/idempotency/d1-idempotency-store';
import type { Post, PostStatus } from '../domain/post';

export interface PostRecord extends Post {
  /** UTC epoch milliseconds. */
  createdAt: number;
  /**
   * Until when the bot is still attaching the post's pictures (migration 0106; UTC epoch ms), or null. Nothing is
   * published before it passes or is cleared.
   */
  mediaPendingUntil: number | null;
  media?: PostMediaDto[];
}

export interface IdempotencyRef {
  scope: string;
  key: string;
  requestHash: string;
  claimedAt: number;
}

export interface NewPost {
  record: PostRecord;
  actor: string;
  idempotency: IdempotencyRef;
  /** Stored with the key in the same atomic write, so a replay returns exactly this. */
  response: { status: number; body: string };
}

export interface ListPostsQuery {
  /** `live` is every post that is not archived, by update time; `archive` the archived ones, by archive time. */
  view: 'live' | 'archive';
  status?: PostStatus;
  /** The sort key of the last row of the previous page (`updatedAt`, or `archivedAt` in the archive) and its id. */
  after?: { at: number; id: string };
  limit: number;
}

/** What a post's publications amount to; the shape `app/container.ts` backs with the publishing module. */
export interface PostPublicationSummary {
  counts: Record<PublicationStatus, number>;
  /** The earliest `scheduledAt` among publications that are still waiting, and its destination. */
  nextScheduled: { scheduledAt: number; destinationId: string } | null;
  lastSentAt: number | null;
  destinations: { id: string; title: string }[];
}

export interface PostPublicationSummarySource {
  /** Posts without publications are absent from the map. `now` separates `scheduled` from `queued`. */
  summarize(postIds: readonly string[], now: number): Promise<Map<string, PostPublicationSummary>>;
}

export interface PostChange {
  id: string;
  expectedRevision: number;
  actor: string;
  now: number;
}

export interface PostRepository {
  /**
   * Writes the post, its revision 0, the audit row and the idempotency result in one batch.
   * Returns false when the idempotency claim is no longer ours, in which case nothing was written.
   */
  create(input: NewPost): Promise<boolean>;
  findById(id: string): Promise<PostRecord | null>;
  /** Marks the post's pictures as being attached until `until`, or clears it (null). Not a revision. */
  setMediaPending(postId: string, until: number | null): Promise<void>;
  findManyByIds(ids: readonly string[]): Promise<PostRecord[]>;
  /** The stored snapshot of one revision, or null when it does not exist. */
  findRevision(
    postId: string,
    revision: number
  ): Promise<{
    title: string;
    /** Whether the title is the message's bold first line (the post's flag, fixed at creation). */
    titleInMessage: boolean;
    body: string;
    entities: PostEntity[];
    /** Kind, poll and send options as approved: the revision's own snapshot, never the post's current values. */
    kind: PostKind;
    poll: PostPoll | null;
    sendOptions: PostSendOptions;
    /** The approved rich format sent instead of `body` (migration 0103); null for a classic post. */
    richHtml: string | null;
    media: PostRevisionMedia[];
  } | null>;
  list(query: ListPostsQuery): Promise<PostRecord[]>;
  count(view: 'live' | 'archive', status?: PostStatus): Promise<number>;
  /** How many posts are in the archive (it only holds the retention period, so the count is small). */
  countArchived(): Promise<number>;
  /** Null when the guard (revision matches and the post is a draft) did not hold. */
  update(
    change: PostChange & {
      title?: string;
      body?: string;
      entities?: PostEntity[];
      poll?: PostPoll;
      sendOptions?: PostSendOptions;
    }
  ): Promise<PostRecord | null>;
  /** Null when the guard (revision matches and the post is a draft) did not hold. */
  approve(change: PostChange): Promise<PostRecord | null>;
}

export interface PostRevisionMedia {
  id: string;
  kind: PostMediaDto['kind'];
  fileName: string;
  contentType: string;
  objectKey: string;
}

export interface IdempotencyGate {
  claim(scope: string, key: string, requestHash: string, now: number): Promise<IdempotencyClaim>;
  release(ref: IdempotencyRef): Promise<void>;
}
