import type {
  BulkDeletePublicationsInput,
  BulkDeletePublicationsResultDto,
  DeletePublicationInput,
  DeletePublicationResultDto
} from '@alexeev/contracts';
import { AppError } from '../../../shared/app-error';
import type { PublicationRepository } from './ports';

export interface DeletePublicationsDeps {
  repo: PublicationRepository;
  now: number;
}

export async function deletePublications(
  deps: DeletePublicationsDeps,
  command: { actor: string; input: BulkDeletePublicationsInput }
): Promise<BulkDeletePublicationsResultDto> {
  return {
    items: await deps.repo.deleteFinal({
      items: command.input.items,
      actor: command.actor,
      now: deps.now
    })
  };
}

export async function deletePublication(
  deps: DeletePublicationsDeps,
  command: { actor: string; id: string; input: DeletePublicationInput }
): Promise<DeletePublicationResultDto> {
  const [result] = await deps.repo.deleteFinal({
    items: [{ id: command.id, revision: command.input.revision }],
    actor: command.actor,
    now: deps.now
  });
  if (result === undefined) throw new AppError('UNAVAILABLE', 'Publication deletion returned no result');
  if (result.outcome === 'deleted') return result;
  if (result.reason === 'NOT_FOUND') throw new AppError('NOT_FOUND', 'Publication not found');
  throw new AppError('CONFLICT', 'The publication could not be deleted', {
    reason: result.reason,
    ...(result.reason === 'PUBLICATION_UNKNOWN' || result.reason === 'PUBLICATION_IN_PROGRESS'
      ? { publicationId: command.id }
      : {})
  });
}
