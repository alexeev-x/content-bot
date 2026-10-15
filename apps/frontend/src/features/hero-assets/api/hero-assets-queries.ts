import { queryOptions } from '@tanstack/react-query';
import { getHeroAssets } from './hero-assets-api';

export const heroAssetsKeys = { all: ['hero-assets'] as const };

// The mirror copies a few files a minute: while it runs, the list refreshes every 30 s (only while visible).
export function heroAssetsQueryOptions() {
  return queryOptions({
    queryKey: heroAssetsKeys.all,
    queryFn: ({ signal }) => getHeroAssets(signal),
    staleTime: 30_000,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data !== undefined && data.total > 0 && data.stored + data.missing >= data.total ? false : 30_000;
    }
  });
}
