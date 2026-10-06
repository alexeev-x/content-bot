import { type CreateDestinationInput, type DestinationDto, destinationSchema } from '@alexeev/contracts';
import { sha256Hex } from '../../../platform/security/sha256';
import { chatIdTaken } from './destination-errors';
import { toDestinationDto } from './destination-dto';
import { inFlight, runIdempotent } from './idempotent-create';
import type { DestinationRecord, DestinationRepository, IdempotencyGate } from './ports';

export interface CreateDestinationDeps {
  repo: DestinationRepository;
  idempotency: IdempotencyGate;
  now: number;
  newId: () => string;
}

export async function createDestination(
  deps: CreateDestinationDeps,
  command: { actor: string; idempotencyKey: string; input: CreateDestinationInput }
): Promise<DestinationDto> {
  const { actor, idempotencyKey, input } = command;
  // Field order is fixed here, so equal payloads always hash equally.
  const requestHash = await sha256Hex(JSON.stringify({ title: input.title, chatId: input.chatId, kind: input.kind }));

  return runIdempotent(
    {
      gate: deps.idempotency,
      actor,
      key: idempotencyKey,
      requestHash,
      now: deps.now,
      replay: (body) => destinationSchema.parse(JSON.parse(body))
    },
    async (ref) => {
      const record: DestinationRecord = {
        id: deps.newId(),
        title: input.title,
        chatId: input.chatId,
        kind: input.kind,
        enabled: true,
        revision: 0,
        createdAt: deps.now,
        updatedAt: deps.now
      };
      const destination = toDestinationDto(record);
      const outcome = await deps.repo.create({
        record,
        actor,
        idempotency: ref,
        response: { status: 201, body: JSON.stringify(destination) }
      });
      if (outcome === 'chat_id_taken') throw chatIdTaken();
      if (outcome === 'claim_lost') throw inFlight();
      return destination;
    }
  );
}
