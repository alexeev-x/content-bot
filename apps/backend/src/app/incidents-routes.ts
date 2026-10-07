import { listIncidentsQuerySchema } from '@alexeev/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import { listIncidents, resolveIncident } from '../modules/publishing';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { validated } from './validation';

const idParamSchema = z.object({ id: z.string() });

// A malformed id cannot name an incident, so it is the same 404 as an unknown one (no query is made).
function incidentId(raw: string): string {
  if (!z.uuid().safeParse(raw).success) throw new AppError('NOT_FOUND', 'Incident not found');
  return raw;
}

export const incidentsRoutes = new Hono<AppBindings>()
  .get('/', validated('query', listIncidentsQuerySchema), async (c) => {
    const container = c.get('container');
    return c.json(await listIncidents({ repo: container.incidents, now: container.clock.now() }, c.req.valid('query')));
  })
  // No body, so nothing to limit or validate beyond the id.
  .post('/:id/resolve', validated('param', idParamSchema), async (c) => {
    const container = c.get('container');
    const incident = await resolveIncident(
      { repo: container.incidents, now: container.clock.now() },
      { actor: c.get('actor').telegramId, id: incidentId(c.req.valid('param').id) }
    );
    return c.json(incident);
  });
