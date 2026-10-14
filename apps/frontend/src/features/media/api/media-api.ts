import {
  attachPostMediaResultSchema,
  bulkDeleteMediaResultSchema,
  mediaLibraryItemSchema,
  mediaLibraryPageSchema,
  mediaLibraryUsageFilterSchema,
  mediaUsageSchema,
  postPageSchema,
  postSchema,
  type MediaLibraryKind
} from '@alexeev/contracts';
import type { z } from 'zod';
import { apiRequest, apiRequestBlob, apiRequestNoContent } from '../../../shared/api/http-client';
import { PAGE_SIZE } from '../../../shared/api/page-query';
import { buildQuery, DEFAULT_PAGE_SIZE } from '../../../shared/api/query-string';

export type MediaFilters = {
  kind: MediaLibraryKind;
  search?: string;
  usage: z.infer<typeof mediaLibraryUsageFilterSchema>;
  /** Only the files the owner hid; omitted (not `false`) for the normal library. */
  hidden?: true;
};

export function listMedia(filters: MediaFilters, cursor: string | undefined, signal?: AbortSignal, page?: number) {
  return apiRequest(
    `/api/v1/media${buildQuery({ ...filters, hidden: filters.hidden ? 'true' : undefined, cursor, page, limit: page === undefined ? DEFAULT_PAGE_SIZE : PAGE_SIZE })}`,
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

export function getMediaUsage(mediaId: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/media/${encodeURIComponent(mediaId)}/usage`, mediaUsageSchema, { signal });
}

/** `detachDrafts` first removes the file from the drafts that hold it (the owner confirmed exactly that). */
export function deleteMedia(mediaId: string, detachDrafts: boolean) {
  return apiRequestNoContent(
    `/api/v1/media/${encodeURIComponent(mediaId)}${buildQuery({ detachDrafts: detachDrafts ? 'true' : undefined })}`,
    { method: 'DELETE' }
  );
}

export function bulkDeleteMedia(ids: string[], detachDrafts: boolean) {
  return apiRequest('/api/v1/media/delete', bulkDeleteMediaResultSchema, {
    method: 'POST',
    body: detachDrafts ? { ids, detachDrafts: true } : { ids }
  });
}

export function setMediaHidden(mediaId: string, hidden: boolean) {
  return apiRequestNoContent(`/api/v1/media/${encodeURIComponent(mediaId)}/${hidden ? 'hide' : 'unhide'}`, {
    method: 'POST'
  });
}

export type DeriveMode = 'new' | 'replace';

/** Stores a cropped photo or video as a new library item derived from `sourceId` (the original stays). */
export function deriveMedia(
  sourceId: string,
  file: Blob,
  fileName: string,
  kind: 'photo' | 'video',
  idempotencyKey: string,
  mode: DeriveMode,
  signal?: AbortSignal
) {
  return apiRequest(
    `/api/v1/media/${encodeURIComponent(sourceId)}/derived${buildQuery({ fileName, kind, mode })}`,
    mediaLibraryItemSchema,
    { method: 'POST', rawBody: file, headers: { 'Idempotency-Key': idempotencyKey }, signal }
  );
}
