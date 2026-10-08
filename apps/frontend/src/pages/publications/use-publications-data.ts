import type { DestinationDto, PostDto, PublicationDto } from '@alexeev/contracts';
import { useInfiniteQuery, useQueries } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { destinationsInfiniteQueryOptions } from '../../features/destinations';
import { postQueryOptions } from '../../features/posts';
import {
  PUBLICATION_POLL_MS,
  publicationsInfiniteQueryOptions,
  type PublicationFilters
} from '../../features/publications';
import type { PublicationsSearch } from './search';

/** Composes the three features the list needs: publications, the posts they belong to and the channels they go to. */
export function usePublicationsData(search: PublicationsSearch, pollMs?: number) {
  const view = search.view;
  const filters: PublicationFilters = {
    ...(search.post ? { postId: search.post } : {}),
    ...(view === 'upcoming' ? { status: 'scheduled' as const } : {}),
    ...(view === 'recent' ? { status: 'sent' as const } : {}),
    ...(view === 'errors' ? { status: 'failed' as const } : {}),
    order: search.order ?? (view === 'upcoming' ? 'asc' : 'desc')
  };
  const list = useInfiniteQuery(publicationsInfiniteQueryOptions(filters, pollMs ?? PUBLICATION_POLL_MS));
  const destinations = useInfiniteQuery(destinationsInfiniteQueryOptions());
  // Polling refetches every loaded page; a row that moved between pages must still appear once.
  const items = useMemo(() => {
    const seen = new Set<string>();
    const rows: PublicationDto[] = [];
    for (const page of list.data?.pages ?? []) {
      for (const item of page.items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          rows.push(item);
        }
      }
    }
    return rows;
  }, [list.data]);

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
