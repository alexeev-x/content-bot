import type { IdempotencyClaim } from '../../../platform/idempotency/d1-idempotency-store';
import type { Post, PostStatus } from '../domain/post';

export interface PostRecord extends Post {
  /** UTC epoch milliseconds. */
  createdAt: number;
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
  status?: PostStatus;
  after?: { updatedAt: number; id: string };
  limit: number;
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
  /** The stored snapshot of one revision, or null when it does not exist. */
  findRevision(postId: string, revision: number): Promise<{ title: string; body: string } | null>;
  list(query: ListPostsQuery): Promise<PostRecord[]>;
  /** Null when the guard (revision matches and the post is a draft) did not hold. */
  update(change: PostChange & { title?: string; body?: string }): Promise<PostRecord | null>;
  /** Null when the guard (revision matches and the post is a draft) did not hold. */
  approve(change: PostChange): Promise<PostRecord | null>;
}

export interface IdempotencyGate {
  claim(scope: string, key: string, requestHash: string, now: number): Promise<IdempotencyClaim>;
  release(ref: IdempotencyRef): Promise<void>;
}
