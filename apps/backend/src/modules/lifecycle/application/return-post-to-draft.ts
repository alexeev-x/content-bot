import { AppError } from '../../../shared/app-error';
import type { LifecycleRepository, ReturnToDraftRefusal } from './ports';

export interface ReturnToDraftDeps {
  repo: LifecycleRepository;
  now: number;
}

const REFUSAL_MESSAGES: Record<Exclude<ReturnToDraftRefusal, 'NOT_FOUND'>, string> = {
  STALE_REVISION: 'The post changed since this revision was read',
  NOT_APPROVED: 'Only an approved post can return to draft',
  PUBLICATION_PENDING: 'A publication is still waiting to be sent',
  PUBLICATION_IN_PROGRESS: 'A publication of this post is being sent',
  PUBLICATION_UNKNOWN: 'A publication of this post has an unconfirmed result and needs reconciliation'
};

export async function returnPostToDraft(
  deps: ReturnToDraftDeps,
  command: { actor: string; id: string; revision: number }
): Promise<void> {
  const outcome = await deps.repo.returnPostToDraft({ ...command, now: deps.now });
  if (outcome.outcome === 'returned') return;
  if (outcome.reason === 'NOT_FOUND') throw new AppError('NOT_FOUND', 'Post not found');
  throw new AppError('CONFLICT', REFUSAL_MESSAGES[outcome.reason], { reason: outcome.reason });
}
