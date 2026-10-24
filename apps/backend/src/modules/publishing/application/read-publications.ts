import type { ListPublicationsQuery, PublicationDto, PublicationPageDto } from '@alexeev/contracts';
import { z } from 'zod';
import { decodeKeysetCursor, encodeKeysetCursor } from '../../../platform/pagination/keyset-cursor';
import { AppError } from '../../../shared/app-error';
import type { PublicationRepository } from './ports';
import { publicationNotFound } from './publication-errors';
import { toPublicationDto } from './publication-dto';

const publicationCursorSchema = z.tuple([z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), z.uuid()]);

export async function listPublications(
  deps: { repo: PublicationRepository; now: number },
  query: ListPublicationsQuery
): Promise<PublicationPageDto> {
  const key = query.cursor === undefined ? undefined : decodeKeysetCursor(query.cursor, publicationCursorSchema);
  if (key === null) throw new AppError('VALIDATION_ERROR', 'Invalid cursor', { field: 'cursor' });

  // One extra row tells whether another page exists without a second query.
  const pageQuery = {
    status: query.status,
    statusGroup: query.statusGroup,
    postId: query.postId,
    destinationId: query.destinationId,
    q: query.q,
    from: query.from === undefined ? undefined : Date.parse(query.from),
    to: query.to === undefined ? undefined : Date.parse(query.to),
    order: query.order,
    after: key === undefined ? undefined : { scheduledAt: key[0], id: key[1] },
    offset: query.page === undefined ? undefined : (query.page - 1) * query.limit,
    limit: query.limit + 1,
    now: deps.now
  };
  const result = await deps.repo.listPage(pageQuery);
  const rows = result.items;
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map((record) => toPublicationDto(record, deps.now)),
    nextCursor:
      query.page === undefined && rows.length > query.limit && last !== undefined
        ? encodeKeysetCursor([last.scheduledAt, last.id])
        : null,
    page: query.page ?? null,
    totalCount: result.totalCount,
    statusCounts: result.statusCounts
  };
}

export async function getPublication(
  deps: { repo: PublicationRepository; now: number },
  id: string
): Promise<PublicationDto> {
  const record = await deps.repo.findById(id);
  if (record === null) throw publicationNotFound();
  return toPublicationDto(record, deps.now);
}
