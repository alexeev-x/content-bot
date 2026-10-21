import {
  approveSourceEventAiDraftInputSchema,
  approveSourceEventAiDraftResponseSchema,
  listSourceEventsQuerySchema,
  sourceEventAiDraftSchema,
  sourceEventContentSchema,
  sourceEventIdSchema
} from '@alexeev/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import { parseSourceEventId } from '../modules/dota';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { validated } from './validation';
import { appOriginOf } from './bot/app-origin';
import { rateLimit } from './rate-limit';
import { createWriterDeps } from './bot/writer-deps';
import { approveSourceAiDraft, readSourceAiDraft } from './workflows/approve-source-ai-draft';
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
      if (event.aiWriting) throw new AppError('CONFLICT', 'The AI is writing it already', { reason: 'AI_WRITING' });
      const chatId = Number(container.ownerChatId);
      // The draft arrives in the owner's bot chat: without it there is nowhere to send it.
      if (container.ownerChatId === null || !Number.isSafeInteger(chatId))
        throw new AppError('UNAVAILABLE', 'The owner chat is not configured', { reason: 'NO_OWNER_CHAT' });
      const queued = await requestSourceEventDraft(
        {
          repo: container.dotaRepository,
          enqueue: (job) => container.aiJobs.send(job),
          newId: container.newId,
          now: () => container.clock.now()
        },
        { externalId: key.externalId, chatId, appOrigin: appOriginOf(c.req.url), replay: true }
      );
      // Lost a race with another tap (or a hide): the claim decides, the read says which.
      if (!queued) {
        const now = await container.sourceEvents.find(key);
        throw now?.aiWriting
          ? new AppError('CONFLICT', 'The AI is writing it already', { reason: 'AI_WRITING' })
          : new AppError('CONFLICT', 'Event is hidden', { reason: 'EVENT_HIDDEN' });
      }
      const updated = await container.sourceEvents.find(key);
      if (updated === null) throw new AppError('NOT_FOUND', 'Event not found');
      return c.json(updated, 202);
    }
  )
  .get('/events/:id/ai-draft', validated('param', eventParamsSchema), async (c) => {
    const container = c.get('container');
    const event = await findEvent(c);
    if (event.aiDraftId === null) throw new AppError('NOT_FOUND', 'No AI draft yet');
    return c.json(sourceEventAiDraftSchema.parse(await readSourceAiDraft(container, event.aiDraftId)));
  })
  .post(
    '/events/:id/ai-draft/approve',
    validated('param', eventParamsSchema),
    validated('json', approveSourceEventAiDraftInputSchema),
    async (c) => {
      const container = c.get('container');
      const event = await findEvent(c);
      if (event.aiDraftId === null) throw new AppError('NOT_FOUND', 'No AI draft yet');
      const result = await approveSourceAiDraft(container, await createWriterDeps(container, c.get('requestId')), {
        rootId: event.aiDraftId,
        versionId: c.req.valid('json').versionId,
        actor: c.get('actor').telegramId
      });
      return c.json(approveSourceEventAiDraftResponseSchema.parse(result), result.created ? 201 : 200);
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

async function findEvent(c: import('hono').Context<AppBindings, string, { out: { param: { id: string } } }>) {
  const container = c.get('container');
  if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
  const key = parseSourceEventId(c.req.valid('param').id);
  const event = key === null ? null : await container.sourceEvents.find(key);
  if (event === null) throw new AppError('NOT_FOUND', 'Event not found');
  return event;
}

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
