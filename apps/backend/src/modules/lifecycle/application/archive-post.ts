import { AppError } from '../../../shared/app-error';
import type { ArchiveRefusal, LifecycleRepository } from './ports';

export interface ArchivePostDeps {
  repo: LifecycleRepository;
  now: number;
}

const REFUSAL_MESSAGES: Record<Exclude<ArchiveRefusal, 'NOT_FOUND'>, string> = {
  STALE_REVISION: 'The post changed since this revision was read',
  ALREADY_ARCHIVED: 'The post is already archived',
  PUBLICATION_PENDING: 'The post has a publication that is still scheduled or waiting to retry',
  PUBLICATION_IN_PROGRESS: 'A publication of this post is being sent',
  PUBLICATION_UNKNOWN: 'A publication of this post has an unconfirmed result and needs reconciliation'
};

/**
 * Owner action: move a live post to the archive without cancelling or racing publication work.
 * Any publication that can still send must be cancelled/reconciled first.
 */
export async function archivePost(
  deps: ArchivePostDeps,
  command: { actor: string; id: string; revision: number }
): Promise<void> {
  const item = await deps.repo.archivePost({ ...command, now: deps.now });
  if (item.outcome === 'archived') return;
  if (item.reason === 'NOT_FOUND') throw new AppError('NOT_FOUND', 'Post not found');
  throw new AppError('CONFLICT', REFUSAL_MESSAGES[item.reason], {
    reason: item.reason,
    ...(item.publicationId === undefined ? {} : { publicationId: item.publicationId })
  });
}
