import type { DestinationDto, PostDto, PublicationDto } from '@alexeev/contracts';
import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { ownerDayRange, ownerDaysRange } from '../../shared/lib/owner-timezone';
import { useNow } from '../../shared/lib/use-now';
import { destinationsInfiniteQueryOptions } from '../../features/destinations';
import { postQueryOptions } from '../../features/posts';
import {
  PUBLICATION_POLL_MS,
  publicationsPageQueryOptions,
  type PublicationFilters
} from '../../features/publications';
import { useTabSwitch } from '../../shared/api/use-tab-switch';
import type { Order } from './PublicationsFilters';
import type { PublicationsSearch, PublicationView } from './search';

const TABS: readonly PublicationView[] = ['all', 'upcoming', 'recent', 'errors'];

/** Composes the three features the list needs: publications, the posts they belong to and the channels they go to. */
export function usePublicationsData(search: PublicationsSearch, timeZone: string, pollMs?: number) {
  const now = useNow();
  const view: PublicationView = search.view ?? 'all';
  const period = search.period ?? 'all';
  const range =
    search.from || search.to
      ? { ...(search.from ? { from: search.from } : {}), ...(search.to ? { to: search.to } : {}) }
      : period === 'today'
        ? ownerDayRange(now, timeZone)
        : period === '7d'
          ? ownerDaysRange(now, timeZone, 7)
          : period === '30d'
            ? ownerDaysRange(now, timeZone, 30)
            : undefined;
  const shared = {
    ...(search.post ? { postId: search.post } : {}),
    ...(range ? range : {})
  };
  const filtersFor = (tab: PublicationView, q: string | undefined, order: Order | undefined): PublicationFilters => ({
    ...shared,
    ...(q ? { q } : {}),
    ...(tab === 'upcoming' ? { status: 'scheduled' as const } : {}),
    ...(tab === 'recent' ? { status: 'sent' as const } : {}),
    ...(tab === 'errors' ? { statusGroup: 'errors' as const } : {}),
    order: order ?? (tab === 'upcoming' ? 'asc' : 'desc')
  });
  const pollInterval = pollMs ?? PUBLICATION_POLL_MS;
  const page = search.page ?? 1;
  const list = useQuery(publicationsPageQueryOptions(filtersFor(view, search.q, search.order), page, pollInterval));
  // Tab switching clears search and order, so every tab is warmed with exactly those filters (no polling here:
  // the tab on screen polls itself). The rows' posts are warmed too, so a switch shows titles at once.
  const warmed = useQueries({
    queries: TABS.map((tab) => publicationsPageQueryOptions(filtersFor(tab, undefined, undefined), 1, 0))
  });
  // The tab counters come from the «Все» query only, so they never depend on the active tab's own response.
  const counts = useQuery(
    publicationsPageQueryOptions(
      filtersFor('all', search.q, view === 'all' ? search.order : undefined),
      1,
      pollInterval
    )
  );
  const { switching, shownScope } = useTabSwitch(view, list.isPlaceholderData);
  const destinations = useInfiniteQuery(destinationsInfiniteQueryOptions());
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  const idKey = [
    ...new Set([...items, ...warmed.flatMap((result) => result.data?.items ?? [])].map((item) => item.postId))
  ].join(',');
  const postIds = useMemo(() => (idKey ? idKey.split(',') : []), [idKey]);
  const posts = useQueries({ queries: postIds.map((id) => postQueryOptions(id)) });
  const postById = useMemo(() => {
    const map = new Map<string, PostDto>();
    for (const result of posts) if (result.data) map.set(result.data.id, result.data);
    return map;
  }, [posts]);

  const destinationList = useMemo<DestinationDto[]>(
    () => destinations.data?.pages.flatMap((page) => page.items) ?? [],
    [destinations.data]
  );
  const destinationById = useMemo(() => new Map(destinationList.map((item) => [item.id, item])), [destinationList]);

  const post = useCallback((row: PublicationDto) => postById.get(row.postId), [postById]);
  const postTitle = useCallback((row: PublicationDto) => post(row)?.title, [post]);
  const channel = useCallback(
    (row: PublicationDto) => {
      const found = destinationById.get(row.destinationId);
      return found ? { title: found.title, chatId: found.chatId } : undefined;
    },
    [destinationById]
  );

  return {
    list,
    counts: counts.data,
    switching,
    shownView: shownScope as PublicationView,
    items,
    post,
    postTitle,
    channel
  };
}
