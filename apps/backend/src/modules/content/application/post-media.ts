import {
  PHOTO_MEDIA_MAX_BYTES,
  POST_MEDIA_MAX_ITEMS,
  VIDEO_MEDIA_MAX_BYTES,
  type PostMediaDto,
  type CropPostMediaResultDto,
  type UploadPostMediaResultDto,
  cropPostMediaResultSchema,
  uploadPostMediaResultSchema
} from '@alexeev/contracts';
import { HTTPException } from 'hono/http-exception';
import { AppError } from '../../../shared/app-error';
import { sha256Hex } from '../../../platform/security/sha256';
import type { MediaObjectStorage, PostMediaRepository, StoredMediaObject } from './media-ports';
import { safeMediaFileName, streamAndValidateMedia } from './media-stream';
import { kindMismatch } from './post-errors';

function conflict(reason: 'STALE_REVISION' | 'NOT_EDITABLE' | 'IDEMPOTENCY_KEY_REUSED' | 'IN_FLIGHT'): AppError {
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
  if (state.kind === 'poll' && !state.pictureInPoll) throw kindMismatch('A poll post has no media');
  if (state.status !== 'draft') throw conflict('NOT_EDITABLE');
  if (state.revision !== revision) throw conflict('STALE_REVISION');
  // A poll with its picture inside takes that one picture only.
  if (state.media.length >= (state.kind === 'poll' ? 1 : POST_MEDIA_MAX_ITEMS))
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
    /**
     * A file the bot attached by itself (a source event's picture): kept out of the library and deleted with its
     * post, a sent one included (owner, 22.10.2026).
     */
    hidden?: boolean;
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
    sourceMediaId: null,
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
      hidden: command.hidden === true,
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
  if (!stagingActive) {
    // Cleanup claimed this upload's staging row while the put was still streaming, so it may have deleted
    // nothing; the object written afterwards belongs to no row and would never be collected.
    try {
      await deps.storage.delete(objectKey);
    } catch {
      throw new AppError('UNAVAILABLE', 'Temporary media cleanup failed');
    }
    throw new AppError('UNAVAILABLE', 'Media upload staging expired before attachment; retry the upload');
  }
  await removeStaged(deps.repo, deps.storage, mediaId, objectKey);
  classifyPostState(await readPostState(deps.repo, command.postId), command.revision);
  throw new AppError('CONFLICT', 'The media upload could not be attached', { reason: 'STALE_REVISION' });
}

function storedCropResult(responseBody: string): CropPostMediaResultDto {
  try {
    return cropPostMediaResultSchema.parse(JSON.parse(responseBody));
  } catch {
    throw new AppError('UNAVAILABLE', 'The stored media crop result is invalid');
  }
}

export async function cropPostMedia(
  deps: { repo: PostMediaRepository; storage: MediaObjectStorage; now: number; newId: () => string },
  command: {
    postId: string;
    mediaId: string;
    revision: number;
    fileName: string;
    contentType: string;
    contentLength: number;
    body: ReadableStream<Uint8Array>;
    actor: string;
    idempotencyKey: string;
  }
): Promise<CropPostMediaResultDto> {
  const fileName = safeMediaFileName(command.fileName);
  if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(command.contentType))
    throw new AppError('VALIDATION_ERROR', 'A cropped file must be JPEG, PNG, WebP or MP4', {
      reason: 'INVALID_MEDIA'
    });
  if (!Number.isSafeInteger(command.contentLength) || command.contentLength <= 0)
    throw new AppError('VALIDATION_ERROR', 'A valid Content-Length is required', { reason: 'INVALID_MEDIA' });
  if (command.contentLength > (command.contentType === 'video/mp4' ? VIDEO_MEDIA_MAX_BYTES : PHOTO_MEDIA_MAX_BYTES))
    throw new HTTPException(413, { message: 'Media file is too large' });

  let existing;
  try {
    existing = await deps.repo.findCrop(command.postId, command.idempotencyKey);
  } catch {
    throw new AppError('UNAVAILABLE', 'Media crop state is unavailable');
  }
  if (existing?.state === 'in_flight' && existing.leaseUntil > deps.now) throw conflict('IN_FLIGHT');

  const state = await readPostState(deps.repo, command.postId);
  if (existing?.state !== 'completed') {
    classifyCropTarget(state, command.mediaId, command.revision);
  }

  const requestId = deps.newId();
  let ownsClaim = false;
  if (existing?.state !== 'completed') {
    let claim: Awaited<ReturnType<PostMediaRepository['claimCrop']>>;
    try {
      claim = await deps.repo.claimCrop(command.postId, command.idempotencyKey, requestId, deps.now);
    } catch {
      throw new AppError('UNAVAILABLE', 'Media crop could not be reserved');
    }
    if (claim === 'in_flight') throw conflict('IN_FLIGHT');
    ownsClaim = claim === 'claimed';
    if (claim === 'completed') {
      try {
        existing = await deps.repo.findCrop(command.postId, command.idempotencyKey);
      } catch {
        throw new AppError('UNAVAILABLE', 'Media crop state is unavailable');
      }
      if (existing?.state !== 'completed') throw new AppError('UNAVAILABLE', 'Media crop state is uncertain');
    }
  }

  const derivativeId = deps.newId();
  const objectKey = `media/${derivativeId}`;
  let stagingRegistered = false;
  let preserveStagedOnUncertainCommit = false;
  try {
    await deps.repo.registerStaging(derivativeId, objectKey, deps.now);
    stagingRegistered = true;
  } catch {
    if (ownsClaim)
      await deps.repo.releaseCrop(command.postId, command.idempotencyKey, requestId).catch(() => undefined);
    throw new AppError('UNAVAILABLE', 'Media crop could not be staged');
  }

  try {
    const streamed = await streamAndValidateMedia(
      command.body,
      command.contentType,
      deps.storage,
      objectKey,
      command.contentLength
    );
    if (streamed.kind !== 'photo' && streamed.kind !== 'video')
      throw new AppError('VALIDATION_ERROR', 'Only photos and videos can be cropped', { reason: 'INVALID_MEDIA' });
    const payloadHash = await sha256Hex(
      JSON.stringify({
        postId: command.postId,
        sourceMediaId: command.mediaId,
        revision: command.revision,
        fileName,
        contentType: streamed.contentType,
        sizeBytes: streamed.bytes,
        contentSha256: streamed.sha256
      })
    );

    if (existing?.state === 'completed') {
      await removeStaged(deps.repo, deps.storage, derivativeId, objectKey);
      stagingRegistered = false;
      if (existing.payloadHash !== payloadHash) throw conflict('IDEMPOTENCY_KEY_REUSED');
      return storedCropResult(existing.responseBody);
    }

    const source = state?.media.find(({ id }) => id === command.mediaId);
    if (source === undefined) throw new AppError('UNAVAILABLE', 'The crop target changed unexpectedly');
    if (source.kind !== streamed.kind)
      throw new AppError('VALIDATION_ERROR', 'The cropped file must be the same kind as the attachment', {
        reason: 'INVALID_MEDIA'
      });
    const rootSourceMediaId = source.sourceMediaId ?? source.id;
    const media: PostMediaDto = {
      id: derivativeId,
      sourceMediaId: rootSourceMediaId,
      kind: streamed.kind,
      fileName,
      contentType: streamed.contentType,
      sizeBytes: streamed.bytes,
      width: streamed.width,
      height: streamed.height,
      durationMs: streamed.durationMs,
      position: source.position
    };
    const result = cropPostMediaResultSchema.parse({ media, revision: command.revision + 1 });
    const responseBody = JSON.stringify(result);
    let replaced: boolean;
    try {
      replaced = await deps.repo.replaceWithCrop({
        postId: command.postId,
        expectedRevision: command.revision,
        actor: command.actor,
        now: deps.now,
        sourceMediaId: command.mediaId,
        position: source.position,
        requestId,
        idempotencyKey: command.idempotencyKey,
        payloadHash,
        responseBody,
        asset: {
          ...media,
          objectKey,
          sha256: streamed.sha256,
          createdAt: deps.now,
          sourceMediaId: rootSourceMediaId
        }
      });
    } catch {
      const committed = await deps.repo.findCrop(command.postId, command.idempotencyKey).catch(() => null);
      if (committed?.state === 'completed' && committed.payloadHash === payloadHash)
        return storedCropResult(committed.responseBody);
      if (committed === null) {
        preserveStagedOnUncertainCommit = true;
        ownsClaim = false;
        throw new AppError('UNAVAILABLE', 'Media crop state is uncertain');
      }
      if (committed.state === 'in_flight' && committed.requestId === requestId) {
        await deps.repo.releaseCrop(command.postId, command.idempotencyKey, requestId).catch(() => undefined);
        await removeStaged(deps.repo, deps.storage, derivativeId, objectKey);
        stagingRegistered = false;
      }
      throw new AppError('UNAVAILABLE', 'Media crop could not be committed');
    }
    if (replaced) {
      stagingRegistered = false;
      return result;
    }

    await deps.repo.releaseCrop(command.postId, command.idempotencyKey, requestId).catch(() => undefined);
    await removeStaged(deps.repo, deps.storage, derivativeId, objectKey);
    stagingRegistered = false;
    const latest = await readPostState(deps.repo, command.postId);
    classifyCropTarget(latest, command.mediaId, command.revision);
    throw conflict('STALE_REVISION');
  } catch (error) {
    let cleanupFailed = false;
    if (ownsClaim) {
      try {
        await deps.repo.releaseCrop(command.postId, command.idempotencyKey, requestId);
      } catch {
        cleanupFailed = true;
      }
    }
    if (stagingRegistered && !preserveStagedOnUncertainCommit) {
      try {
        await removeStaged(deps.repo, deps.storage, derivativeId, objectKey);
      } catch {
        cleanupFailed = true;
      }
    }
    if (cleanupFailed) throw new AppError('UNAVAILABLE', 'Temporary crop cleanup is uncertain');
    if (error instanceof AppError || error instanceof HTTPException) throw error;
    throw new AppError('UNAVAILABLE', 'Media crop failed');
  }
}

function classifyCropTarget(
  state: Awaited<ReturnType<PostMediaRepository['findPostState']>>,
  mediaId: string,
  revision: number
): asserts state is NonNullable<typeof state> {
  if (state === null) throw new AppError('NOT_FOUND', 'Post not found');
  if (state.status !== 'draft') throw conflict('NOT_EDITABLE');
  if (state.revision !== revision) throw conflict('STALE_REVISION');
  const target = state.media.find(({ id }) => id === mediaId);
  if (target === undefined) throw new AppError('NOT_FOUND', 'Media attachment not found');
  if (target.kind !== 'photo' && target.kind !== 'video')
    throw new AppError('VALIDATION_ERROR', 'Only photo and video attachments can be cropped', {
      reason: 'INVALID_CROP_TARGET'
    });
}

export async function removePostMedia(
  deps: { repo: PostMediaRepository; now: number },
  command: { postId: string; mediaId: string; revision: number; actor: string }
): Promise<{ revision: number }> {
  const state = await readPostState(deps.repo, command.postId);
  if (state === null) throw new AppError('NOT_FOUND', 'Post not found');
  if (state.status !== 'draft') throw conflict('NOT_EDITABLE');
  if (state.revision !== command.revision) throw conflict('STALE_REVISION');
  // A rich post names its media by position (contracts post-rich.ts): another order would send other pictures.
  if (state.rich)
    throw new AppError('VALIDATION_ERROR', 'A rich post keeps its media order', { reason: 'RICH_NOT_EDITABLE' });
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
  // A rich post names its media by position (contracts post-rich.ts): another order would send other pictures.
  if (state.rich)
    throw new AppError('VALIDATION_ERROR', 'A rich post keeps its media order', { reason: 'RICH_NOT_EDITABLE' });
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
