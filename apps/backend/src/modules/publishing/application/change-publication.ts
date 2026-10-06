import type { CancelPublicationInput, PublicationDto, ReschedulePublicationInput } from '@alexeev/contracts';
import { AppError } from '../../../shared/app-error';
import { isBeforeSend } from '../domain/job-transitions';
import { isInScheduleWindow } from '../domain/schedule-window';
import type { PublicationChangeOutcome, PublicationRepository } from './ports';
import { publicationNotFound, scheduleOutOfRange, staleRevision } from './publication-errors';
import { toPublicationDto } from './publication-dto';

export interface ChangePublicationDeps {
  repo: PublicationRepository;
  now: number;
}

export async function reschedulePublication(
  deps: ChangePublicationDeps,
  command: { actor: string; id: string; input: ReschedulePublicationInput }
): Promise<PublicationDto> {
  const { actor, id, input } = command;
  const scheduledAt = Date.parse(input.scheduledAt);
  if (!isInScheduleWindow(scheduledAt, deps.now)) throw scheduleOutOfRange();

  const outcome = await deps.repo.reschedule({
    id,
    expectedRevision: input.revision,
    scheduledAt,
    timezone: input.timezone,
    actor,
    now: deps.now
  });
  return resolve(deps, outcome, input.revision, 'NOT_RESCHEDULABLE', 'The publication can no longer be rescheduled');
}

export async function cancelPublication(
  deps: ChangePublicationDeps,
  command: { actor: string; id: string; input: CancelPublicationInput }
): Promise<PublicationDto> {
  const { actor, id, input } = command;
  const outcome = await deps.repo.cancel({ id, expectedRevision: input.revision, actor, now: deps.now });
  return resolve(deps, outcome, input.revision, 'NOT_CANCELLABLE', 'The publication can no longer be cancelled');
}

// The repository ran one conditional batch and read the publication inside it, so `current`
// is exactly the state the decision was made on. What the job is doing is said first: no
// revision helps once sending has started.
function resolve(
  deps: ChangePublicationDeps,
  outcome: PublicationChangeOutcome,
  expectedRevision: number,
  notAllowed: 'NOT_CANCELLABLE' | 'NOT_RESCHEDULABLE',
  notAllowedMessage: string
): PublicationDto {
  const { applied, current } = outcome;
  if (current === null) throw publicationNotFound();
  if (applied) return toPublicationDto(current, deps.now);
  if (!isBeforeSend(current.job.status)) throw new AppError('CONFLICT', notAllowedMessage, { reason: notAllowed });
  if (current.revision !== expectedRevision) throw staleRevision();
  // Unreachable while the write is one atomic batch; fail loudly rather than guess.
  throw new AppError('UNAVAILABLE', 'The change was not applied');
}
