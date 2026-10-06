import type { PostDto } from '@alexeev/contracts';
import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient
} from '@tanstack/react-query';
import { useState } from 'react';
import { createIdempotencyTracker } from '../../../shared/api/idempotency';
import { nextCursor } from '../../../shared/api/query-string';
import {
  approvePost,
  createPost,
  getPost,
  listPosts,
  updatePost,
  type ApprovePostBody,
  type CreatePostBody,
  type PostFilters,
  type UpdatePostBody
} from './posts-api';

export const postKeys = {
  all: ['posts'] as const,
  lists: () => [...postKeys.all, 'list'] as const,
  list: (filters: PostFilters) => [...postKeys.lists(), filters] as const,
  details: () => [...postKeys.all, 'detail'] as const,
  detail: (id: string) => [...postKeys.details(), id] as const
};

export function postsInfiniteQueryOptions(filters: PostFilters = {}) {
  return infiniteQueryOptions({
    queryKey: postKeys.list(filters),
    queryFn: ({ pageParam, signal }) => listPosts(filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: 30_000
  });
}

export function postQueryOptions(id: string) {
  return queryOptions({
    queryKey: postKeys.detail(id),
    queryFn: ({ signal }) => getPost(id, signal),
    staleTime: 30_000
  });
}

// Only called with a server-confirmed post.
function applyServerPost(queryClient: QueryClient, post: PostDto): void {
  queryClient.setQueryData(postKeys.detail(post.id), post);
  void queryClient.invalidateQueries({ queryKey: postKeys.lists() });
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  const [tracker] = useState(createIdempotencyTracker);
  return useMutation({
    // One key per request: derived once here and released only after the server confirmed this very request.
    mutationFn: async (input: CreatePostBody) => {
      const key = tracker.keyFor(input);
      const created = await createPost(input, key);
      tracker.release(key);
      return created;
    },
    retry: false,
    onSuccess: (post) => {
      applyServerPost(queryClient, post);
    }
  });
}

/** 409 (STALE_REVISION, NOT_EDITABLE) rejects the mutation and touches no cache: local edits stay. */
export function useUpdatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePostBody }) => updatePost(id, input),
    retry: false,
    onSuccess: (post) => applyServerPost(queryClient, post)
  });
}

export function useApprovePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ApprovePostBody }) => approvePost(id, input),
    retry: false,
    onSuccess: (post) => applyServerPost(queryClient, post)
  });
}
