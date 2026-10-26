import { type SourceEventDto, sourceEventPageSchema, sourceEventSchema } from '@alexeev/contracts';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../../shared/api/http-client';

const LIST_LIMIT = 20;
const labAutopublishKeys = { list: ['lab', 'autopublish'] as const };

const announcements = (view: 'active' | 'past', signal: AbortSignal) =>
  apiRequest(`/api/v1/sources/events?view=${view}&status=new&limit=${LIST_LIMIT}`, sourceEventPageSchema, { signal });

/** Steam announcements without a post, fresh and past (seeded before the watcher), newest first; a patch never. */
async function getAnnouncements(signal: AbortSignal): Promise<SourceEventDto[]> {
  const [active, past] = await Promise.all([announcements('active', signal), announcements('past', signal)]);
  return [...active.items, ...past.items]
    .filter((event) => event.type !== 'patch' && event.draft === null)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function labAnnouncementsQueryOptions() {
  return queryOptions({
    queryKey: labAutopublishKeys.list,
    queryFn: ({ signal }) => getAnnouncements(signal),
    staleTime: 30_000,
    // While the AI writes one of them, re-read every 5 s so its row updates by itself (visible tab only).
    refetchInterval: (query) => (query.state.data?.some((event) => event.aiWriting) ? 5_000 : false),
    retry: false
  });
}

/** The whole automatic way without the owner; a paid model call, never retried by itself. */
export function useLabAutopublish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/v1/lab/autopublish/${encodeURIComponent(id)}`, sourceEventSchema, { method: 'POST' }),
    retry: false,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: labAutopublishKeys.list })
  });
}
