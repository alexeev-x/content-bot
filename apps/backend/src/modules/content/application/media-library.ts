import {
  attachPostMediaResultSchema,
  MEDIA_IN_USE_REASON,
  bulkDeleteMediaResultSchema,
  type BulkDeleteMediaResultDto,
  mediaLibraryPageSchema,
  POST_MEDIA_MAX_ITEMS,
  type AttachPostMediaResultDto,
  type MediaLibraryPageDto,
  type MediaLibraryQuery
} from '@alexeev/contracts';
import { AppError } from '../../../shared/app-error';
import type { Logger } from '../../../platform/logging/logger';
import type { MediaObjectStorage, PostMediaRepository } from './media-ports';

function decodeCursor(cursor: string | undefined): { createdAt: number; id: string } | undefined {
  if (cursor === undefined) return undefined;
  try {
    const decoded = atob(cursor);
    const [timestamp, id] = decoded.split(':');
    const createdAt = Number(timestamp);
    if (!Number.isSafeInteger(createdAt) || createdAt < 0 || id === undefined || !/^[0-9a-f-]{36}$/i.test(id)) {
      throw new Error('invalid cursor');
    }
    return { createdAt, id };
  } catch {
    throw new AppError('VALIDATION_ERROR', 'The media cursor is invalid', { reason: 'INVALID_CURSOR' });
  }
}

export async function listMediaLibrary(
  deps: { repo: PostMediaRepository },
  query: MediaLibraryQuery
): Promise<MediaLibraryPageDto> {
  const { items: results, totalCount } = await deps.repo.listLibrary({
    kind: query.kind,
    search: query.search,
    usage: query.usage,
    after: decodeCursor(query.cursor),
    offset: query.page === undefined ? undefined : (query.page - 1) * query.limit,
    limit: query.limit
  });
  const hasMore = results.length > query.limit;
  const items = results.slice(0, query.limit);
  const last = items.at(-1);
  return mediaLibraryPageSchema.parse({
    items,
    nextCursor:
      query.page === undefined && hasMore && last !== undefined
        ? btoa(`${Date.parse(last.createdAt)}:${last.id}`)
        : null,
    page: query.page ?? null,
    totalCount
  });
}

// The same picture may be attached more than once (also twice in one request). Every post_media row needs its
// own asset row and R2 object, because deletion and cleanup treat "no row references the object" as the only
// rule; so a repeat is a byte copy under a new id. At most 9 copies fit a post, and the copy costs two R2
// calls each, so the whole attach stays well below the Free-plan 50 subrequest limit.
export async function attachRetainedPostMedia(
  deps: { repo: PostMediaRepository; storage?: MediaObjectStorage; now: number; newId: () => string },
  command: { postId: string; revision: number; actor: string; mediaIds: string[] }
): Promise<AttachPostMediaResultDto> {
  const state = await deps.repo.findPostState(command.postId);
  if (state === null) throw new AppError('NOT_FOUND', 'Post not found');
  if (state.status !== 'draft')
    throw new AppError('CONFLICT', 'Only drafts can be changed', { reason: 'NOT_EDITABLE' });
  if (state.revision !== command.revision)
    throw new AppError('CONFLICT', 'Post revision is stale', { reason: 'STALE_REVISION' });
  if (state.media.length + command.mediaIds.length > POST_MEDIA_MAX_ITEMS) {
    throw new AppError('VALIDATION_ERROR', 'The post exceeds Telegram’s media limit', {
      reason: 'MEDIA_LIMIT_EXCEEDED'
    });
  }
  const distinctIds = [...new Set(command.mediaIds)];
  const retained = await deps.repo.findRetainedMedia(distinctIds);
  const byId = new Map(retained.map((item) => [item.id, item]));
  if (byId.size !== distinctIds.length)
    throw new AppError('NOT_FOUND', 'One or more retained media items were not found');

  const taken = new Set(state.media.map(({ id }) => id));
  const plan = command.mediaIds.map((sourceId) => {
    if (!taken.has(sourceId)) {
      taken.add(sourceId);
      return { id: sourceId, sourceId, copy: false };
    }
    const id = deps.newId();
    return { id, sourceId, copy: true };
  });
  const copies = plan
    .filter((item) => item.copy)
    .map(({ id, sourceId }) => ({ id, sourceId, objectKey: `media/${id}` }));
  if (copies.length > 0) await copyObjects(deps, copies, byId);

  const attached = await deps.repo.attachRetained({
    postId: command.postId,
    expectedRevision: command.revision,
    actor: command.actor,
    now: deps.now,
    currentIds: state.media.map(({ id }) => id),
    mediaIds: plan.map(({ id }) => id),
    copies
  });
  if (!attached) throw new AppError('CONFLICT', 'Post media changed concurrently', { reason: 'STALE_REVISION' });
  return attachPostMediaResultSchema.parse({
    media: [
      ...state.media,
      ...plan.flatMap((item, index) => {
        const source = byId.get(item.sourceId);
        if (source === undefined) return [];
        return [
          {
            ...source,
            id: item.id,
            sourceMediaId: item.copy ? null : source.sourceMediaId,
            position: state.media.length + index
          }
        ];
      })
    ],
    revision: command.revision + 1
  });
}

async function copyObjects(
  deps: { repo: PostMediaRepository; storage?: MediaObjectStorage; now: number },
  copies: { id: string; sourceId: string; objectKey: string }[],
  byId: Map<string, { contentType: string }>
): Promise<void> {
  const { storage } = deps;
  if (storage === undefined) throw new AppError('UNAVAILABLE', 'Media storage is not configured');
  const keys = await deps.repo.findObjectKeys([...new Set(copies.map(({ sourceId }) => sourceId))]);
  // Staging rows go first: a crash between the R2 put and the D1 commit leaves a row the Cron cleanup reclaims.
  await deps.repo.registerStagingMany(
    copies.map(({ id, objectKey }) => ({ mediaId: id, objectKey })),
    deps.now
  );
  try {
    for (const copy of copies) {
      const sourceKey = keys.get(copy.sourceId);
      const source = sourceKey === undefined ? null : await storage.get(sourceKey);
      if (source === null) throw new AppError('NOT_FOUND', 'The media file is missing from storage');
      await storage.put(
        copy.objectKey,
        source.body,
        source.contentType ?? byId.get(copy.sourceId)?.contentType ?? 'application/octet-stream'
      );
    }
  } catch (error) {
    await storage.delete(copies.map(({ objectKey }) => objectKey)).catch(() => undefined);
    if (error instanceof AppError) throw error;
    throw new AppError('UNAVAILABLE', 'Media storage is unavailable');
  }
}

type DeleteDeps = {
  repo: PostMediaRepository;
  storage: MediaObjectStorage;
  now: number;
  actor: string;
  logger?: Pick<Logger, 'error'>;
  requestId?: string;
};

// Three round trips for any selection, so 50 ids stay far below the Workers free-plan subrequest limit:
// one D1 batch decides and commits, one R2 call removes every object, one D1 statement drops the cleanup
// rows. D1 commits first: a failed R2 delete leaves the cleanup rows the batch wrote, and the Cron
// cleanup retries them. The reverse order could lose a live file.
async function deleteMany(deps: DeleteDeps, ids: string[]) {
  const result = await deps.repo.deleteUnusedAssets({ mediaIds: ids, actor: deps.actor, now: deps.now });
  const mediaIds = result.deleted.map(({ mediaId }) => mediaId);
  if (mediaIds.length > 0) {
    try {
      await deps.storage.delete(result.deleted.map(({ objectKey }) => objectKey));
      await deps.repo.finishDeletedAssets(mediaIds);
    } catch {
      // The durable cleanup rows stay and the next Cron pass retries; the failure is only logged.
      deps.logger?.error({
        component: 'media',
        operation: 'delete-objects',
        errorCode: 'MEDIA_OBJECT_DELETE_FAILED',
        requestId: deps.requestId,
        mediaIds
      });
    }
  }
  return result;
}

export async function deleteMediaAsset(deps: DeleteDeps, mediaId: string): Promise<void> {
  const result = await deleteMany(deps, [mediaId]);
  if (result.notFound.length > 0) throw new AppError('NOT_FOUND', 'Media not found');
  if (result.inUse.length > 0) {
    throw new AppError('CONFLICT', 'Media is held by a post, a publication or a crop and cannot be deleted', {
      reason: MEDIA_IN_USE_REASON
    });
  }
}

export async function deleteMediaAssets(deps: DeleteDeps, ids: string[]): Promise<BulkDeleteMediaResultDto> {
  const result = await deleteMany(deps, ids);
  return bulkDeleteMediaResultSchema.parse({
    deleted: ids.filter((id) => !result.inUse.includes(id)),
    inUse: result.inUse
  });
}
