import {
  POST_MEDIA_MAX_ITEMS,
  type PostMediaDto,
  type UploadPostMediaResultDto,
  uploadPostMediaResultSchema
} from '@alexeev/contracts';
import { HTTPException } from 'hono/http-exception';
import { AppError } from '../../../shared/app-error';
import { sha256Hex } from '../../../platform/security/sha256';
import type { MediaObjectStorage, PostMediaRepository, StoredMediaObject } from './media-ports';
import { safeMediaFileName, streamAndValidateMedia } from './media-stream';

function conflict(reason: 'STALE_REVISION' | 'NOT_EDITABLE' | 'IDEMPOTENCY_KEY_REUSED'): AppError {
  return new AppError('CONFLICT', 'The media operation conflicts with the current post state', { reason });
}

function storedResult(responseBody: string): UploadPostMediaResultDto {
  try {
    return uploadPostMediaResultSchema.parse(JSON.parse(responseBody));
  } catch {
    throw new AppError('UNAVAILABLE', 'The stored media upload result is invalid');
  }
}

async function readUpload(repo: PostMediaRepository, postId: string, idempotencyKey: string) {
  try {
    return await repo.findUpload(postId, idempotencyKey);
  } catch {
    throw new AppError('UNAVAILABLE', 'Media upload state is unavailable');
  }
}

async function readPostState(repo: PostMediaRepository, postId: string) {
  try {
    return await repo.findPostState(postId);
  } catch {
    throw new AppError('UNAVAILABLE', 'Post media state is unavailable');
  }
}

async function removeStaged(
  repo: PostMediaRepository,
  storage: MediaObjectStorage,
  mediaId: string,
  objectKey: string
): Promise<void> {
  try {
    await storage.delete(objectKey);
    await repo.removeStaging(mediaId);
  } catch {
    throw new AppError('UNAVAILABLE', 'Temporary media cleanup failed');
  }
}

function classifyPostState(
  state: Awaited<ReturnType<PostMediaRepository['findPostState']>>,
  revision: number
): asserts state is NonNullable<typeof state> {
  if (state === null) throw new AppError('NOT_FOUND', 'Post not found');
  if (state.status !== 'draft') throw conflict('NOT_EDITABLE');
  if (state.revision !== revision) throw conflict('STALE_REVISION');
  if (state.media.length >= POST_MEDIA_MAX_ITEMS)
    throw new HTTPException(413, { message: 'The post already has the maximum number of attachments' });
}

export async function uploadPostMedia(
  deps: { repo: PostMediaRepository; storage: MediaObjectStorage; now: number; newId: () => string },
  command: {
    postId: string;
    revision: number;
    fileName: string;
    contentType: string;
    contentLength: number;
    body: ReadableStream<Uint8Array>;
    actor: string;
    idempotencyKey: string;
  }
): Promise<UploadPostMediaResultDto> {
  const mediaId = deps.newId();
  const objectKey = `media/${mediaId}`;
  const fileName = safeMediaFileName(command.fileName);
  try {
    await deps.repo.registerStaging(mediaId, objectKey, deps.now);
  } catch {
    throw new AppError('UNAVAILABLE', 'Media upload could not be reserved');
  }
  let stream;
  try {
    stream = await streamAndValidateMedia(
      command.body,
      command.contentType,
      deps.storage,
      objectKey,
      command.contentLength
    );
  } catch (error) {
    await removeStaged(deps.repo, deps.storage, mediaId, objectKey);
    if (error instanceof AppError || error instanceof HTTPException) throw error;
    throw new AppError('UNAVAILABLE', 'Media upload failed');
  }

  const payloadHash = await sha256Hex(
    JSON.stringify({ fileName, contentType: stream.contentType, sizeBytes: stream.bytes, contentSha256: stream.sha256 })
  );
  const existing = await readUpload(deps.repo, command.postId, command.idempotencyKey).catch(async (error: unknown) => {
    await removeStaged(deps.repo, deps.storage, mediaId, objectKey);
    throw error;
  });
  if (existing !== null) {
    await removeStaged(deps.repo, deps.storage, mediaId, objectKey);
    if (existing.payloadHash !== payloadHash) throw conflict('IDEMPOTENCY_KEY_REUSED');
    return storedResult(existing.responseBody);
  }

  const state = await readPostState(deps.repo, command.postId).catch(async (error: unknown) => {
    await removeStaged(deps.repo, deps.storage, mediaId, objectKey);
    throw error;
  });
  try {
    classifyPostState(state, command.revision);
  } catch (error) {
    await removeStaged(deps.repo, deps.storage, mediaId, objectKey);
    throw error;
  }

  const media: PostMediaDto = {
    id: mediaId,
    kind: stream.kind,
    fileName,
    contentType: stream.contentType,
    sizeBytes: stream.bytes,
    width: stream.width,
    height: stream.height,
    durationMs: stream.durationMs,
    position: state.media.length
  };
  const result = uploadPostMediaResultSchema.parse({ media, revision: command.revision + 1 });
  const responseBody = JSON.stringify(result);
  let attached: boolean;
  try {
    attached = await deps.repo.attach({
      postId: command.postId,
      expectedRevision: command.revision,
      actor: command.actor,
      now: deps.now,
      idempotencyKey: command.idempotencyKey,
      payloadHash,
      responseBody,
      asset: { ...media, objectKey, sha256: stream.sha256, createdAt: deps.now }
    });
  } catch {
    let ambiguous;
    try {
      ambiguous = await deps.repo.findUpload(command.postId, command.idempotencyKey);
    } catch {
      throw new AppError('UNAVAILABLE', 'Media upload state is uncertain');
    }
    if (ambiguous === null) await removeStaged(deps.repo, deps.storage, mediaId, objectKey);
    else if (ambiguous.payloadHash !== payloadHash) await removeStaged(deps.repo, deps.storage, mediaId, objectKey);
    else {
      const replay = storedResult(ambiguous.responseBody);
      if (replay.media.id === mediaId) return replay;
      await removeStaged(deps.repo, deps.storage, mediaId, objectKey);
      return replay;
    }
    throw new AppError('UNAVAILABLE', 'Media upload state is uncertain');
  }
  if (attached) return result;

  const raced = await readUpload(deps.repo, command.postId, command.idempotencyKey);
  if (raced !== null) {
    await removeStaged(deps.repo, deps.storage, mediaId, objectKey);
    if (raced.payloadHash !== payloadHash) throw conflict('IDEMPOTENCY_KEY_REUSED');
    return storedResult(raced.responseBody);
  }
  let stagingActive: boolean;
  try {
    stagingActive = await deps.repo.stagingIsActive(mediaId);
  } catch {
    throw new AppError('UNAVAILABLE', 'Media upload state is uncertain');
  }
  if (!stagingActive)
    throw new AppError('UNAVAILABLE', 'Media upload staging expired before attachment; retry the upload');
  await removeStaged(deps.repo, deps.storage, mediaId, objectKey);
  classifyPostState(await readPostState(deps.repo, command.postId), command.revision);
  throw new AppError('CONFLICT', 'The media upload could not be attached', { reason: 'STALE_REVISION' });
}

export async function removePostMedia(
  deps: { repo: PostMediaRepository; now: number },
  command: { postId: string; mediaId: string; revision: number; actor: string }
): Promise<{ revision: number }> {
  const state = await readPostState(deps.repo, command.postId);
  if (state === null) throw new AppError('NOT_FOUND', 'Post not found');
  if (state.status !== 'draft') throw conflict('NOT_EDITABLE');
  if (state.revision !== command.revision) throw conflict('STALE_REVISION');
  if (!state.media.some(({ id }) => id === command.mediaId))
    throw new AppError('NOT_FOUND', 'Media attachment not found');
  const mediaIds = state.media.filter(({ id }) => id !== command.mediaId).map(({ id }) => id);
  let changed: boolean;
  try {
    changed = await deps.repo.rewrite({
      postId: command.postId,
      expectedRevision: command.revision,
      actor: command.actor,
      mediaIds,
      now: deps.now
    });
  } catch {
    throw new AppError('UNAVAILABLE', 'Post media update is uncertain');
  }
  if (!changed) throw conflict('STALE_REVISION');
  return { revision: command.revision + 1 };
}

export async function reorderPostMedia(
  deps: { repo: PostMediaRepository; now: number },
  command: { postId: string; mediaIds: string[]; revision: number; actor: string }
): Promise<{ revision: number }> {
  const state = await deps.repo.findPostState(command.postId);
  if (state === null) throw new AppError('NOT_FOUND', 'Post not found');
  if (state.status !== 'draft') throw conflict('NOT_EDITABLE');
  if (state.revision !== command.revision) throw conflict('STALE_REVISION');
  const current = state.media.map(({ id }) => id);
  if (
    command.mediaIds.length !== current.length ||
    new Set(command.mediaIds).size !== command.mediaIds.length ||
    current.some((id) => !command.mediaIds.includes(id))
  ) {
    throw new AppError('VALIDATION_ERROR', 'The ordered media list must contain every current attachment once', {
      reason: 'MEDIA_ORDER_MISMATCH'
    });
  }
  let changed: boolean;
  try {
    changed = await deps.repo.rewrite({
      postId: command.postId,
      expectedRevision: command.revision,
      actor: command.actor,
      mediaIds: command.mediaIds,
      now: deps.now
    });
  } catch {
    throw new AppError('UNAVAILABLE', 'Post media update is uncertain');
  }
  if (!changed) throw conflict('STALE_REVISION');
  return { revision: command.revision + 1 };
}

export async function getPostMediaContent(
  deps: { repo: PostMediaRepository; storage: MediaObjectStorage },
  mediaId: string
): Promise<StoredMediaObject> {
  const objectKey = await deps.repo.findObjectKey(mediaId);
  if (objectKey === null) throw new AppError('NOT_FOUND', 'Media not found');
  const object = await deps.storage.get(objectKey);
  if (object === null) throw new AppError('UNAVAILABLE', 'Media content is unavailable');
  return object;
}

export async function processPostMediaCleanup(
  deps: { repo: PostMediaRepository; storage: MediaObjectStorage },
  limit: number,
  now: number
): Promise<{ cleaned: number; failed: number }> {
  const pending = await deps.repo.claimCleanup(limit, now);
  let cleaned = 0;
  let failed = 0;
  for (const item of pending) {
    try {
      if (!(await deps.repo.cleanupIsReferenced(item.mediaId))) await deps.storage.delete(item.objectKey);
      await deps.repo.completeCleanup(item.mediaId);
      cleaned += 1;
    } catch {
      failed += 1;
      await deps.repo.failCleanup(item.mediaId);
    }
  }
  return { cleaned, failed };
}
