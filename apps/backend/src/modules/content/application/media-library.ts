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

export async function attachRetainedPostMedia(
  deps: { repo: PostMediaRepository; now: number },
  command: { postId: string; revision: number; actor: string; mediaIds: string[] }
): Promise<AttachPostMediaResultDto> {
  if (new Set(command.mediaIds).size !== command.mediaIds.length) {
    throw new AppError('VALIDATION_ERROR', 'Media ids must be unique', { reason: 'DUPLICATE_MEDIA_IDS' });
  }
  const state = await deps.repo.findPostState(command.postId);
  if (state === null) throw new AppError('NOT_FOUND', 'Post not found');
  if (state.status !== 'draft')
    throw new AppError('CONFLICT', 'Only drafts can be changed', { reason: 'NOT_EDITABLE' });
  if (state.revision !== command.revision)
    throw new AppError('CONFLICT', 'Post revision is stale', { reason: 'STALE_REVISION' });
  if (command.mediaIds.some((id) => state.media.some((item) => item.id === id))) {
    throw new AppError('VALIDATION_ERROR', 'Media is already attached to this post', { reason: 'DUPLICATE_MEDIA_IDS' });
  }
  if (state.media.length + command.mediaIds.length > POST_MEDIA_MAX_ITEMS) {
    throw new AppError('VALIDATION_ERROR', 'The post exceeds Telegram’s media limit', {
      reason: 'MEDIA_LIMIT_EXCEEDED'
    });
  }
  const retained = await deps.repo.findRetainedMedia(command.mediaIds);
  if (retained.length !== command.mediaIds.length)
    throw new AppError('NOT_FOUND', 'One or more retained media items were not found');
  const attached = await deps.repo.attachRetained({
    postId: command.postId,
    expectedRevision: command.revision,
    actor: command.actor,
    now: deps.now,
    currentIds: state.media.map(({ id }) => id),
    mediaIds: command.mediaIds
  });
  if (!attached) throw new AppError('CONFLICT', 'Post media changed concurrently', { reason: 'STALE_REVISION' });
  return attachPostMediaResultSchema.parse({
    media: [...state.media, ...retained.map((item, index) => ({ ...item, position: state.media.length + index }))],
    revision: command.revision + 1
  });
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
