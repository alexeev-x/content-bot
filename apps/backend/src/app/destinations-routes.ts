import {
  createDestinationInputSchema,
  listDestinationsQuerySchema,
  updateDestinationInputSchema
} from '@alexeev/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import { createDestination, getDestination, listDestinations, updateDestination } from '../modules/publishing';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { limitBody, validated } from './validation';

const MAX_BODY_BYTES = 8 * 1024;

const idempotencyHeaderSchema = z.object({ 'idempotency-key': z.string().min(1).max(255) });
const idParamSchema = z.object({ id: z.string() });

// A malformed id cannot name a destination, so it is the same 404 as an unknown one (no query is made).
function destinationId(raw: string): string {
  if (!z.uuid().safeParse(raw).success) throw new AppError('NOT_FOUND', 'Destination not found');
  return raw;
}

export const destinationsRoutes = new Hono<AppBindings>()
  .post(
    '/',
    limitBody(MAX_BODY_BYTES),
    validated('header', idempotencyHeaderSchema),
    validated('json', createDestinationInputSchema),
    async (c) => {
      const container = c.get('container');
      const destination = await createDestination(
        {
          repo: container.destinations,
          idempotency: container.idempotency,
          now: container.clock.now(),
          newId: container.newId
        },
        {
          actor: c.get('actor').telegramId,
          idempotencyKey: c.req.valid('header')['idempotency-key'],
          input: c.req.valid('json')
        }
      );
      return c.json(destination, 201);
    }
  )
  .get('/', validated('query', listDestinationsQuerySchema), async (c) => {
    return c.json(await listDestinations({ repo: c.get('container').destinations }, c.req.valid('query')));
  })
  .get('/:id', validated('param', idParamSchema), async (c) => {
    const id = destinationId(c.req.valid('param').id);
    return c.json(await getDestination({ repo: c.get('container').destinations }, id));
  })
  .patch(
    '/:id',
    limitBody(MAX_BODY_BYTES),
    validated('param', idParamSchema),
    validated('json', updateDestinationInputSchema),
    async (c) => {
      const container = c.get('container');
      const destination = await updateDestination(
        { repo: container.destinations, now: container.clock.now() },
        { actor: c.get('actor').telegramId, id: destinationId(c.req.valid('param').id), input: c.req.valid('json') }
      );
      return c.json(destination);
    }
  );
