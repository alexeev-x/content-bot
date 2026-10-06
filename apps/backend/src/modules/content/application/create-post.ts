import { type CreatePostInput, type PostDto, postSchema } from '@alexeev/contracts';
import { sha256Hex } from '../../../platform/security/sha256';
import { AppError } from '../../../shared/app-error';
import { toPostDto } from './post-dto';
import type { IdempotencyGate, PostRecord, PostRepository } from './ports';

export interface CreatePostDeps {
  repo: PostRepository;
  idempotency: IdempotencyGate;
  now: number;
  newId: () => string;
}

export interface CreatePostCommand {
  actor: string;
  idempotencyKey: string;
  input: CreatePostInput;
}

export async function createPost(deps: CreatePostDeps, command: CreatePostCommand): Promise<PostDto> {
  const { actor, idempotencyKey, input } = command;
  // Field order is fixed here, so equal payloads always hash equally.
  const requestHash = await sha256Hex(JSON.stringify({ title: input.title, body: input.body }));
  const ref = { scope: actor, key: idempotencyKey, requestHash, claimedAt: deps.now };

  const claim = await deps.idempotency.claim(actor, idempotencyKey, requestHash, deps.now);
  switch (claim.kind) {
    case 'replay':
      return postSchema.parse(JSON.parse(claim.responseBody));
    case 'reused':
      throw new AppError('CONFLICT', 'Idempotency-Key was already used with a different payload', {
        reason: 'IDEMPOTENCY_KEY_REUSED'
      });
    case 'in_flight':
      throw inFlight();
    case 'claimed':
      break;
  }

  const record: PostRecord = {
    id: deps.newId(),
    title: input.title,
    body: input.body,
    status: 'draft',
    revision: 0,
    createdAt: deps.now,
    updatedAt: deps.now
  };
  const post = toPostDto(record);
  let written: boolean;
  try {
    written = await deps.repo.create({
      record,
      actor,
      idempotency: ref,
      response: { status: 201, body: JSON.stringify(post) }
    });
  } catch (error) {
    // Free the key so the client can retry at once; if this also fails the lease expires on its own.
    await deps.idempotency.release(ref).catch(() => undefined);
    throw error;
  }
  if (!written) throw inFlight();
  return post;
}

function inFlight(): AppError {
  return new AppError('CONFLICT', 'A request with this Idempotency-Key is still being processed', {
    reason: 'IN_FLIGHT'
  });
}
