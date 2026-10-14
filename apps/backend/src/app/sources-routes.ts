import { listSourceEventsQuerySchema, sourceEventIdSchema } from '@alexeev/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import { parseSourceEventId } from '../modules/dota';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { validated } from './validation';
import { createSourceEventDraft } from './workflows/create-source-event-draft';

const eventParamsSchema = z.strictObject({ id: sourceEventIdSchema });

export const sourcesRoutes = new Hono<AppBindings>()
  .get('/events', validated('query', listSourceEventsQuerySchema), async (c) => {
    const container = c.get('container');
    if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
    return c.json(await container.sourceEvents.list(c.req.valid('query')));
  })
  .post('/events/:id/draft', validated('param', eventParamsSchema), async (c) => {
    const container = c.get('container');
    if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
    const key = parseSourceEventId(c.req.valid('param').id);
    if (key === null) throw new AppError('NOT_FOUND', 'Event not found');
    const result = await createSourceEventDraft(
      {
        events: container.sourceEvents,
        repo: container.dotaRepository,
        posts: container.posts,
        idempotency: container.idempotency,
        actor: c.get('actor').telegramId,
        now: () => container.clock.now(),
        newId: container.newId
      },
      key
    );
    return c.json(result, result.created ? 201 : 200);
  })
  .post('/events/:id/hide', validated('param', eventParamsSchema), (c) => setHidden(c, true))
  .post('/events/:id/unhide', validated('param', eventParamsSchema), (c) => setHidden(c, false));

async function setHidden(
  c: import('hono').Context<AppBindings, string, { out: { param: { id: string } } }>,
  hidden: boolean
) {
  const container = c.get('container');
  if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
  const key = parseSourceEventId(c.req.valid('param').id);
  if (key === null || !(await container.sourceEvents.setHidden(key, hidden ? container.clock.now() : null)))
    throw new AppError('NOT_FOUND', 'Event not found');
  const event = await container.sourceEvents.find(key);
  if (event === null) throw new AppError('NOT_FOUND', 'Event not found');
  return c.json(event);
}
