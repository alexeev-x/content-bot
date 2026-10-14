import { useEffect, useRef } from 'react';
import type { PostDto } from '@alexeev/contracts';
import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { keepPreviousRows } from '../../../shared/api/page-query';
import { nextCursor } from '../../../shared/api/query-string';
import { ApiError } from '../../../shared/api/http-client';
import {
  attachMedia,
  bulkDeleteMedia,
  deleteMedia,
  createDraft,
  getDraft,
  getMediaUsage,
  listDrafts,
  listMedia,
  setMediaHidden,
  type MediaFilters
} from './media-api';

export const mediaKeys = {
  all: ['media-library'] as const,
  lists: () => [...mediaKeys.all, 'list'] as const,
  list: (filters: MediaFilters) => [...mediaKeys.lists(), filters] as const,
  usage: (id: string) => [...mediaKeys.all, 'usage', id] as const,
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

export function mediaPageQueryOptions(filters: MediaFilters, page: number) {
  return queryOptions({
    queryKey: [...mediaKeys.lists(), 'page', filters, page] as const,
    queryFn: ({ signal }) => listMedia(filters, undefined, signal, page),
    staleTime: 30_000,
    retry: false,
    placeholderData: keepPreviousRows
  });
}

/** Warms page 1 of every kind tab (same usage and search) so a tab switch is served from the cache. */
export function usePrefetchMediaTabs(tabs: readonly MediaFilters[]): void {
  const queryClient = useQueryClient();
  // The caller rebuilds the array every render; the serialized form is the stable dependency.
  const serialized = JSON.stringify(tabs);
  useEffect(() => {
    const parsed = JSON.parse(serialized) as MediaFilters[];
    for (const filters of parsed) void queryClient.prefetchQuery(mediaPageQueryOptions(filters, 1));
  }, [queryClient, serialized]);
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

/** Where a file is used. Always read fresh: the answer decides what a delete may do. */
export function mediaUsageQueryOptions(id: string) {
  return queryOptions({
    queryKey: mediaKeys.usage(id),
    queryFn: ({ signal }) => getMediaUsage(id, signal),
    staleTime: 0,
    gcTime: 0,
    retry: false
  });
}

/** Deletes files; with `detachDrafts` the server first takes them out of the drafts. Always refreshes the list. */
export function useDeleteMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, detachDrafts }: { ids: string[]; detachDrafts: boolean }) => {
      const [only] = ids;
      if (ids.length === 1 && only !== undefined) {
        await deleteMedia(only, detachDrafts);
        return { deleted: ids, inUse: [] as string[] };
      }
      return bulkDeleteMedia(ids, detachDrafts);
    },
    retry: false,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: mediaKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: ['posts'] });
    }
  });
}

export function useHideMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) => setMediaHidden(id, hidden),
    retry: false,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: mediaKeys.lists() })
  });
}
