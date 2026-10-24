import type { IncidentDto } from '@alexeev/contracts';
import { AppError } from '../../../shared/app-error';
import { toIncidentDto } from './incident-dto';
import type { IncidentRepository } from './ports';

/**
 * The owner has seen a failed send. It only closes the incident (and audits it): the publication is
 * not touched, nothing is retried and nothing is sent. An `unknown` send is closed only by
 * reconciling it, so the list can never claim a send was checked when it was not.
 */
export async function resolveIncident(
  deps: { repo: IncidentRepository; now: number },
  command: { actor: string; id: string }
): Promise<IncidentDto> {
  const current = await deps.repo.acknowledgeFailed({ id: command.id, actor: command.actor, now: deps.now });
  if (current === null) throw new AppError('NOT_FOUND', 'Incident not found');
  if (current.kind !== 'publish_failed') {
    throw new AppError('CONFLICT', 'An unknown send is closed by reconciling the publication', {
      reason: 'USE_RESOLVE_UNKNOWN'
    });
  }
  // Unreachable while the write is one atomic batch; fail loudly rather than guess.
  if (current.resolvedAt === null) throw new AppError('UNAVAILABLE', 'The change was not applied');
  return toIncidentDto(current, deps.now);
}
