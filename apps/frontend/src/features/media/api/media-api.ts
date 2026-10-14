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
import {
  ApiError,
  apiRequest,
  apiRequestBlob,
  apiRequestNoContent,
  mapApiError
} from '../../../shared/api/http-client';
import { getAccessToken } from '../../../shared/api/session';
import { PAGE_SIZE } from '../../../shared/api/page-query';
import { buildQuery, DEFAULT_PAGE_SIZE } from '../../../shared/api/query-string';

export type MediaFilters = {
  kind: MediaLibraryKind;
  search?: string;
  usage: z.infer<typeof mediaLibraryUsageFilterSchema>;
};

export function listMedia(filters: MediaFilters, cursor: string | undefined, signal?: AbortSignal, page?: number) {
  return apiRequest(
    `/api/v1/media${buildQuery({ ...filters, cursor, page, limit: page === undefined ? DEFAULT_PAGE_SIZE : PAGE_SIZE })}`,
    mediaLibraryPageSchema,
    { signal }
  );
}

export function getMediaContent(mediaId: string, signal?: AbortSignal) {
  return apiRequestBlob(`/api/v1/media/${encodeURIComponent(mediaId)}/content`, { signal });
}

export function listDrafts(cursor: string | undefined, q: string | undefined, signal?: AbortSignal) {
  return apiRequest(
    `/api/v1/posts${buildQuery({ view: 'live', status: 'draft', q, cursor, limit: DEFAULT_PAGE_SIZE })}`,
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

/** `detach=all`: the server takes the file out of drafts, approved posts and scheduled publications first. */
export function deleteMedia(mediaId: string) {
  return apiRequestNoContent(`/api/v1/media/${encodeURIComponent(mediaId)}${buildQuery({ detach: 'all' })}`, {
    method: 'DELETE'
  });
}

export function bulkDeleteMedia(ids: string[]) {
  return apiRequest('/api/v1/media/delete', bulkDeleteMediaResultSchema, {
    method: 'POST',
    body: { ids, detach: 'all' }
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

function libraryUploadKind(contentType: string): 'photo' | 'animation' | 'video' {
  return contentType === 'image/gif' ? 'animation' : contentType === 'video/mp4' ? 'video' : 'photo';
}

function sendLibraryUpload(
  file: File,
  idempotencyKey: string,
  onProgress: ((percent: number) => void) | undefined,
  signal: AbortSignal | undefined
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const query = buildQuery({ fileName: file.name, kind: libraryUploadKind(file.type) });
    xhr.open('POST', new URL(`/api/v1/media${query}`, window.location.origin));
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.setRequestHeader('Idempotency-Key', idempotencyKey);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as unknown);
        } catch {
          reject(new Error('Unexpected response shape'));
        }
        return;
      }
      void mapApiError(
        new Response(xhr.responseText, { status: xhr.status, headers: { 'Content-Type': 'application/json' } })
      ).then(reject, reject);
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/** Uploads a new file straight into the library; the same key safely replays the same file. */
export async function uploadLibraryMedia(
  file: File,
  idempotencyKey: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
) {
  try {
    return mediaLibraryItemSchema.parse(await sendLibraryUpload(file, idempotencyKey, onProgress, signal));
  } catch (error) {
    // Refresh the in-memory session through the standard client, then replay with the same key.
    if (error instanceof ApiError && error.status === 401 && signal?.aborted !== true) {
      await apiRequest(`/api/v1/media${buildQuery({ limit: 1 })}`, mediaLibraryPageSchema);
      return mediaLibraryItemSchema.parse(await sendLibraryUpload(file, idempotencyKey, onProgress, signal));
    }
    throw error;
  }
}
