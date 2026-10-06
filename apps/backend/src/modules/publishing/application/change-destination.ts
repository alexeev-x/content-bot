import type { DestinationDto, UpdateDestinationInput } from '@alexeev/contracts';
import { toDestinationDto } from './destination-dto';
import { chatIdTaken, destinationNotFound, staleDestination } from './destination-errors';
import type { DestinationRepository } from './ports';

// One guarded write (the revision is in the WHERE clause), so two edits of the same revision
// cannot both win. Only when the guard fails do we read the destination to tell the caller why.
export async function updateDestination(
  deps: { repo: DestinationRepository; now: number },
  command: { actor: string; id: string; input: UpdateDestinationInput }
): Promise<DestinationDto> {
  const { actor, id, input } = command;
  const outcome = await deps.repo.update({
    id,
    expectedRevision: input.revision,
    title: input.title,
    chatId: input.chatId,
    enabled: input.enabled,
    actor,
    now: deps.now
  });
  if (outcome.kind === 'updated') return toDestinationDto(outcome.record);
  if (outcome.kind === 'chat_id_taken') throw chatIdTaken();

  const current = await deps.repo.findById(id);
  if (current === null) throw destinationNotFound();
  throw staleDestination();
}
