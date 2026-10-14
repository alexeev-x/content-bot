import { useRef } from 'react';
import type { PostDto } from '@alexeev/contracts';
import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { nextCursor } from '../../../shared/api/query-string';
import { ApiError } from '../../../shared/api/http-client';
import { attachMedia, createDraft, getDraft, listDrafts, listMedia, type MediaFilters } from './media-api';

export const mediaKeys = {
  all: ['media-library'] as const,
  lists: () => [...mediaKeys.all, 'list'] as const,
  list: (filters: MediaFilters) => [...mediaKeys.lists(), filters] as const,
  drafts: () => [...mediaKeys.all, 'drafts'] as const,
  draft: (id: string) => [...mediaKeys.drafts(), id] as const
};

export function mediaInfiniteQueryOptions(filters: MediaFilters) {
  return infiniteQueryOptions({
    queryKey: mediaKeys.list(filters),
    queryFn: ({ pageParam, signal }) => listMedia(filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: 30_000,
    retry: false
  });
}

export function draftsInfiniteQueryOptions() {
  return infiniteQueryOptions({
    queryKey: mediaKeys.drafts(),
    queryFn: ({ pageParam, signal }) => listDrafts(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: 15_000,
    retry: false
  });
}

export function draftQueryOptions(id: string) {
  return queryOptions({
    queryKey: mediaKeys.draft(id),
    queryFn: ({ signal }) => getDraft(id, signal),
    staleTime: 0,
    retry: false
  });
}

/** A stale revision (409) is re-read once and retried silently; only a second failure reaches the caller. */
async function attachWithRetry(postId: string, revision: number, mediaIds: string[]) {
  try {
    return await attachMedia(postId, revision, mediaIds);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) throw error;
    const fresh = await getDraft(postId);
    if (fresh.status !== 'draft') throw error;
    return attachMedia(postId, fresh.revision, mediaIds);
  }
}

function useRefreshAfterAttach() {
  const queryClient = useQueryClient();
  return (postId: string) => {
    void queryClient.invalidateQueries({ queryKey: mediaKeys.lists() });
    void queryClient.invalidateQueries({ queryKey: mediaKeys.draft(postId) });
    void queryClient.invalidateQueries({ queryKey: ['posts'] });
  };
}

export function useAttachMedia() {
  const refresh = useRefreshAfterAttach();
  return useMutation({
    mutationFn: ({ postId, revision, mediaIds }: { postId: string; revision: number; mediaIds: string[] }) =>
      attachWithRetry(postId, revision, mediaIds),
    retry: false,
    onSuccess: (_result, variables) => refresh(variables.postId)
  });
}

/** Creates a draft and attaches the files. A draft whose attach failed is reused on retry, never duplicated. */
export function useCreatePostWithMedia() {
  const refresh = useRefreshAfterAttach();
  const created = useRef<PostDto | undefined>(undefined);
  return useMutation({
    mutationFn: async (mediaIds: string[]) => {
      created.current ??= await createDraft(crypto.randomUUID());
      const post = created.current;
      await attachWithRetry(post.id, post.revision, mediaIds);
      created.current = undefined;
      return post.id;
    },
    retry: false,
    onSuccess: (postId) => refresh(postId)
  });
}
