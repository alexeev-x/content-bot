import {
  attachPostMediaResultSchema,
  bulkDeleteMediaResultSchema,
  mediaLibraryPageSchema,
  mediaLibraryUsageFilterSchema,
  postPageSchema,
  postSchema,
  type MediaLibraryKind
} from '@alexeev/contracts';
import type { z } from 'zod';
import { apiRequest, apiRequestBlob, apiRequestNoContent } from '../../../shared/api/http-client';
import { buildQuery, DEFAULT_PAGE_SIZE } from '../../../shared/api/query-string';

export type MediaFilters = {
  kind: MediaLibraryKind;
  search?: string;
  usage: z.infer<typeof mediaLibraryUsageFilterSchema>;
};

export function listMedia(filters: MediaFilters, cursor: string | undefined, signal?: AbortSignal) {
  return apiRequest(
    `/api/v1/media${buildQuery({ ...filters, cursor, limit: DEFAULT_PAGE_SIZE })}`,
    mediaLibraryPageSchema,
    { signal }
  );
}

export function getMediaContent(mediaId: string, signal?: AbortSignal) {
  return apiRequestBlob(`/api/v1/media/${encodeURIComponent(mediaId)}/content`, { signal });
}

export function listDrafts(cursor: string | undefined, signal?: AbortSignal) {
  return apiRequest(
    `/api/v1/posts${buildQuery({ view: 'live', status: 'draft', cursor, limit: DEFAULT_PAGE_SIZE })}`,
    postPageSchema,
    { signal }
  );
}

export function getDraft(postId: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/posts/${encodeURIComponent(postId)}`, postSchema, { signal });
}

export function attachMedia(postId: string, revision: number, mediaIds: string[]) {
  return apiRequest(`/api/v1/posts/${encodeURIComponent(postId)}/media/attach`, attachPostMediaResultSchema, {
    method: 'POST',
    body: { revision, mediaIds }
  });
}

/** Empty draft that receives the files; the title is required by the server and the editor renames it. */
export function createDraft(idempotencyKey: string) {
  return apiRequest('/api/v1/posts', postSchema, {
    method: 'POST',
    body: { title: 'Новый пост', body: '' },
    headers: { 'Idempotency-Key': idempotencyKey }
  });
}

export function deleteMedia(mediaId: string) {
  return apiRequestNoContent(`/api/v1/media/${encodeURIComponent(mediaId)}`, { method: 'DELETE' });
}

export function bulkDeleteMedia(ids: string[]) {
  return apiRequest('/api/v1/media/delete', bulkDeleteMediaResultSchema, { method: 'POST', body: { ids } });
}
