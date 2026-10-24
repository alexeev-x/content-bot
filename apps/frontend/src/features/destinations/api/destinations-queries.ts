import type { DestinationDto } from '@alexeev/contracts';
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
  checkDestination,
  createDestination,
  getDestination,
  listDestinations,
  updateDestination,
  type CheckDestinationBody,
  type CreateDestinationBody,
  type DestinationFilters,
  type UpdateDestinationBody
} from './destinations-api';

export const destinationKeys = {
  all: ['destinations'] as const,
  lists: () => [...destinationKeys.all, 'list'] as const,
  list: (filters: DestinationFilters) => [...destinationKeys.lists(), filters] as const,
  details: () => [...destinationKeys.all, 'detail'] as const,
  detail: (id: string) => [...destinationKeys.details(), id] as const
};

// Reference data that changes rarely.
const STALE_TIME = 5 * 60_000;

export function destinationsInfiniteQueryOptions(filters: DestinationFilters = {}) {
  return infiniteQueryOptions({
    queryKey: destinationKeys.list(filters),
    queryFn: ({ pageParam, signal }) => listDestinations(filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: STALE_TIME
  });
}

export function destinationQueryOptions(id: string) {
  return queryOptions({
    queryKey: destinationKeys.detail(id),
    queryFn: ({ signal }) => getDestination(id, signal),
    staleTime: STALE_TIME
  });
}

function applyServerDestination(queryClient: QueryClient, destination: DestinationDto): void {
  queryClient.setQueryData(destinationKeys.detail(destination.id), destination);
  void queryClient.invalidateQueries({ queryKey: destinationKeys.lists() });
}

export function useCreateDestination() {
  const queryClient = useQueryClient();
  const [tracker] = useState(createIdempotencyTracker);
  return useMutation({
    // One key per request: derived once here and released only after the server confirmed this very request.
    mutationFn: async (input: CreateDestinationBody) => {
      const key = tracker.keyFor(input);
      const created = await createDestination(input, key);
      tracker.release(key);
      return created;
    },
    retry: false,
    onSuccess: (destination) => {
      applyServerDestination(queryClient, destination);
    }
  });
}

export function useUpdateDestination() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDestinationBody }) => updateDestination(id, input),
    retry: false,
    onSuccess: (destination) => applyServerDestination(queryClient, destination)
  });
}

/** No cache write: a check is a point-in-time answer from Telegram, and the caller keeps it only in its own state. */
export function useCheckDestination() {
  return useMutation({
    mutationFn: (input: CheckDestinationBody) => checkDestination(input),
    retry: false
  });
}
