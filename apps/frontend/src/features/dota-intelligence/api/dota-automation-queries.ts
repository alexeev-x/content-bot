import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listAutomations, runWatcherNow, setWatcherPaused } from './dota-automation-api';

const automationKeys = { all: ['dota-watcher-automation'] as const };
const POLL_MS = 2_000;

/** The Dota watcher; polls only while a run is queued or running (TanStack stops it in a hidden tab). */
export function useDotaWatcher() {
  const query = useQuery({
    queryKey: automationKeys.all,
    queryFn: async ({ signal }) => {
      const page = await listAutomations(signal);
      return page.items.find((item) => item.id === 'dota-intelligence') ?? null;
    },
    staleTime: 15_000,
    retry: false,
    refetchInterval: (current) => (current.state.data && current.state.data.executionState !== 'idle' ? POLL_MS : false)
  });
  return query;
}

export function useRunWatcherNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => runWatcherNow(crypto.randomUUID()),
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: automationKeys.all })
  });
}

export function useSetWatcherPaused() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paused, revision }: { paused: boolean; revision: number }) =>
      setWatcherPaused(paused, revision, crypto.randomUUID()),
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: automationKeys.all })
  });
}
