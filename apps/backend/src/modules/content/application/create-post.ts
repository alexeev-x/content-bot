import {
  type CreatePostInput,
  DEFAULT_SEND_OPTIONS,
  EMPTY_POLL,
  type PostDto,
  postSchema,
  richHtmlIssue,
  RICH_MEDIA_MAX
} from '@alexeev/contracts';
import { z } from 'zod';
import { sha256Hex } from '../../../platform/security/sha256';
import { AppError } from '../../../shared/app-error';
import { emptySummary, toPostDto } from './post-dto';
import type { IdempotencyGate, PostRecord, PostRepository } from './ports';
import { postNameFromBody } from '../domain/post-name';

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
  /**
   * The approved rich format (contracts post-rich.ts), made by the server's writers, never by the studio's request; its
   * media are attached afterwards, so the media it names are checked at approval.
   */
  richHtml?: string;
}

export async function createPost(deps: CreatePostDeps, command: CreatePostCommand): Promise<PostDto> {
  const { actor, idempotencyKey, input } = command;
  const richHtml = command.richHtml ?? null;
  const richIssue = richHtml === null ? null : richHtmlIssue(richHtml, RICH_MEDIA_MAX);
  if (richIssue !== null || (richHtml !== null && input.kind !== 'text'))
    throw new AppError('VALIDATION_ERROR', 'Invalid rich post', { reason: richIssue ?? 'KIND_MISMATCH' });
  // Field order is fixed here, so equal payloads always hash equally.
  // Entities join the hash only when there are some, so a key claimed before they existed still replays.
  // The rich HTML never joins it: it is made from the same text, so a key claimed before (or by an earlier converter)
  // replays the same post instead of a conflict (QA 23.10.2026).
  // Kind, poll and send options join it only when set, for the same reason.
  const requestHash = await sha256Hex(
    JSON.stringify({
      title: input.title,
      body: input.body,
      ...(input.entities.length === 0 ? {} : { entities: input.entities }),
      ...(input.kind === 'poll' ? { kind: input.kind, poll: input.poll } : {}),
      ...(input.sendOptions === undefined ? {} : { sendOptions: input.sendOptions })
    })
  );
  const ref = { scope: actor, key: idempotencyKey, requestHash, claimedAt: deps.now };

  const claim = await deps.idempotency.claim(actor, idempotencyKey, requestHash, deps.now);
  switch (claim.kind) {
    case 'replay':
      // A response stored before the archive or entity fields existed lacks them; a new post is never archived,
      // has no publications and (before entities existed) plain text, so the defaults are exactly what it would carry now.
      return postSchema.parse({
        entities: [],
        archivedAt: null,
        autoDeleteAt: null,
        publicationSummary: emptySummary(),
        ...z.record(z.string(), z.unknown()).parse(JSON.parse(claim.responseBody))
      });
    case 'reused':
      throw new AppError('CONFLICT', 'Idempotency-Key was already used with a different payload', {
        reason: 'IDEMPOTENCY_KEY_REUSED'
      });
    case 'in_flight':
      throw inFlight();
    case 'claimed':
      break;
  }

  // Without a title (owner, 16.10.2026: no title field) only the body is sent; the title is just its studio name.
  // A poll post is named after its question and never carries a title in the message.
  const poll = input.kind === 'poll' ? (input.poll ?? EMPTY_POLL) : null;
  const record: PostRecord = {
    id: deps.newId(),
    title: poll === null ? (input.title ?? postNameFromBody(input.body)) : postNameFromBody(poll.question),
    titleInMessage: poll === null && input.title !== undefined,
    body: input.body,
    entities: input.entities,
    kind: input.kind,
    poll,
    sendOptions: input.sendOptions ?? DEFAULT_SEND_OPTIONS,
    richHtml,
    status: 'draft',
    archivedAt: null,
    revision: 0,
    createdAt: deps.now,
    updatedAt: deps.now,
    mediaPendingUntil: null
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
