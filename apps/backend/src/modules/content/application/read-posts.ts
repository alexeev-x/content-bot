import type {
  ListPostRevisionsQuery,
  ListPostsQuery,
  PostDto,
  PostPageDto,
  PostRevisionPageDto
} from '@alexeev/contracts';
import { AppError } from '../../../shared/app-error';
import { decodeCursor, decodeRevisionCursor, encodeCursor, encodeRevisionCursor } from './cursor';
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

  // One extra row tells whether another page exists without a second query. The archive count
  // is independent of the page, so it is read beside it.
  const [rows, archivedCount] = await Promise.all([
    deps.repo.list({ view: query.view, status: query.status, after, limit: query.limit + 1 }),
    deps.repo.countArchived()
  ]);
  const page = rows.slice(0, query.limit);
  // A draft has no publications, so only approved posts are asked about.
  const summaries = await deps.summaries.summarize(
    page.filter((record) => record.status === 'approved').map((record) => record.id),
    deps.now
  );
  const last = page.at(-1);
  const lastKey = last === undefined ? 0 : ((query.view === 'archive' ? last.archivedAt : last.updatedAt) ?? 0);
  return {
    items: page.map((record) => toPostDto(record, summaries.get(record.id) ?? emptySummary())),
    nextCursor: rows.length > query.limit && last !== undefined ? encodeCursor({ at: lastKey, id: last.id }) : null,
    archivedCount
  };
}

export async function getPost(deps: ReadPostsDeps, id: string): Promise<PostDto> {
  const record = await deps.repo.findById(id);
  if (record === null) throw notFound();
  const summaries = await deps.summaries.summarize(record.status === 'approved' ? [record.id] : [], deps.now);
  return toPostDto(record, summaries.get(record.id) ?? emptySummary());
}

export async function getPostRevisions(
  deps: Pick<ReadPostsDeps, 'repo'>,
  id: string,
  query: ListPostRevisionsQuery
): Promise<PostRevisionPageDto> {
  const post = await deps.repo.findById(id);
  if (post === null) throw notFound();

  let before: number | undefined;
  if (query.cursor !== undefined) {
    const decoded = decodeRevisionCursor(query.cursor);
    if (decoded === null) throw new AppError('VALIDATION_ERROR', 'Invalid revision cursor', { field: 'cursor' });
    before = decoded;
  }

  const rows = await deps.repo.listRevisions(id, before, query.limit + 1);
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map((revision) => ({
      postId: revision.postId,
      revision: revision.revision,
      title: revision.title,
      body: revision.body,
      entities: revision.entities,
      status: revision.status,
      createdAt: new Date(revision.createdAt).toISOString()
    })),
    nextCursor: rows.length > query.limit && last !== undefined ? encodeRevisionCursor(last.revision) : null
  };
}
