import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { nextCursor } from '../../../shared/api/query-string';
import { attachMedia, getDraft, getMediaContent, listDrafts, listMedia, type MediaFilters } from './media-api';

export const mediaKeys = {
  all: ['media-library'] as const,
  lists: () => [...mediaKeys.all, 'list'] as const,
  list: (filters: MediaFilters) => [...mediaKeys.lists(), filters] as const,
  drafts: () => [...mediaKeys.all, 'drafts'] as const,
  draft: (id: string) => [...mediaKeys.drafts(), id] as const,
  content: (id: string) => [...mediaKeys.all, 'content', id] as const
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

export function mediaContentQueryOptions(id: string) {
  return queryOptions({
    queryKey: mediaKeys.content(id),
    queryFn: ({ signal }) => getMediaContent(id, signal),
    staleTime: 0,
    gcTime: 0,
    retry: false
  });
}

export function useAttachMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, revision, mediaIds }: { postId: string; revision: number; mediaIds: string[] }) =>
      attachMedia(postId, revision, mediaIds),
    retry: false,
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: mediaKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: mediaKeys.draft(variables.postId) });
      void queryClient.invalidateQueries({ queryKey: ['posts'] });
    }
  });
}
