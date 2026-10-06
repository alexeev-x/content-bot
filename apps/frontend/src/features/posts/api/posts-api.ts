import {
  postPageSchema,
  postSchema,
  type approvePostInputSchema,
  type createPostInputSchema,
  type listPostsQuerySchema,
  type updatePostInputSchema
} from '@alexeev/contracts';
import type { z } from 'zod';
import { apiRequest } from '../../../shared/api/http-client';
import { buildQuery, DEFAULT_PAGE_SIZE } from '../../../shared/api/query-string';

export type PostFilters = Pick<z.input<typeof listPostsQuerySchema>, 'status'>;
export type CreatePostBody = z.input<typeof createPostInputSchema>;
export type UpdatePostBody = z.input<typeof updatePostInputSchema>;
export type ApprovePostBody = z.input<typeof approvePostInputSchema>;

export function listPosts(filters: PostFilters, cursor: string | undefined, signal?: AbortSignal) {
  const query = buildQuery({ status: filters.status, cursor, limit: DEFAULT_PAGE_SIZE });
  return apiRequest(`/api/v1/posts${query}`, postPageSchema, { signal });
}

export function getPost(id: string, signal?: AbortSignal) {
  return apiRequest(`/api/v1/posts/${encodeURIComponent(id)}`, postSchema, { signal });
}

export function createPost(input: CreatePostBody, idempotencyKey: string) {
  return apiRequest('/api/v1/posts', postSchema, {
    method: 'POST',
    body: input,
    headers: { 'Idempotency-Key': idempotencyKey }
  });
}

export function updatePost(id: string, input: UpdatePostBody) {
  return apiRequest(`/api/v1/posts/${encodeURIComponent(id)}`, postSchema, { method: 'PATCH', body: input });
}

export function approvePost(id: string, input: ApprovePostBody) {
  return apiRequest(`/api/v1/posts/${encodeURIComponent(id)}/approve`, postSchema, { method: 'POST', body: input });
}
