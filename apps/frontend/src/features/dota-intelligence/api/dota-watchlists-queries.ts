import type { DotaWatchlistsDto } from '@alexeev/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import { addDotaWatchlist, getDotaWatchlists, removeDotaWatchlist } from './dota-watchlists-api';

export const dotaWatchlistKeys = { all: ['dota-watchlists'] as const };

export function useDotaWatchlists() {
  return useQuery({
    queryKey: dotaWatchlistKeys.all,
    queryFn: ({ signal }) => getDotaWatchlists(signal),
    staleTime: 15_000,
    retry: false
  });
}

export function useAddDotaWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceKey, externalId, factId }: { sourceKey: 'patch_notes'; externalId: string; factId: string }) =>
      addDotaWatchlist({ sourceKey, externalId, factId }, crypto.randomUUID()),
    retry: false,
    onSuccess: async ({ watch }) => {
      queryClient.setQueryData<DotaWatchlistsDto>(dotaWatchlistKeys.all, (current) =>
        current
          ? {
              ...current,
              watches: current.watches.some((item) => item.id === watch.id)
                ? current.watches
                : [watch, ...current.watches].slice(0, 100)
            }
          : { watches: [watch], matches: [] }
      );
      await queryClient.invalidateQueries({ queryKey: dotaWatchlistKeys.all });
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) {
        await queryClient.invalidateQueries({ queryKey: dotaWatchlistKeys.all });
      }
    }
  });
}

export function useRemoveDotaWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeDotaWatchlist,
    retry: false,
    onSuccess: async (_result, watchId) => {
      queryClient.setQueryData<DotaWatchlistsDto>(dotaWatchlistKeys.all, (current) =>
        current ? { ...current, watches: current.watches.filter((item) => item.id !== watchId) } : current
      );
      await queryClient.invalidateQueries({ queryKey: dotaWatchlistKeys.all });
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) {
        await queryClient.invalidateQueries({ queryKey: dotaWatchlistKeys.all });
      }
    }
  });
}
