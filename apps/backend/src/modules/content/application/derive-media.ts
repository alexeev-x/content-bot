import {
  type DeriveMediaQuery,
  type MediaLibraryItemDto,
  mediaLibraryItemSchema,
  PHOTO_MEDIA_MAX_BYTES,
  VIDEO_MEDIA_MAX_BYTES
} from '@alexeev/contracts';
import { HTTPException } from 'hono/http-exception';
import { AppError } from '../../../shared/app-error';
import { sha256Hex } from '../../../platform/security/sha256';
import type { MediaObjectStorage, PostMediaRepository } from './media-ports';
import { safeMediaFileName, streamAndValidateMedia } from './media-stream';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function invalid(message: string): AppError {
  return new AppError('VALIDATION_ERROR', message, { reason: 'INVALID_MEDIA' });
}

function storedItem(responseBody: string): MediaLibraryItemDto {
  try {
    return mediaLibraryItemSchema.parse(JSON.parse(responseBody));
  } catch {
    throw new AppError('UNAVAILABLE', 'The stored derived media result is invalid');
  }
}

async function discard(repo: PostMediaRepository, storage: MediaObjectStorage, mediaId: string, objectKey: string) {
  try {
    await storage.delete(objectKey);
    await repo.removeStaging(mediaId);
  } catch {
    throw new AppError('UNAVAILABLE', 'Temporary media cleanup failed');
  }
}

// Boundary: the bytes are staged in R2 first (a durable cleanup row owns them), then one D1 batch claims the
// idempotency key and inserts the asset; a lost race removes the staged object and replays the winner.
export async function deriveLibraryMedia(
  deps: { repo: PostMediaRepository; storage: MediaObjectStorage; now: number; newId: () => string },
  command: DeriveMediaQuery & {
    sourceId: string;
    contentType: string;
    contentLength: number;
    body: ReadableStream<Uint8Array>;
    actor: string;
    idempotencyKey: string;
  }
): Promise<MediaLibraryItemDto> {
  const fileName = safeMediaFileName(command.fileName);
  const isVideo = command.contentType === 'video/mp4';
  if (!isVideo && !PHOTO_TYPES.includes(command.contentType)) throw invalid('Unsupported content type');
  if ((command.kind === 'video') !== isVideo) throw invalid('The content type does not match the kind');
  if (!Number.isSafeInteger(command.contentLength) || command.contentLength <= 0)
    throw invalid('A valid Content-Length is required');
  if (command.contentLength > (isVideo ? VIDEO_MEDIA_MAX_BYTES : PHOTO_MEDIA_MAX_BYTES))
    throw new HTTPException(413, { message: 'Media file is too large' });

  const replace = command.mode === 'replace';
  const mediaId = deps.newId();
  const objectKey = `media/${mediaId}`;
  try {
    await deps.repo.registerStaging(mediaId, objectKey, deps.now);
  } catch {
    throw new AppError('UNAVAILABLE', 'Media upload could not be reserved');
  }
  let keepStaged = false;
  try {
    const streamed = await streamAndValidateMedia(
      command.body,
      command.contentType,
      deps.storage,
      objectKey,
      command.contentLength
    );
    if (streamed.kind !== command.kind) throw invalid('The file does not match the kind');
    const payloadHash = await sha256Hex(
      JSON.stringify({
        sourceId: command.sourceId,
        // Only a replace names its mode, so payloads of the default mode hash as they always did.
        ...(command.mode === 'replace' ? { mode: 'replace' } : {}),
        fileName,
        contentType: streamed.contentType,
        sizeBytes: streamed.bytes,
        contentSha256: streamed.sha256
      })
    );
    const replay = async (): Promise<MediaLibraryItemDto | null> => {
      const stored = await deps.repo.findDerivation(command.idempotencyKey);
      if (stored === null) return null;
      if (stored.payloadHash !== payloadHash)
        throw new AppError('CONFLICT', 'The idempotency key was used with a different payload', {
          reason: 'IDEMPOTENCY_KEY_REUSED'
        });
      return storedItem(stored.responseBody);
    };

    const existing = await replay().catch(async (error: unknown) => {
      await discard(deps.repo, deps.storage, mediaId, objectKey);
      throw error;
    });
    if (existing !== null) {
      await discard(deps.repo, deps.storage, mediaId, objectKey);
      return existing;
    }

    const [source] = await deps.repo.findRetainedMedia([command.sourceId]);
    if (source === undefined) throw new AppError('NOT_FOUND', 'Source media not found');
    if (replace && !(await deps.repo.findReplaceableSource(command.sourceId)))
      throw new AppError('NOT_FOUND', 'Source media not found');
    if (source.kind !== streamed.kind)
      throw new AppError('VALIDATION_ERROR', 'Only a photo or a video can be derived from its own kind', {
        reason: 'INVALID_CROP_TARGET'
      });
    const rootSourceId = source.sourceMediaId ?? source.id;
    const asset = {
      id: mediaId,
      sourceMediaId: rootSourceId,
      kind: streamed.kind,
      fileName,
      contentType: streamed.contentType,
      sizeBytes: streamed.bytes,
      width: streamed.width,
      height: streamed.height,
      durationMs: streamed.durationMs,
      objectKey,
      sha256: streamed.sha256,
      createdAt: deps.now
    };
    const item = mediaLibraryItemSchema.parse({
      id: mediaId,
      kind: streamed.kind,
      fileName,
      contentType: streamed.contentType,
      sizeBytes: streamed.bytes,
      width: streamed.width,
      height: streamed.height,
      durationMs: streamed.durationMs,
      createdAt: new Date(deps.now).toISOString(),
      duplicateCount: 1,
      usageCount: 0,
      deletable: true,
      usages: []
    });
    let stored: boolean;
    try {
      stored = await deps.repo.storeDerived({
        replace,
        idempotencyKey: command.idempotencyKey,
        sourceMediaId: command.sourceId,
        payloadHash,
        responseBody: JSON.stringify(item),
        actor: command.actor,
        now: deps.now,
        asset
      });
    } catch {
      // The batch may or may not have committed: keep the object when the key proves it did.
      const outcome = await replay().catch(() => undefined);
      if (outcome === undefined) {
        keepStaged = true;
        throw new AppError('UNAVAILABLE', 'Derived media state is uncertain');
      }
      if (outcome?.id === mediaId) {
        keepStaged = true;
        return outcome;
      }
      if (outcome === null) {
        await discard(deps.repo, deps.storage, mediaId, objectKey);
        throw new AppError('UNAVAILABLE', 'Derived media could not be saved');
      }
      await discard(deps.repo, deps.storage, mediaId, objectKey);
      return outcome;
    }
    if (stored) {
      keepStaged = true;
      // A replace is replayed from the stored body, so its first answer is that same body.
      if (replace) return item;
      const fresh = await deps.repo.findLibraryItem(mediaId).catch(() => null);
      return fresh ?? item;
    }

    const raced = await replay();
    await discard(deps.repo, deps.storage, mediaId, objectKey);
    if (raced !== null) return raced;
    // The source vanished or cleanup claimed the staging row while the bytes were streaming.
    const again = await deps.repo.findRetainedMedia([command.sourceId]);
    if (again.length === 0 || (replace && !(await deps.repo.findReplaceableSource(command.sourceId))))
      throw new AppError('NOT_FOUND', 'Source media not found');
    throw new AppError('UNAVAILABLE', 'Derived media staging expired; retry the upload');
  } catch (error) {
    if (!keepStaged) {
      await discard(deps.repo, deps.storage, mediaId, objectKey).catch(() => undefined);
    }
    if (error instanceof AppError || error instanceof HTTPException) throw error;
    throw new AppError('UNAVAILABLE', 'Media upload failed');
  }
}
