import type { SourceEventDto } from '@alexeev/contracts';
import {
  buildEventDraft,
  type DotaWatcherRepository,
  type SourceEventKey,
  type SourceEventsRepository
} from '../../modules/dota';
import { createPost, type IdempotencyGate, type PostRepository } from '../../modules/content';
import { AppError } from '../../shared/app-error';

// The owner's «create draft» on an event. It shares the reservation (`dota_update_items.draft_post_id`) and the
// idempotency key (per reserved post id, so a draft re-created after a soft delete is not replayed as the old
// one) with the Cron auto-draft, so the two can race or repeat and still leave one post.
export async function createSourceEventDraft(
  deps: {
    events: SourceEventsRepository;
    repo: Pick<DotaWatcherRepository, 'reserveDraft'>;
    posts: PostRepository;
    idempotency: IdempotencyGate;
    actor: string;
    now: () => number;
    newId: () => string;
  },
  id: SourceEventKey
): Promise<{ event: SourceEventDto; created: boolean }> {
  const input = await deps.events.loadDraftInput(id);
  if (input === null) throw new AppError('NOT_FOUND', 'Event not found');
  if (input.event.status === 'hidden') throw new AppError('CONFLICT', 'Event is hidden', { reason: 'EVENT_HIDDEN' });
  if (input.event.draft !== null) return { event: input.event, created: false };

  const reservedId =
    input.draftPostId ??
    (await deps.repo.reserveDraft({ sourceKey: id.sourceKey, externalId: id.externalId, postId: deps.newId() }));
  if (reservedId === null) throw new AppError('NOT_FOUND', 'Event not found');

  let created = false;
  if ((await deps.posts.findById(reservedId)) === null) {
    await createPost(
      { repo: deps.posts, idempotency: deps.idempotency, now: deps.now(), newId: () => reservedId },
      {
        actor: deps.actor,
        idempotencyKey: `dota:${id.sourceKey}:${id.externalId}:${reservedId}`,
        input: buildEventDraft(input.source, input.entities, input.watched)
      }
    );
    created = true;
  }
  const event = await deps.events.find(id);
  if (event === null) throw new AppError('NOT_FOUND', 'Event not found');
  return { event, created };
}
