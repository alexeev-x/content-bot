import type { ListPostsQuery, PostDto, PostPageDto } from '@alexeev/contracts';
import { AppError } from '../../../shared/app-error';
import { decodeCursor, encodeCursor } from './cursor';
import { toPostDto } from './post-dto';
import type { PostRepository } from './ports';
import { notFound } from './post-errors';

export async function listPosts(deps: { repo: PostRepository }, query: ListPostsQuery): Promise<PostPageDto> {
  const after = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
  if (after === null) throw new AppError('VALIDATION_ERROR', 'Invalid cursor', { field: 'cursor' });

  // One extra row tells whether another page exists without a second query.
  const rows = await deps.repo.list({ status: query.status, after, limit: query.limit + 1 });
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map(toPostDto),
    nextCursor:
      rows.length > query.limit && last !== undefined ? encodeCursor({ updatedAt: last.updatedAt, id: last.id }) : null
  };
}

export async function getPost(deps: { repo: PostRepository }, id: string): Promise<PostDto> {
  const record = await deps.repo.findById(id);
  if (record === null) throw notFound();
  return toPostDto(record);
}
