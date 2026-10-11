import {
  cancelPublicationInputSchema,
  bulkDeletePublicationsInputSchema,
  createPublicationInputSchema,
  deletePublicationInputSchema,
  listPublicationsQuerySchema,
  reschedulePublicationInputSchema,
  resolveUnknownPublicationInputSchema
} from '@alexeev/contracts';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import {
  cancelPublication,
  createPublication,
  deletePublication,
  deletePublications,
  getPublication,
  listPublications,
  reschedulePublication,
  resolveUnknownPublication
} from '../modules/publishing';
import { AppError } from '../shared/app-error';
import { appOriginOf } from './bot/app-origin';
import type { AppBindings } from './env';
import { createScheduleNotifier } from './notifications/create-schedule-notifier';
import { limitBody, validated } from './validation';

const MAX_BODY_BYTES = 8 * 1024;

const idempotencyHeaderSchema = z.object({ 'idempotency-key': z.string().min(1).max(255) });
const idParamSchema = z.object({ id: z.string() });

// A malformed id cannot name a publication, so it is the same 404 as an unknown one (no query is made).
function publicationId(raw: string): string {
  if (!z.uuid().safeParse(raw).success) throw new AppError('NOT_FOUND', 'Publication not found');
  return raw;
}

// Built per request: the origin comes from the request, and the messenger and stores are resolved
// only when a notice is really sent.
function scheduleNotifier(c: Context<AppBindings>) {
  const container = c.get('container');
  return createScheduleNotifier({
    messenger: container.ownerMessenger,
    ownerChatId: c.get('actor').telegramId,
    appOrigin: appOriginOf(c.req.url),
    posts: () => container.postRevisions,
    destinations: () => container.destinations,
    logger: container.logger,
    requestId: c.get('requestId'),
    waitUntil: (work) => c.executionCtx.waitUntil(work)
  });
}

export const publicationsRoutes = new Hono<AppBindings>()
  .post(
    '/delete',
    limitBody(MAX_BODY_BYTES),
    validated('json', bulkDeletePublicationsInputSchema, { reasons: ['DUPLICATE_IDS'] }),
    async (c) => {
      const container = c.get('container');
      return c.json(
        await deletePublications(
          { repo: container.publications, now: container.clock.now() },
          { actor: c.get('actor').telegramId, input: c.req.valid('json') }
        )
      );
    }
  )
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
          notifier: scheduleNotifier(c),
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
    '/:id/delete',
    limitBody(MAX_BODY_BYTES),
    validated('param', idParamSchema),
    validated('json', deletePublicationInputSchema),
    async (c) => {
      const container = c.get('container');
      return c.json(
        await deletePublication(
          { repo: container.publications, now: container.clock.now() },
          {
            actor: c.get('actor').telegramId,
            id: publicationId(c.req.valid('param').id),
            input: c.req.valid('json')
          }
        )
      );
    }
  )
  .post(
    '/:id/reschedule',
    limitBody(MAX_BODY_BYTES),
    validated('param', idParamSchema),
    validated('json', reschedulePublicationInputSchema),
    async (c) => {
      const container = c.get('container');
      const publication = await reschedulePublication(
        { repo: container.publications, notifier: scheduleNotifier(c), now: container.clock.now() },
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
  )
  .post(
    '/:id/resolve-unknown',
    limitBody(MAX_BODY_BYTES),
    validated('param', idParamSchema),
    validated('json', resolveUnknownPublicationInputSchema),
    async (c) => {
      const container = c.get('container');
      const publication = await resolveUnknownPublication(
        { repo: container.publications, now: container.clock.now() },
        { actor: c.get('actor').telegramId, id: publicationId(c.req.valid('param').id), input: c.req.valid('json') }
      );
      return c.json(publication);
    }
  );
