import type { AutomationId } from '@alexeev/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listAutomations, runAutomationNow, setAutomationPaused } from './dota-automation-api';

const automationKeys = { one: (id: AutomationId) => ['dota-automations', id] as const };
const POLL_MS = 2_000;

/** One Dota automation; polls only while a run is queued or running (TanStack stops it in a hidden tab). */
export function useDotaAutomation(id: AutomationId) {
  return useQuery({
    queryKey: automationKeys.one(id),
    queryFn: async ({ signal }) => {
      const page = await listAutomations(signal);
      return page.items.find((item) => item.id === id) ?? null;
    },
    staleTime: 15_000,
    retry: false,
    refetchInterval: (current) => (current.state.data && current.state.data.executionState !== 'idle' ? POLL_MS : false)
  });
}

export function useRunAutomationNow(id: AutomationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => runAutomationNow(id, crypto.randomUUID()),
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: automationKeys.one(id) })
  });
}

export function useSetAutomationPaused(id: AutomationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paused, revision }: { paused: boolean; revision: number }) =>
      setAutomationPaused(id, paused, revision, crypto.randomUUID()),
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: automationKeys.one(id) })
  });
}
