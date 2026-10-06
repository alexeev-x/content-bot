import type { DestinationDto, DestinationPageDto, ListDestinationsQuery } from '@alexeev/contracts';
import { z } from 'zod';
import { decodeKeysetCursor, encodeKeysetCursor } from '../../../platform/pagination/keyset-cursor';
import { AppError } from '../../../shared/app-error';
import { toDestinationDto } from './destination-dto';
import { destinationNotFound } from './destination-errors';
import type { DestinationRepository } from './ports';

const destinationCursorSchema = z.tuple([z.string().min(1).max(100), z.uuid()]);

export async function listDestinations(
  deps: { repo: DestinationRepository },
  query: ListDestinationsQuery
): Promise<DestinationPageDto> {
  const key = query.cursor === undefined ? undefined : decodeKeysetCursor(query.cursor, destinationCursorSchema);
  if (key === null) throw new AppError('VALIDATION_ERROR', 'Invalid cursor', { field: 'cursor' });

  // One extra row tells whether another page exists without a second query.
  const rows = await deps.repo.list({
    enabled: query.enabled === undefined ? undefined : query.enabled === 'true',
    after: key === undefined ? undefined : { title: key[0], id: key[1] },
    limit: query.limit + 1
  });
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map(toDestinationDto),
    nextCursor: rows.length > query.limit && last !== undefined ? encodeKeysetCursor([last.title, last.id]) : null
  };
}

export async function getDestination(deps: { repo: DestinationRepository }, id: string): Promise<DestinationDto> {
  const record = await deps.repo.findById(id);
  if (record === null) throw destinationNotFound();
  return toDestinationDto(record);
}
