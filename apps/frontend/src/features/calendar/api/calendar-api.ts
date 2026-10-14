import {
  destinationPageSchema,
  postPageSchema,
  publicationPageSchema,
  type DestinationDto,
  type PostDto,
  type PublicationDto
} from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';
import { buildQuery } from '../../../shared/api/query-string';

const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const ACTIVE_POST_STATUSES = ['scheduled', 'queued', 'preparing', 'sending', 'retry_wait', 'unknown'] as const;

export class CalendarRangeTooDenseError extends Error {
  constructor() {
    super('Calendar collection exceeded its safe page limit');
    this.name = 'CalendarRangeTooDenseError';
  }
}

async function fetchAll<T>(
  fetchPage: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor: string | null }>
) {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber += 1) {
    const page = await fetchPage(cursor);
    items.push(...page.items);
    if (!page.nextCursor) return items;
    if (seen.has(page.nextCursor)) throw new CalendarRangeTooDenseError();
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new CalendarRangeTooDenseError();
}

export type CalendarData = {
  publications: PublicationDto[];
  posts: PostDto[];
  unscheduledPosts: PostDto[];
  destinations: DestinationDto[];
};

export async function fetchCalendarData(
  range: { from: string; to: string },
  signal?: AbortSignal
): Promise<CalendarData> {
  const from = new Date(Date.parse(range.from) - 1).toISOString();
  const to = new Date(Date.parse(range.to) + 1).toISOString();
  const [publications, drafts, approved, destinations] = await Promise.all([
    fetchAll((cursor) =>
      apiRequest(
        `/api/v1/publications${buildQuery({ from, to, order: 'asc', cursor, limit: PAGE_SIZE })}`,
        publicationPageSchema,
        { signal }
      )
    ),
    fetchAll((cursor) =>
      apiRequest(`/api/v1/posts${buildQuery({ status: 'draft', cursor, limit: PAGE_SIZE })}`, postPageSchema, {
        signal
      })
    ),
    fetchAll((cursor) =>
      apiRequest(`/api/v1/posts${buildQuery({ status: 'approved', cursor, limit: PAGE_SIZE })}`, postPageSchema, {
        signal
      })
    ),
    fetchAll((cursor) =>
      apiRequest(`/api/v1/destinations${buildQuery({ cursor, limit: PAGE_SIZE })}`, destinationPageSchema, { signal })
    )
  ]);
  const posts = [...drafts, ...approved];
  const unscheduledPosts = posts.filter((post) =>
    ACTIVE_POST_STATUSES.every((status) => post.publicationSummary.counts[status] === 0)
  );
  return {
    publications: publications.filter((publication) => {
      const scheduledAt = Date.parse(publication.scheduledAt);
      return scheduledAt >= Date.parse(range.from) && scheduledAt < Date.parse(range.to);
    }),
    posts,
    unscheduledPosts,
    destinations
  };
}
