export interface PostRef {
  id: string;
  revision: number;
}

/** A publication that was still waiting (scheduled, queued, retry_wait) and went away with its post. */
export interface CancelledPublication {
  id: string;
  destinationId: string;
  /** UTC epoch milliseconds. */
  scheduledAt: number;
}

export type DeleteRefusal = 'NOT_FOUND' | 'STALE_REVISION' | 'PUBLICATION_IN_PROGRESS' | 'PUBLICATION_UNKNOWN';
export type RestoreRefusal = 'NOT_FOUND' | 'STALE_REVISION' | 'NOT_ARCHIVED';
export type ReturnToDraftRefusal =
  | 'NOT_FOUND'
  | 'STALE_REVISION'
  | 'NOT_APPROVED'
  | 'PUBLICATION_PENDING'
  | 'PUBLICATION_IN_PROGRESS'
  | 'PUBLICATION_UNKNOWN';

export type ReturnToDraftOutcome =
  { id: string; outcome: 'returned' } | { id: string; outcome: 'refused'; reason: ReturnToDraftRefusal };

export type DeleteItemOutcome =
  | { id: string; outcome: 'deleted'; cancelledPublications: CancelledPublication[] }
  | { id: string; outcome: 'refused'; reason: DeleteRefusal; publicationId?: string };

export type RestoreItemOutcome =
  { id: string; outcome: 'restored' } | { id: string; outcome: 'refused'; reason: RestoreRefusal };

/**
 * The only writer of `posts.archived_at` and the only place that deletes a post. Archiving and deleting
 * decide on publication state and change posts and publications together, so each operation is one
 * atomic D1 batch that carries its own guards; two Cron ticks or a racing dispatcher claim change nothing
 * the first writer already decided.
 */
export interface LifecycleRepository {
  /**
   * Deletes each post with its publications, attempts and incidents, cancelling the ones still waiting.
   * Every post is decided on its own inside one batch: refused when a publication is being sent or
   * unknown, or when the revision is stale. Outcomes come back in request order.
   */
  deletePosts(input: { items: readonly PostRef[]; actor: string; now: number }): Promise<DeleteItemOutcome[]>;
  /** Takes archived posts back to the live list (`approved`, same revision). Never creates a job. */
  restorePosts(input: { items: readonly PostRef[]; actor: string; now: number }): Promise<RestoreItemOutcome[]>;
  /** Changes an approved post back to draft without changing any publication or job history. */
  returnPostToDraft(input: PostRef & { actor: string; now: number }): Promise<ReturnToDraftOutcome>;
  /**
   * Live approved posts whose publications finished at or after `since` and now qualify for the
   * archive: a sent publication (after the last restore) and nothing active.
   */
  findArchivable(input: { since: number; limit: number }): Promise<string[]>;
  /** Archives the posts that still qualify at write time; returns how many were archived. */
  archivePosts(input: { ids: readonly string[]; now: number }): Promise<number>;
  /** Archived posts whose retention ended at or before `before`, oldest first, never one that cannot be deleted. */
  findExpired(input: { before: number; limit: number }): Promise<string[]>;
  /** Deletes the posts that are still archived and expired at write time; returns how many were deleted. */
  purgePosts(input: { ids: readonly string[]; before: number; now: number }): Promise<number>;
}
