import { useQuery } from '@tanstack/react-query';
import { relativeTimeRu } from '../../../shared/lib/ru-format';
import { useNow } from '../../../shared/lib/use-now';
import { contentOverviewQueryOptions } from '../api/content-analytics-queries';

/** «Обновлено 12 мин. назад» from the freshest successful collection; null before the first one. */
export function useLastSyncedText(): string | null {
  return useLastSynced().text;
}

/** The same, plus whether the first answer is still on its way (the header keeps one line for it, so nothing jumps). */
export function useLastSynced(): { text: string | null; pending: boolean } {
  const overview = useQuery(contentOverviewQueryOptions());
  const now = useNow().getTime();
  const times = (overview.data?.sources ?? [])
    .map((source) => source.lastSyncedAt)
    .filter((value): value is string => value !== null)
    .sort();
  const latest = times.at(-1);
  return { text: latest ? `Обновлено ${relativeTimeRu(latest, now)}` : null, pending: overview.isPending };
}
