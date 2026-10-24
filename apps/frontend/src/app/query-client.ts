import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../shared/api/http-client';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // A Mini App gains focus on every switch back from Telegram; polled reads stay fresh on their own,
        // and mutations invalidate what they change.
        refetchOnWindowFocus: false,
        // refetchIntervalInBackground stays at its default (false): polling stops in hidden tabs.
        retry: (failureCount, error) =>
          failureCount < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500)
      },
      mutations: { retry: false }
    }
  });
}
