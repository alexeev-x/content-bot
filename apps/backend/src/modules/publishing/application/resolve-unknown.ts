import type { PublicationDto, ResolveUnknownPublicationInput } from '@alexeev/contracts';
import { AppError } from '../../../shared/app-error';
import { isInScheduleWindow } from '../domain/schedule-window';
import type { PublicationRepository, PublicationUnknownResolution } from './ports';
import { publicationNotFound, scheduleOutOfRange, staleRevision } from './publication-errors';
import { toPublicationDto } from './publication-dto';

export interface ResolveUnknownDeps {
  repo: PublicationRepository;
  now: number;
}

function toResolution(input: ResolveUnknownPublicationInput): PublicationUnknownResolution {
  switch (input.outcome) {
    case 'sent':
      return { outcome: 'sent', externalMessageId: input.externalMessageId };
    case 'resend':
      return { outcome: 'resend', scheduledAt: Date.parse(input.scheduledAt), timezone: input.timezone };
    case 'cancel':
      return { outcome: 'cancel' };
  }
}

/**
 * The owner's answer for a send that may or may not have reached the channel. It only moves D1
 * state: a `resend` makes the job dispatchable again, and the next Cron claim does the sending.
 */
export async function resolveUnknownPublication(
  deps: ResolveUnknownDeps,
  command: { actor: string; id: string; input: ResolveUnknownPublicationInput }
): Promise<PublicationDto> {
  const { actor, id, input } = command;
  const resolution = toResolution(input);
  if (resolution.outcome === 'resend' && !isInScheduleWindow(resolution.scheduledAt, deps.now)) {
    throw scheduleOutOfRange();
  }

  const { applied, current } = await deps.repo.resolveUnknown({
    id,
    expectedRevision: input.revision,
    resolution,
    actor,
    now: deps.now
  });
  // `current` was read inside the same batch, so it is the state the decision was made on. What the
  // job is doing is said first: no revision helps once the send is no longer unknown.
  if (current === null) throw publicationNotFound();
  if (applied) return toPublicationDto(current, deps.now);
  if (current.job.status !== 'unknown') {
    throw new AppError('CONFLICT', 'The publication send is not unknown', { reason: 'NOT_UNKNOWN' });
  }
  if (current.revision !== input.revision) throw staleRevision();
  // Unreachable while the write is one atomic batch; fail loudly rather than guess.
  throw new AppError('UNAVAILABLE', 'The change was not applied');
}
