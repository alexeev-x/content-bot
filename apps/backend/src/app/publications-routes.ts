import {
  cancelPublicationInputSchema,
  createPublicationInputSchema,
  listPublicationsQuerySchema,
  reschedulePublicationInputSchema
} from '@alexeev/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  cancelPublication,
  createPublication,
  getPublication,
  listPublications,
  reschedulePublication
} from '../modules/publishing';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { limitBody, validated } from './validation';

const MAX_BODY_BYTES = 8 * 1024;

const idempotencyHeaderSchema = z.object({ 'idempotency-key': z.string().min(1).max(255) });
const idParamSchema = z.object({ id: z.string() });

// A malformed id cannot name a publication, so it is the same 404 as an unknown one (no query is made).
function publicationId(raw: string): string {
  if (!z.uuid().safeParse(raw).success) throw new AppError('NOT_FOUND', 'Publication not found');
  return raw;
}

export const publicationsRoutes = new Hono<AppBindings>()
  .post(
    '/',
    limitBody(MAX_BODY_BYTES),
    validated('header', idempotencyHeaderSchema),
    validated('json', createPublicationInputSchema),
    async (c) => {
      const container = c.get('container');
      const publication = await createPublication(
        {
          publications: container.publications,
          destinations: container.destinations,
          posts: container.postSource,
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
      // 202: the intent is stored; nothing has been sent yet.
      return c.json(publication, 202);
    }
  )
  .get('/', validated('query', listPublicationsQuerySchema), async (c) => {
    const container = c.get('container');
    return c.json(
      await listPublications({ repo: container.publications, now: container.clock.now() }, c.req.valid('query'))
    );
  })
  .get('/:id', validated('param', idParamSchema), async (c) => {
    const container = c.get('container');
    const id = publicationId(c.req.valid('param').id);
    return c.json(await getPublication({ repo: container.publications, now: container.clock.now() }, id));
  })
  .post(
    '/:id/reschedule',
    limitBody(MAX_BODY_BYTES),
    validated('param', idParamSchema),
    validated('json', reschedulePublicationInputSchema),
    async (c) => {
      const container = c.get('container');
      const publication = await reschedulePublication(
        { repo: container.publications, now: container.clock.now() },
        { actor: c.get('actor').telegramId, id: publicationId(c.req.valid('param').id), input: c.req.valid('json') }
      );
      return c.json(publication);
    }
  )
  .post(
    '/:id/cancel',
    limitBody(MAX_BODY_BYTES),
    validated('param', idParamSchema),
    validated('json', cancelPublicationInputSchema),
    async (c) => {
      const container = c.get('container');
      const publication = await cancelPublication(
        { repo: container.publications, now: container.clock.now() },
        { actor: c.get('actor').telegramId, id: publicationId(c.req.valid('param').id), input: c.req.valid('json') }
      );
      return c.json(publication);
    }
  );
