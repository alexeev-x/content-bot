import { type CreatePublicationInput, type PublicationDto, publicationSchema } from '@alexeev/contracts';
import { sha256Hex } from '../../../platform/security/sha256';
import { checkSchedulable } from '../domain/schedulable';
import { isInScheduleWindow } from '../domain/schedule-window';
import { inFlight, runIdempotent } from './idempotent-create';
import type {
  DestinationRepository,
  IdempotencyGate,
  PostSource,
  PublicationRecord,
  PublicationRepository,
  ScheduleNotifier
} from './ports';
import { scheduleOutOfRange, scheduleRefusal } from './publication-errors';
import { toPublicationDto } from './publication-dto';

export interface CreatePublicationDeps {
  publications: PublicationRepository;
  destinations: DestinationRepository;
  posts: PostSource;
  idempotency: IdempotencyGate;
  notifier: ScheduleNotifier;
  now: number;
  newId: () => string;
}

export async function createPublication(
  deps: CreatePublicationDeps,
  command: { actor: string; idempotencyKey: string; input: CreatePublicationInput }
): Promise<PublicationDto> {
  const { actor, idempotencyKey, input } = command;
  const scheduledAt = Date.parse(input.scheduledAt);
  // The instant, not its spelling, identifies the request: "…:00Z" and "…:00.000Z" hash equally.
  const requestHash = await sha256Hex(
    JSON.stringify({
      postId: input.postId,
      revision: input.revision,
      destinationId: input.destinationId,
      scheduledAt,
      timezone: input.timezone
    })
  );

  // The key is claimed before the checks so a replay is answered from the stored response even
  // after the window or the post state moved on; a refused request frees the key again.
  return runIdempotent(
    {
      gate: deps.idempotency,
      actor,
      key: idempotencyKey,
      requestHash,
      now: deps.now,
      replay: (body) => publicationSchema.parse(JSON.parse(body))
    },
    async (ref) => {
      if (!isInScheduleWindow(scheduledAt, deps.now)) throw scheduleOutOfRange();

      const refusal = await findRefusal(deps, input);
      if (refusal !== null) throw scheduleRefusal(refusal);

      const record: PublicationRecord = {
        id: deps.newId(),
        postId: input.postId,
        postRevision: input.revision,
        destinationId: input.destinationId,
        scheduledAt,
        timezone: input.timezone,
        revision: 0,
        externalMessageId: null,
        lastErrorCode: null,
        createdAt: deps.now,
        updatedAt: deps.now,
        job: { status: 'pending', runAt: scheduledAt, sendStartedAt: null }
      };
      const publication = toPublicationDto(record, deps.now);
      const written = await deps.publications.create({
        id: record.id,
        jobId: deps.newId(),
        postId: record.postId,
        postRevision: record.postRevision,
        destinationId: record.destinationId,
        scheduledAt,
        timezone: record.timezone,
        now: deps.now,
        actor,
        idempotency: ref,
        response: { status: 202, body: JSON.stringify(publication) }
      });
      if (written) {
        // Only a write that happened tells the owner; a replay never reaches this line. A publication
        // that is already due is sent right away, so there is nothing to announce.
        if (publication.status === 'scheduled') deps.notifier.scheduled(publication);
        return publication;
      }

      // The write is guarded by the post and destination state, so a change between our read and
      // the write refuses it. Read again to say what changed; if nothing did, our claim was lost.
      const changed = await findRefusal(deps, input);
      throw changed === null ? inFlight() : scheduleRefusal(changed);
    }
  );
}

async function findRefusal(deps: CreatePublicationDeps, input: CreatePublicationInput) {
  const [post, destination] = await Promise.all([
    deps.posts.findState(input.postId),
    deps.destinations.findById(input.destinationId)
  ]);
  return checkSchedulable(post, destination, input.revision);
}
