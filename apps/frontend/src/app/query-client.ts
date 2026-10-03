import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../shared/api/http-client';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // refetchIntervalInBackground stays at its default (false): polling stops in hidden tabs.
        retry: (failureCount, error) =>
          failureCount < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
      mutations: { retry: false },
    },
  });
}
