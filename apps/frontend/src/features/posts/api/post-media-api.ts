import {
  attachPostMediaResultSchema,
  changePostMediaResultSchema,
  cropPostMediaResultSchema,
  mediaLibraryPageSchema,
  postSchema,
  uploadPostMediaResultSchema,
  type PostMediaDto
} from '@alexeev/contracts';
import { queryOptions } from '@tanstack/react-query';
import { ApiError, apiRequest, apiRequestBlob, mapApiError } from '../../../shared/api/http-client';
import { getAccessToken } from '../../../shared/api/session';

type UploadOptions = {
  postId: string;
  revision: number;
  file: File;
  contentType: string;
  signal: AbortSignal;
  onProgress: (percent: number) => void;
  idempotencyKey: string;
};

function sendUpload(options: UploadOptions, idempotencyKey: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const path = `/api/v1/posts/${encodeURIComponent(options.postId)}/media?revision=${options.revision}&fileName=${encodeURIComponent(options.file.name)}`;
    xhr.open('POST', new URL(path, window.location.origin));
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Content-Type', options.contentType);
    xhr.setRequestHeader('Idempotency-Key', idempotencyKey);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
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
      )
        .then(reject)
        .catch(reject);
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    options.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(options.file);
  });
}

export async function uploadPostMedia(options: UploadOptions) {
  const { idempotencyKey } = options;
  try {
    const response = await sendUpload(options, idempotencyKey);
    return uploadPostMediaResultSchema.parse(response);
  } catch (error) {
    // Refresh the in-memory session through the standard client, then safely replay with the same key.
    if (error instanceof ApiError && error.status === 401 && !options.signal.aborted) {
      await apiRequest(`/api/v1/posts/${encodeURIComponent(options.postId)}`, postSchema);
      const response = await sendUpload(options, idempotencyKey);
      return uploadPostMediaResultSchema.parse(response);
    }
    throw error;
  }
}

export function deletePostMedia(postId: string, mediaId: string, revision: number) {
  return apiRequest(
    `/api/v1/posts/${encodeURIComponent(postId)}/media/${encodeURIComponent(mediaId)}`,
    changePostMediaResultSchema,
    {
      method: 'DELETE',
      body: { revision }
    }
  );
}

export async function cropPostMedia(
  postId: string,
  mediaId: string,
  revision: number,
  file: Blob,
  fileName: string,
  idempotencyKey: string
) {
  const path = `/api/v1/posts/${encodeURIComponent(postId)}/media/${encodeURIComponent(mediaId)}/crop?revision=${revision}&fileName=${encodeURIComponent(fileName)}`;
  const send = (): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', new URL(path, window.location.origin));
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.setRequestHeader('Idempotency-Key', idempotencyKey);
      const token = getAccessToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.addEventListener('load', () => {
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
      });
      xhr.addEventListener('error', () => reject(new Error('Network error')), { once: true });
      xhr.send(file);
    });
  try {
    return cropPostMediaResultSchema.parse(await send());
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await apiRequest(`/api/v1/posts/${encodeURIComponent(postId)}`, postSchema);
      return cropPostMediaResultSchema.parse(await send());
    }
    throw error;
  }
}

export function reorderPostMedia(postId: string, revision: number, mediaIds: string[]) {
  return apiRequest(`/api/v1/posts/${encodeURIComponent(postId)}/media/order`, changePostMediaResultSchema, {
    method: 'PATCH',
    body: { revision, mediaIds }
  });
}

export function listMediaLibrary(kind: 'all' | 'photo' | 'video', cursor?: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ kind, limit: '30' });
  if (cursor) query.set('cursor', cursor);
  return apiRequest(`/api/v1/media?${query.toString()}`, mediaLibraryPageSchema, { signal });
}

export function mediaLibraryPageQueryOptions(kind: 'all' | 'photo' | 'video', cursor?: string) {
  return queryOptions({
    queryKey: ['post-media', 'library', kind, cursor ?? null] as const,
    queryFn: ({ signal }) => listMediaLibrary(kind, cursor, signal),
    staleTime: 30_000,
    gcTime: 60_000,
    retry: false
  });
}

export function attachLibraryMedia(postId: string, revision: number, mediaIds: string[]) {
  return apiRequest(`/api/v1/posts/${encodeURIComponent(postId)}/media/attach`, attachPostMediaResultSchema, {
    method: 'POST',
    body: { revision, mediaIds }
  });
}

export function getPostMediaContent(mediaId: string, signal?: AbortSignal): Promise<Blob> {
  return apiRequestBlob(`/api/v1/media/${encodeURIComponent(mediaId)}/content`, { signal });
}

// Media ids are immutable. Cache only small preview assets briefly; pages of full-size originals
// would otherwise multiply memory use on a phone.
export function postMediaContentQueryOptions(
  mediaId: string,
  sizeBytes: number,
  options: { cachePreview?: boolean } = {}
) {
  const cacheable = options.cachePreview !== false && sizeBytes <= 512_000;
  return queryOptions({
    queryKey: ['post-media', 'content', mediaId] as const,
    queryFn: ({ signal }) => getPostMediaContent(mediaId, signal),
    staleTime: cacheable ? 60_000 : 0,
    gcTime: cacheable ? 60_000 : 0,
    retry: false
  });
}

export type { PostMediaDto };
