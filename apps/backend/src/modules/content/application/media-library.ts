import {
  attachPostMediaResultSchema,
  mediaLibraryPageSchema,
  POST_MEDIA_MAX_ITEMS,
  type AttachPostMediaResultDto,
  type MediaLibraryPageDto,
  type MediaLibraryQuery
} from '@alexeev/contracts';
import { AppError } from '../../../shared/app-error';
import type { PostMediaRepository } from './media-ports';

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
  const results = await deps.repo.listLibrary({
    kind: query.kind,
    search: query.search,
    usage: query.usage,
    after: decodeCursor(query.cursor),
    limit: query.limit
  });
  const hasMore = results.length > query.limit;
  const items = results.slice(0, query.limit);
  const last = items.at(-1);
  return mediaLibraryPageSchema.parse({
    items,
    nextCursor: hasMore && last !== undefined ? btoa(`${Date.parse(last.createdAt)}:${last.id}`) : null
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
