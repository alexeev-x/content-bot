import {
  type ApprovePostInput,
  type PostDto,
  postRichHtml,
  RICH_MEDIA_MAX,
  richHtmlIssue,
  type UpdatePostInput,
  validatePostEntities
} from '@alexeev/contracts';
import { AppError } from '../../../shared/app-error';
import { approve, canEdit } from '../domain/post';
import { toPostDto } from './post-dto';
import type { PostRepository } from './ports';
import { conflict, kindMismatch, notFound } from './post-errors';

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
  // The contract schema already refuses this; repeated here so no caller can store offsets of another text.
  if (input.body !== undefined && input.entities === undefined) throw entitiesIssue('ENTITIES_REQUIRED');
  // The kind is fixed at creation and only the server knows it. It is read only when the change names a field that
  // belongs to one kind; the write below is guarded by the revision, and the kind never changes, so the read stays true.
  const touchesText = input.body !== undefined || input.entities !== undefined;
  const current = touchesText || input.poll !== undefined ? await deps.repo.findById(id) : null;
  if (current !== null) {
    if (current.kind === 'poll' && touchesText) throw kindMismatch('A poll post has no title, body or entities');
    if (current.kind === 'text' && input.poll !== undefined) throw kindMismatch('A text post has no poll');
  }
  // A rich post sends its rich HTML, not `body`: an edit of its text rebuilds it (owner, 24.10.2026: «пару слов
  // поправить»). A text that lost the structure is refused, never sent half-built or silently as the old version.
  let richHtml: string | undefined;
  if (current !== null && current.richHtml !== null && touchesText) {
    const rebuilt = postRichHtml(input.body ?? current.body, input.entities ?? current.entities);
    if (rebuilt === null || richHtmlIssue(rebuilt, RICH_MEDIA_MAX) !== null)
      throw new AppError('VALIDATION_ERROR', 'The edited text lost its rich structure', {
        reason: 'RICH_STRUCTURE_LOST'
      });
    richHtml = rebuilt;
  }
  // Formatting without a new body is checked against the stored one. The write below is guarded by the
  // revision, and a body only changes with a revision bump, so the body read here is the body it applies to.
  if (input.body === undefined && input.entities !== undefined) {
    if (current === null) throw notFound();
    if (!canEdit(current)) throw conflict('NOT_EDITABLE');
    if (current.revision !== input.revision) throw conflict('STALE_REVISION');
    const issue = validatePostEntities(current.body, input.entities);
    if (issue !== null) throw entitiesIssue(issue.code, issue.index);
  }
  const updated = await deps.repo.update({
    id,
    expectedRevision: input.revision,
    body: input.body,
    entities: input.entities,
    poll: input.poll,
    sendOptions: input.sendOptions,
    ...(richHtml === undefined ? {} : { richHtml }),
    actor,
    now: deps.now
  });
  if (updated !== null) return toPostDto(updated);

  const latest = await deps.repo.findById(id);
  if (latest === null) throw notFound();
  // An approved post cannot be edited whatever revision the client holds, so say that first.
  throw conflict(canEdit(latest) ? 'STALE_REVISION' : 'NOT_EDITABLE');
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
  // Its pictures are still being attached, and an approved post takes no files (owner, 23.10.2026).
  if (current.mediaPendingUntil !== null && current.mediaPendingUntil > deps.now) throw conflict('MEDIA_PENDING');
  if (!decision.ok && decision.reason === 'RICH_INVALID')
    throw new AppError('VALIDATION_ERROR', 'The rich post is not ready to be approved', {
      reason: decision.reason,
      issue: decision.issue
    });
  if (!decision.ok && decision.reason === 'POLL_INVALID')
    throw new AppError('VALIDATION_ERROR', 'The poll is not ready to be approved', {
      reason: decision.reason,
      issue: decision.issue
    });
  if (!decision.ok)
    throw new AppError('VALIDATION_ERROR', 'A post needs text or attached media to be approved', {
      reason: decision.reason
    });

  const approved = await deps.repo.approve({ id, expectedRevision: input.revision, actor, now: deps.now });
  if (approved !== null) return toPostDto(approved);

  // Lost a race between the read and the write: report what the winner did.
  const latest = await deps.repo.findById(id);
  if (latest === null) throw notFound();
  throw conflict(latest.status === 'approved' ? 'ALREADY_APPROVED' : 'STALE_REVISION');
}

function entitiesIssue(code: string, index?: number): AppError {
  return new AppError('VALIDATION_ERROR', 'The entities do not fit the body', {
    reason: code,
    ...(index === undefined ? {} : { entity: String(index) })
  });
}
