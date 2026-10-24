import type { IncidentPageDto, ListIncidentsQuery } from '@alexeev/contracts';
import { z } from 'zod';
import { decodeKeysetCursor, encodeKeysetCursor } from '../../../platform/pagination/keyset-cursor';
import { AppError } from '../../../shared/app-error';
import { toIncidentDto } from './incident-dto';
import type { IncidentRepository } from './ports';

const incidentCursorSchema = z.tuple([z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), z.uuid()]);

export async function listIncidents(
  deps: { repo: IncidentRepository; now: number },
  query: ListIncidentsQuery
): Promise<IncidentPageDto> {
  const key = query.cursor === undefined ? undefined : decodeKeysetCursor(query.cursor, incidentCursorSchema);
  if (key === null) throw new AppError('VALIDATION_ERROR', 'Invalid cursor', { field: 'cursor' });

  // One extra row tells whether another page exists without a second query.
  const { items, openCount } = await deps.repo.list({
    state: query.state,
    kind: query.kind,
    after: key === undefined ? undefined : { at: key[0], id: key[1] },
    limit: query.limit + 1
  });
  const page = items.slice(0, query.limit);
  const last = page.at(-1);
  // The cursor follows the list's order: when the incident was raised (open) or closed (resolved).
  const position = last === undefined ? null : query.state === 'open' ? last.createdAt : last.resolvedAt;
  return {
    items: page.map((record) => toIncidentDto(record, deps.now)),
    nextCursor:
      items.length > query.limit && last !== undefined && position !== null
        ? encodeKeysetCursor([position, last.id])
        : null,
    openCount
  };
}
