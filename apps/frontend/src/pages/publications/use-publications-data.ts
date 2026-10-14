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
import type { PublicationsSearch } from './search';

/** Composes the three features the list needs: publications, the posts they belong to and the channels they go to. */
export function usePublicationsData(search: PublicationsSearch, timeZone: string, pollMs?: number) {
  const now = useNow();
  const view = search.view;
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
  const filters: PublicationFilters = {
    ...(search.post ? { postId: search.post } : {}),
    ...(search.q ? { q: search.q } : {}),
    ...(range ? range : {}),
    ...(view === 'upcoming' ? { status: 'scheduled' as const } : {}),
    ...(view === 'recent' ? { status: 'sent' as const } : {}),
    ...(view === 'errors' ? { statusGroup: 'errors' as const } : {}),
    order: search.order ?? (view === 'upcoming' ? 'asc' : 'desc')
  };
  const list = useQuery(publicationsPageQueryOptions(filters, search.page ?? 1, pollMs ?? PUBLICATION_POLL_MS));
  const destinations = useInfiniteQuery(destinationsInfiniteQueryOptions());
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  const postIds = useMemo(() => [...new Set(items.map((item) => item.postId))], [items]);
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

  return { list, items, post, postTitle, channel };
}
