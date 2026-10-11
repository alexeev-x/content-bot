import type { ListPostsQuery, PostDto, PostPageDto } from '@alexeev/contracts';
import { AppError } from '../../../shared/app-error';
import { decodeCursor, encodeCursor } from './cursor';
import { emptySummary, toPostDto } from './post-dto';
import type { PostPublicationSummarySource, PostRepository } from './ports';
import { notFound } from './post-errors';

export interface ReadPostsDeps {
  repo: PostRepository;
  summaries: PostPublicationSummarySource;
  now: number;
}

export async function listPosts(deps: ReadPostsDeps, query: ListPostsQuery): Promise<PostPageDto> {
  const after = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
  if (after === null) throw new AppError('VALIDATION_ERROR', 'Invalid cursor', { field: 'cursor' });

  // One extra row tells whether another page exists; counts cover the full selected view, not the cursor page.
  const [rows, archivedCount, totalCount] = await Promise.all([
    deps.repo.list({ view: query.view, status: query.status, after, limit: query.limit + 1 }),
    deps.repo.countArchived(),
    deps.repo.count(query.view, query.status)
  ]);
  const page = rows.slice(0, query.limit);
  // A post returned to draft keeps its terminal publication history, which remains visible in its summary.
  const summaries = await deps.summaries.summarize(
    page.map((record) => record.id),
    deps.now
  );
  const last = page.at(-1);
  const lastKey = last === undefined ? 0 : ((query.view === 'archive' ? last.archivedAt : last.updatedAt) ?? 0);
  return {
    items: page.map((record) => toPostDto(record, summaries.get(record.id) ?? emptySummary())),
    nextCursor: rows.length > query.limit && last !== undefined ? encodeCursor({ at: lastKey, id: last.id }) : null,
    archivedCount,
    totalCount
  };
}

export async function getPost(deps: ReadPostsDeps, id: string): Promise<PostDto> {
  const record = await deps.repo.findById(id);
  if (record === null) throw notFound();
  const summaries = await deps.summaries.summarize([record.id], deps.now);
  return toPostDto(record, summaries.get(record.id) ?? emptySummary());
}

export async function getPostsByIds(deps: ReadPostsDeps, ids: readonly string[]): Promise<PostDto[]> {
  const records = await deps.repo.findManyByIds(ids);
  const summaries = await deps.summaries.summarize(
    records.map((record) => record.id),
    deps.now
  );
  return records.map((record) => toPostDto(record, summaries.get(record.id) ?? emptySummary()));
}
