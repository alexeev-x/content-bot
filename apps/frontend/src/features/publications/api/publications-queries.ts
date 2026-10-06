import type { PublicationDto } from '@alexeev/contracts';
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
  cancelPublication,
  createPublication,
  getPublication,
  listPublications,
  reschedulePublication,
  type CancelPublicationBody,
  type CreatePublicationBody,
  type PublicationFilters,
  type ReschedulePublicationBody
} from './publications-api';

export const publicationKeys = {
  all: ['publications'] as const,
  lists: () => [...publicationKeys.all, 'list'] as const,
  list: (filters: PublicationFilters) => [...publicationKeys.lists(), filters] as const,
  details: () => [...publicationKeys.all, 'detail'] as const,
  detail: (id: string) => [...publicationKeys.details(), id] as const
};

// Status changes in the background (cron, queue), so keep lists fresher than reference data.
const STALE_TIME = 15_000;

export function publicationsInfiniteQueryOptions(filters: PublicationFilters = {}) {
  return infiniteQueryOptions({
    queryKey: publicationKeys.list(filters),
    queryFn: ({ pageParam, signal }) => listPublications(filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: STALE_TIME
  });
}

export function publicationQueryOptions(id: string) {
  return queryOptions({
    queryKey: publicationKeys.detail(id),
    queryFn: ({ signal }) => getPublication(id, signal),
    staleTime: STALE_TIME
  });
}

// No optimistic writes: the cache only ever receives the status the server returned.
function applyServerPublication(queryClient: QueryClient, publication: PublicationDto): void {
  queryClient.setQueryData(publicationKeys.detail(publication.id), publication);
  void queryClient.invalidateQueries({ queryKey: publicationKeys.lists() });
}

export function useCreatePublication() {
  const queryClient = useQueryClient();
  const [tracker] = useState(createIdempotencyTracker);
  return useMutation({
    // One key per request: derived once here and released only after the server confirmed this very request.
    mutationFn: async (input: CreatePublicationBody) => {
      const key = tracker.keyFor(input);
      const created = await createPublication(input, key);
      tracker.release(key);
      return created;
    },
    retry: false,
    onSuccess: (publication) => {
      applyServerPublication(queryClient, publication);
    }
  });
}

export function useReschedulePublication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReschedulePublicationBody }) => reschedulePublication(id, input),
    retry: false,
    onSuccess: (publication) => applyServerPublication(queryClient, publication)
  });
}

export function useCancelPublication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CancelPublicationBody }) => cancelPublication(id, input),
    retry: false,
    onSuccess: (publication) => applyServerPublication(queryClient, publication)
  });
}
