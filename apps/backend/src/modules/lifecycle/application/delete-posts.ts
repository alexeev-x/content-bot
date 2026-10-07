import type { BulkDeletePostsResultDto, DeletePostResultDto } from '@alexeev/contracts';
import { AppError } from '../../../shared/app-error';
import type { CancelledPublication, DeleteRefusal, LifecycleRepository, PostRef } from './ports';

export interface DeletePostsDeps {
  repo: LifecycleRepository;
  now: number;
}

const toCancelledDto = (publication: CancelledPublication) => ({
  id: publication.id,
  destinationId: publication.destinationId,
  scheduledAt: new Date(publication.scheduledAt).toISOString()
});

// Each post is decided on its own; a refusal is data here, never an error for the whole request.
export async function deletePosts(
  deps: DeletePostsDeps,
  command: { actor: string; items: readonly PostRef[] }
): Promise<BulkDeletePostsResultDto> {
  const outcomes = await deps.repo.deletePosts({ items: command.items, actor: command.actor, now: deps.now });
  return {
    items: outcomes.map((outcome) =>
      outcome.outcome === 'deleted'
        ? {
            id: outcome.id,
            outcome: 'deleted' as const,
            cancelledPublications: outcome.cancelledPublications.map(toCancelledDto)
          }
        : {
            id: outcome.id,
            outcome: 'refused' as const,
            reason: outcome.reason,
            ...(outcome.publicationId === undefined ? {} : { publicationId: outcome.publicationId })
          }
    )
  };
}

const REFUSAL_MESSAGES: Record<Exclude<DeleteRefusal, 'NOT_FOUND'>, string> = {
  STALE_REVISION: 'The post changed since this revision was read',
  PUBLICATION_IN_PROGRESS: 'A publication of this post is being sent',
  PUBLICATION_UNKNOWN: 'A publication of this post has an unconfirmed result and needs reconciliation'
};

export async function deletePost(
  deps: DeletePostsDeps,
  command: { actor: string; id: string; revision: number }
): Promise<DeletePostResultDto> {
  const { items } = await deletePosts(deps, {
    actor: command.actor,
    items: [{ id: command.id, revision: command.revision }]
  });
  const item = items[0];
  if (item === undefined) throw new AppError('UNAVAILABLE', 'The change was not applied');
  if (item.outcome === 'deleted') return { id: item.id, cancelledPublications: item.cancelledPublications };
  if (item.reason === 'NOT_FOUND') throw new AppError('NOT_FOUND', 'Post not found');
  throw new AppError('CONFLICT', REFUSAL_MESSAGES[item.reason], {
    reason: item.reason,
    ...(item.publicationId === undefined ? {} : { publicationId: item.publicationId })
  });
}
