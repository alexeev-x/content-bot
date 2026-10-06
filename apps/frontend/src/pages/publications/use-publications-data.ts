import type { DestinationDto, PostDto, PublicationDto } from '@alexeev/contracts';
import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { destinationsInfiniteQueryOptions } from '../../features/destinations';
import { postQueryOptions } from '../../features/posts';
import { publicationsPageQueryOptions, type PublicationFilters } from '../../features/publications';
import type { PublicationsSearch } from './search';

/** Composes the three features the list needs: publications, the posts they belong to and the channels they go to. */
export function usePublicationsData(search: PublicationsSearch, pollMs?: number) {
  const filters: PublicationFilters = {
    ...(search.status ? { status: search.status } : {}),
    ...(search.channel ? { destinationId: search.channel } : {})
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

  const postTitle = useCallback((row: PublicationDto) => postById.get(row.postId)?.title, [postById]);
  const channel = useCallback(
    (row: PublicationDto) => {
      const found = destinationById.get(row.destinationId);
      return found ? { title: found.title, chatId: found.chatId } : undefined;
    },
    [destinationById]
  );

  return { list, destinationList, postTitle, channel };
}
