import type { IncidentDto } from '@alexeev/contracts';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { listIncidents, resolveIncident, type IncidentFilters } from './incidents-api';

const incidentKeys = {
  all: ['incidents'] as const,
  lists: () => [...incidentKeys.all, 'list'] as const,
  list: (filters: IncidentFilters) => [...incidentKeys.lists(), filters] as const,
  openCount: () => [...incidentKeys.all, 'open-count'] as const
};

const INCIDENT_POLL_MS = 30_000;

/** First page of open incidents. `staleTime: 0` makes a return from the publication drawer refetch (reconciliation closes the incident on the server). */
export function openIncidentsQueryOptions(pollMs: number = INCIDENT_POLL_MS) {
  return queryOptions({
    queryKey: incidentKeys.list({ state: 'open' }),
    queryFn: ({ signal }) => listIncidents({ state: 'open' }, undefined, signal),
    staleTime: 0,
    refetchInterval: pollMs
  });
}

/**
 * The sidebar badge: `openCount` of a one-row page, so the cost is the same single statement for any list size.
 * It sits on every page, so it never polls (only the incidents screen and the dashboard do): it refreshes on focus
 * once stale and after a resolve invalidates `incidentKeys.all`.
 */
export function openIncidentCountQueryOptions(staleMs: number = INCIDENT_POLL_MS) {
  return queryOptions({
    queryKey: incidentKeys.openCount(),
    queryFn: ({ signal }) => listIncidents({ state: 'open' }, undefined, signal, 1),
    select: (page) => page.openCount,
    staleTime: staleMs
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
