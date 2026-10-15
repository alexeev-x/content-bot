import { useQuery } from '@tanstack/react-query';
import { relativeTimeRu } from '../../../shared/lib/ru-format';
import { useNow } from '../../../shared/lib/use-now';
import { contentOverviewQueryOptions } from '../api/content-analytics-queries';

/** «Обновлено 12 мин. назад» from the freshest successful collection; null before the first one. */
export function useLastSyncedText(): string | null {
  const overview = useQuery(contentOverviewQueryOptions());
  const now = useNow().getTime();
  const times = (overview.data?.sources ?? [])
    .map((source) => source.lastSyncedAt)
    .filter((value): value is string => value !== null)
    .sort();
  const latest = times.at(-1);
  return latest ? `Обновлено ${relativeTimeRu(latest, now)}` : null;
}
