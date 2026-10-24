import { type MediaLibraryItemDto, type UploadLibraryMediaQuery, mediaLibraryItemSchema } from '@alexeev/contracts';
import { HTTPException } from 'hono/http-exception';
import { AppError } from '../../../shared/app-error';
import { sha256Hex } from '../../../platform/security/sha256';
import { discard, storedItem } from './derive-media';
import type { MediaObjectStorage, PostMediaRepository } from './media-ports';
import { safeMediaFileName, streamAndValidateMedia } from './media-stream';

function invalid(message: string): AppError {
  return new AppError('VALIDATION_ERROR', message, { reason: 'INVALID_MEDIA' });
}

// Boundary: same as deriveLibraryMedia without a source. Bytes are staged in R2 behind a durable cleanup row, then
// one D1 batch claims the idempotency key and inserts the retained asset; a lost race removes the staged object and
// replays the winner. Signature, byte count, size limit and dimensions come from streamAndValidateMedia.
export async function uploadLibraryMedia(
  deps: { repo: PostMediaRepository; storage: MediaObjectStorage; now: number; newId: () => string },
  command: UploadLibraryMediaQuery & {
    contentType: string;
    contentLength: number;
    body: ReadableStream<Uint8Array>;
    actor: string;
    idempotencyKey: string;
  }
): Promise<MediaLibraryItemDto> {
  const fileName = safeMediaFileName(command.fileName);
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
        op: 'library-upload',
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

    const existing = await replay();
    if (existing !== null) {
      await discard(deps.repo, deps.storage, mediaId, objectKey);
      return existing;
    }

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
      stored = await deps.repo.storeLibraryUpload({
        idempotencyKey: command.idempotencyKey,
        payloadHash,
        responseBody: JSON.stringify(item),
        actor: command.actor,
        now: deps.now,
        asset: {
          id: mediaId,
          sourceMediaId: null,
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
        }
      });
    } catch {
      // The batch may or may not have committed: keep the object when the key proves it did.
      const outcome = await replay().catch(() => undefined);
      if (outcome === undefined) {
        keepStaged = true;
        throw new AppError('UNAVAILABLE', 'Media upload state is uncertain');
      }
      if (outcome?.id === mediaId) {
        keepStaged = true;
        return outcome;
      }
      await discard(deps.repo, deps.storage, mediaId, objectKey);
      if (outcome === null) throw new AppError('UNAVAILABLE', 'Media could not be saved');
      return outcome;
    }
    if (stored) {
      keepStaged = true;
      return (await deps.repo.findLibraryItem(mediaId).catch(() => null)) ?? item;
    }

    const raced = await replay();
    await discard(deps.repo, deps.storage, mediaId, objectKey);
    if (raced !== null) return raced;
    throw new AppError('UNAVAILABLE', 'Media staging expired; retry the upload');
  } catch (error) {
    if (!keepStaged) await discard(deps.repo, deps.storage, mediaId, objectKey).catch(() => undefined);
    if (error instanceof AppError || error instanceof HTTPException) throw error;
    throw new AppError('UNAVAILABLE', 'Media upload failed');
  }
}
