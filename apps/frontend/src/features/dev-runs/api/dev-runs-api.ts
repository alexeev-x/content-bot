import { devRunCandidatesSchema, startDevRunResponseSchema, type DevRunKind } from '@alexeev/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../../shared/api/http-client';

// DEV only, removed after the check before the release (owner, 23.10.2026).

const devRunsKey = ['dev-runs'] as const;

export function useDevRunCandidates() {
  return useQuery({
    queryKey: devRunsKey,
    queryFn: ({ signal }) => apiRequest('/api/v1/dev-runs', devRunCandidatesSchema, { signal })
  });
}

export function useStartDevRun() {
  const client = useQueryClient();
  return useMutation({
    // Every press is paid AI work: never retried on its own.
    mutationFn: (kind: DevRunKind) =>
      apiRequest('/api/v1/dev-runs', startDevRunResponseSchema, { method: 'POST', body: { kind } }),
    retry: false,
    onSettled: () => client.invalidateQueries({ queryKey: devRunsKey })
  });
}
