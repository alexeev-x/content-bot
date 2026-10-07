import type { BulkRestorePostsResultDto } from '@alexeev/contracts';
import { AppError } from '../../../shared/app-error';
import type { LifecycleRepository, PostRef, RestoreRefusal } from './ports';

export interface RestorePostsDeps {
  repo: LifecycleRepository;
  now: number;
}

export async function restorePosts(
  deps: RestorePostsDeps,
  command: { actor: string; items: readonly PostRef[] }
): Promise<BulkRestorePostsResultDto> {
  const outcomes = await deps.repo.restorePosts({ items: command.items, actor: command.actor, now: deps.now });
  return { items: outcomes };
}

const REFUSAL_MESSAGES: Record<Exclude<RestoreRefusal, 'NOT_FOUND'>, string> = {
  STALE_REVISION: 'The post changed since this revision was read',
  NOT_ARCHIVED: 'The post is not in the archive'
};

/** Throws the refusal as the error of the single-post endpoint; returns when the post is out of the archive. */
export async function restorePost(
  deps: RestorePostsDeps,
  command: { actor: string; id: string; revision: number }
): Promise<void> {
  const { items } = await restorePosts(deps, {
    actor: command.actor,
    items: [{ id: command.id, revision: command.revision }]
  });
  const item = items[0];
  if (item === undefined) throw new AppError('UNAVAILABLE', 'The change was not applied');
  if (item.outcome === 'restored') return;
  if (item.reason === 'NOT_FOUND') throw new AppError('NOT_FOUND', 'Post not found');
  throw new AppError('CONFLICT', REFUSAL_MESSAGES[item.reason], { reason: item.reason });
}
