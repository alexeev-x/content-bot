import { listSourceEventsQuerySchema, sourceEventContentSchema, sourceEventIdSchema } from '@alexeev/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import { parseSourceEventId } from '../modules/dota';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { validated } from './validation';
import { appOriginOf } from './bot/app-origin';
import { rateLimit } from './rate-limit';
import { createSourceEventDraft } from './workflows/create-source-event-draft';
import { readSourceEventContent, requestSourceEventDraft } from './workflows/source-event-ai-draft';

// Every «Написать через ИИ» is a paid model call.
const AI_DRAFT_LIMIT = 10;
const AI_DRAFT_WINDOW_MS = 10 * 60 * 1000;

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
  .get('/events/:id/content', validated('param', eventParamsSchema), async (c) => {
    const container = c.get('container');
    if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
    const key = parseSourceEventId(c.req.valid('param').id);
    const event = key === null ? null : await container.sourceEvents.find(key);
    if (key === null || event === null) throw new AppError('NOT_FOUND', 'Event not found');
    const content = await readSourceEventContent(
      { ...key, publishedAt: Date.parse(event.publishedAt) },
      { onError: (error) => container.logger.warn(sourcesLog('content', error)) }
    );
    return c.json(sourceEventContentSchema.parse(content));
  })
  .post(
    '/events/:id/ai-draft',
    rateLimit({ name: 'source-ai-draft', limit: AI_DRAFT_LIMIT, windowMs: AI_DRAFT_WINDOW_MS }),
    validated('param', eventParamsSchema),
    async (c) => {
      const container = c.get('container');
      if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
      const key = parseSourceEventId(c.req.valid('param').id);
      const event = key === null ? null : await container.sourceEvents.find(key);
      if (key === null || event === null) throw new AppError('NOT_FOUND', 'Event not found');
      if (key.sourceKey !== 'steam_news')
        throw new AppError('CONFLICT', 'Only a Steam announcement is written by the AI', { reason: 'NOT_AI_SOURCE' });
      if (event.status === 'hidden') throw new AppError('CONFLICT', 'Event is hidden', { reason: 'EVENT_HIDDEN' });
      const chatId = Number(container.ownerChatId);
      // The draft arrives in the owner's bot chat: without it there is nowhere to send it.
      if (container.ownerChatId === null || !Number.isSafeInteger(chatId))
        throw new AppError('UNAVAILABLE', 'The owner chat is not configured', { reason: 'NO_OWNER_CHAT' });
      const queued = await requestSourceEventDraft(
        { repo: container.dotaRepository, enqueue: (job) => container.aiJobs.send(job), newId: container.newId },
        { externalId: key.externalId, chatId, appOrigin: appOriginOf(c.req.url), replay: true }
      );
      if (!queued) throw new AppError('CONFLICT', 'Event is hidden', { reason: 'EVENT_HIDDEN' });
      const updated = await container.sourceEvents.find(key);
      if (updated === null) throw new AppError('NOT_FOUND', 'Event not found');
      return c.json(updated, 202);
    }
  )
  .post('/events/:id/hide', validated('param', eventParamsSchema), (c) => setHidden(c, true))
  .post('/events/:id/unhide', validated('param', eventParamsSchema), (c) => setHidden(c, false));

const sourcesLog = (operation: string, error: unknown) => ({
  component: 'sources',
  operation,
  status: 'degraded',
  errorCode: error instanceof Error ? error.name : 'unknown'
});

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
