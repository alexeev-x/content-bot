import type { IncidentDto } from '@alexeev/contracts';
import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { nextCursor } from '../../../shared/api/query-string';
import { listIncidents, resolveIncident, type IncidentFilters } from './incidents-api';

export const incidentKeys = {
  all: ['incidents'] as const,
  lists: () => [...incidentKeys.all, 'list'] as const,
  list: (filters: IncidentFilters) => [...incidentKeys.lists(), filters] as const,
  openCount: () => [...incidentKeys.all, 'open-count'] as const
};

export const INCIDENT_POLL_MS = 30_000;

/**
 * Accumulating list behind «Показать ещё». `staleTime: 0` makes a return from the publication drawer refetch
 * (the reconciliation there closes the incident on the server), while the cached rows stay on screen.
 * Polling pauses in a hidden tab (TanStack's `refetchIntervalInBackground` stays false).
 */
export function incidentsInfiniteQueryOptions(filters: IncidentFilters, pollMs: number = INCIDENT_POLL_MS) {
  return infiniteQueryOptions({
    queryKey: incidentKeys.list(filters),
    queryFn: ({ pageParam, signal }) => listIncidents(filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: 0,
    refetchInterval: pollMs
  });
}

/** The sidebar badge: `openCount` of a one-row page, so the cost is the same single statement for any list size. */
export function openIncidentCountQueryOptions(pollMs: number = INCIDENT_POLL_MS) {
  return queryOptions({
    queryKey: incidentKeys.openCount(),
    queryFn: ({ signal }) => listIncidents({ state: 'open' }, undefined, signal, 1),
    select: (page) => page.openCount,
    staleTime: pollMs,
    refetchInterval: pollMs
  });
}

type ResolveOptions = { onResolved?: (incident: IncidentDto) => void };

/** Nothing is optimistic: the row leaves «Открытые» only after the server's 200 and a refetch. */
export function useResolveIncident({ onResolved }: ResolveOptions = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resolveIncident(id),
    retry: false,
    onSuccess: (incident) => {
      onResolved?.(incident);
      void queryClient.invalidateQueries({ queryKey: incidentKeys.all });
    }
  });
}
