import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { describeConnectFailure } from '../model/connect-failure';
import { connectBot, getBotStatus } from './bot-api';

export const botKeys = {
  all: ['bot'] as const,
  status: () => [...botKeys.all, 'status'] as const
};

export function botStatusQueryOptions() {
  return queryOptions({
    queryKey: botKeys.status(),
    queryFn: ({ signal }) => getBotStatus(signal),
    // Telegram is the source of truth and the owner can change it elsewhere: refetch on demand, not by timer.
    staleTime: 30_000
  });
}

export function useConnectBot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: connectBot,
    retry: false,
    // The response is the new status; written only after the server confirmed it.
    onSuccess: (status) => {
      queryClient.setQueryData(botKeys.status(), status);
    },
    // A failed connect may have changed Telegram partway (setWebhook done, a later step failed), and
    // BOT_NOT_CONFIGURED means the cached "configured" state is stale. Only a rate limit changed nothing.
    onError: (error) => {
      if (describeConnectFailure(error).kind === 'rate_limited') return;
      void queryClient.invalidateQueries({ queryKey: botKeys.status() });
    }
  });
}
