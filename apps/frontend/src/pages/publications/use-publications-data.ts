import type { DestinationDto, PostDto, PublicationDto } from '@alexeev/contracts';
import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { destinationsInfiniteQueryOptions } from '../../features/destinations';
import { postQueryOptions } from '../../features/posts';
import { publicationsPageQueryOptions, type PublicationFilters } from '../../features/publications';
import type { PublicationsSearch } from './search';

/** Composes the three features the list needs: publications, the posts they belong to and the channels they go to. */
function todayRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function usePublicationsData(search: PublicationsSearch, pollMs?: number) {
  const view = search.view;
  const today = view === 'today' ? todayRange() : undefined;
  const filters: PublicationFilters = {
    ...(search.status ? { status: search.status } : {}),
    ...(search.post ? { postId: search.post } : {}),
    ...(search.channel ? { destinationId: search.channel } : {}),
    ...(search.q ? { q: search.q } : {}),
    ...(today ? today : {}),
    ...(view === 'upcoming' && !search.status ? { status: 'scheduled' as const } : {}),
    ...(view === 'recent' && !search.status ? { status: 'sent' as const } : {}),
    ...(view === 'errors' && !search.status ? { status: 'failed' as const } : {}),
    order: search.order ?? (view === 'upcoming' ? 'asc' : 'desc')
  };
  const list = useQuery(publicationsPageQueryOptions(filters, search.cursor, pollMs));
  const destinations = useInfiniteQuery(destinationsInfiniteQueryOptions());
  const items = list.data?.items;

  const postIds = useMemo(() => [...new Set((items ?? []).map((item) => item.postId))], [items]);
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

  return { list, destinationList, post, postTitle, channel };
}
