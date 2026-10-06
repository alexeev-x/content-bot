import type { ApprovePostInput, PostDto, UpdatePostInput } from '@alexeev/contracts';
import { AppError } from '../../../shared/app-error';
import { approve, canEdit } from '../domain/post';
import { toPostDto } from './post-dto';
import type { PostRepository } from './ports';
import { conflict, notFound } from './post-errors';

export interface ChangePostDeps {
  repo: PostRepository;
  now: number;
}

// The write is one guarded statement (revision and draft status in the WHERE clause), so two
// concurrent edits of the same revision cannot both win. Only when the guard fails do we read
// the post again, to tell the caller why.
export async function updatePost(
  deps: ChangePostDeps,
  command: { actor: string; id: string; input: UpdatePostInput }
): Promise<PostDto> {
  const { actor, id, input } = command;
  const updated = await deps.repo.update({
    id,
    expectedRevision: input.revision,
    title: input.title,
    body: input.body,
    actor,
    now: deps.now
  });
  if (updated !== null) return toPostDto(updated);

  const current = await deps.repo.findById(id);
  if (current === null) throw notFound();
  // An approved post cannot be edited whatever revision the client holds, so say that first.
  throw conflict(canEdit(current) ? 'STALE_REVISION' : 'NOT_EDITABLE');
}

export async function approvePost(
  deps: ChangePostDeps,
  command: { actor: string; id: string; input: ApprovePostInput }
): Promise<PostDto> {
  const { actor, id, input } = command;
  const current = await deps.repo.findById(id);
  if (current === null) throw notFound();

  const decision = approve(current, deps.now);
  if (!decision.ok && decision.reason === 'ALREADY_APPROVED') throw conflict('ALREADY_APPROVED');
  if (current.revision !== input.revision) throw conflict('STALE_REVISION');
  if (!decision.ok)
    throw new AppError('VALIDATION_ERROR', 'A post needs a body to be approved', { reason: decision.reason });

  const approved = await deps.repo.approve({ id, expectedRevision: input.revision, actor, now: deps.now });
  if (approved !== null) return toPostDto(approved);

  // Lost a race between the read and the write: report what the winner did.
  const latest = await deps.repo.findById(id);
  if (latest === null) throw notFound();
  throw conflict(latest.status === 'approved' ? 'ALREADY_APPROVED' : 'STALE_REVISION');
}
