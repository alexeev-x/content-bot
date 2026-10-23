import {
  approveSourceEventAiDraftInputSchema,
  approveSourceEventAiDraftResponseSchema,
  listSourceEventsQuerySchema,
  requestSourceEventAiDraftInputSchema,
  sourceEventAiDraftSchema,
  sourceEventContentSchema,
  rewriteSourceEventSeriesPostInputSchema,
  sendRichSamplesResponseSchema,
  sourceEventIdSchema,
  sourceEventSeriesSchema
} from '@alexeev/contracts';
import { rewriteDraft } from '../modules/ai';
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
import { latestDailyReport, latestPatchCover, sendRichSamples } from './workflows/rich-samples';
import { readSourceEventContent, requestSourceEventDraft } from './workflows/source-event-ai-draft';

// Every «Написать через ИИ» is a paid model call.
const AI_DRAFT_LIMIT = 10;
const AI_DRAFT_WINDOW_MS = 10 * 60 * 1000;
// Each press sends about a dozen messages to Telegram.
const RICH_SAMPLES_LIMIT = 6;
const RICH_SAMPLES_WINDOW_MS = 10 * 60 * 1000;
// A reasoning model at its default effort took over 25 s on DEV; the studio waits for it.
const REWRITE_TIMEOUT_MS = 120_000;
const REWRITES = {
  short: 'короче примерно на треть, без потери главного',
  more: 'подробнее: раскрой ещё одну-две детали из фактов задания, без воды',
  again: 'другой вариант: другой заход, тот же смысл и те же факты'
} as const;

const eventParamsSchema = z.strictObject({ id: sourceEventIdSchema });

export const sourcesRoutes = new Hono<AppBindings>()
  .get('/events', validated('query', listSourceEventsQuerySchema), async (c) => {
    const container = c.get('container');
    if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
    return c.json(await container.sourceEvents.list(c.req.valid('query')));
  })
  // DEV only: Telegram rich message samples to the test channel and the owner's chat (owner, 23.10.2026).
  .post(
    '/rich-samples',
    rateLimit({ name: 'rich-samples', limit: RICH_SAMPLES_LIMIT, windowMs: RICH_SAMPLES_WINDOW_MS }),
    async (c) => {
      const container = c.get('container');
      if (c.env.RICH_SAMPLES !== 'true')
        throw new AppError('FORBIDDEN', 'Rich message samples are off here', { reason: 'RICH_SAMPLES_OFF' });
      if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
      const api = container.richMessages;
      const ownerChatId = container.ownerChatId;
      if (api === null || ownerChatId === null)
        throw new AppError('UNAVAILABLE', 'The bot or the owner chat is not configured');
      // Only a channel named «Тест…»: the samples never reach the real channel.
      const destinations = await container.destinations.list({ enabled: true, limit: 50 });
      const channel = destinations.find(
        (each) => each.kind === 'channel' && each.title.trim().toLowerCase().startsWith('тест')
      );
      if (channel === undefined)
        throw new AppError('CONFLICT', 'No enabled test channel', { reason: 'NO_TEST_CHANNEL' });
      const result = await sendRichSamples({
        api,
        fetch: container.contentFetch,
        patchCover: () => latestPatchCover(container),
        dailyReport: () => latestDailyReport(container),
        channelChatId: channel.chatId,
        ownerChatId,
        logger: container.logger,
        requestId: c.get('requestId')
      });
      return c.json(sendRichSamplesResponseSchema.parse(result));
    }
  )
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
      // An empty body is the ordinary request; only dev lets a test go the automatic way (it may publish).
      const raw: unknown = await c.req.json().catch(() => ({}));
      const input = requestSourceEventAiDraftInputSchema.safeParse(raw ?? {});
      if (!input.success) throw new AppError('VALIDATION_ERROR', 'Invalid request body');
      const automatic = input.data.autopublishTest === true;
      if (automatic && c.env.AUTOPUBLISH_TEST !== 'true')
        throw new AppError('FORBIDDEN', 'The automatic publishing test is off here', {
          reason: 'AUTOPUBLISH_TEST_OFF'
        });
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
        { externalId: key.externalId, chatId, appOrigin: appOriginOf(c.req.url), replay: true, automatic }
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
  .get('/events/:id/series', validated('param', eventParamsSchema), async (c) => {
    const container = c.get('container');
    const event = await findEvent(c);
    const key = parseSourceEventId(event.id);
    const series = key === null ? null : await container.sourceSeries.latest(key.externalId, container.clock.now());
    if (series === null) throw new AppError('NOT_FOUND', 'No series');
    const posts = await Promise.all(
      series.posts.map(async (post) => ({
        id: post.id,
        position: post.position,
        topic: post.topic,
        status: post.status,
        draft: post.generationId === null ? null : await readSourceAiDraft(container, post.generationId),
        media: post.media
      }))
    );
    return c.json(
      sourceEventSeriesSchema.parse({ id: series.id, title: series.title, pageUrl: series.pageUrl, posts })
    );
  })
  .post(
    '/events/:id/series/:postId/approve',
    validated('param', z.strictObject({ id: sourceEventIdSchema, postId: z.uuid() })),
    validated('json', approveSourceEventAiDraftInputSchema),
    async (c) => {
      const container = c.get('container');
      const event = await findEvent(c);
      const post = await container.sourceSeries.findPost(c.req.valid('param').postId);
      if (post === null || `steam_news:${post.externalId}` !== event.id || post.generationId === null)
        throw new AppError('NOT_FOUND', 'No such post in this series');
      const result = await approveSourceAiDraft(container, await createWriterDeps(container, c.get('requestId')), {
        rootId: post.generationId,
        versionId: c.req.valid('json').versionId,
        actor: c.get('actor').telegramId,
        linkToEvent: false
      });
      await container.sourceSeries.setPost({ id: post.id, postId: result.postId });
      // Its own images and videos, once per file (a repeated approval queues nothing new to attach).
      const chatId = Number(container.ownerChatId);
      if (result.created && post.media.length > 0 && container.ownerChatId !== null && Number.isSafeInteger(chatId))
        await container.aiJobs.send({
          id: container.newId(),
          kind: 'source_media',
          chatId,
          postId: result.postId,
          externalId: post.externalId,
          urls: post.media
        });
      return c.json(approveSourceEventAiDraftResponseSchema.parse(result), result.created ? 201 : 200);
    }
  )
  // One post of the series rewritten by the owner's instruction (owner, 21.10.2026: «переписать отдельный пост»).
  .post(
    '/events/:id/series/:postId/rewrite',
    rateLimit({ name: 'source-ai-draft', limit: AI_DRAFT_LIMIT, windowMs: AI_DRAFT_WINDOW_MS }),
    validated('param', z.strictObject({ id: sourceEventIdSchema, postId: z.uuid() })),
    validated('json', rewriteSourceEventSeriesPostInputSchema),
    async (c) => {
      const container = c.get('container');
      const event = await findEvent(c);
      const post = await container.sourceSeries.findPost(c.req.valid('param').postId);
      if (post === null || `steam_news:${post.externalId}` !== event.id || post.generationId === null)
        throw new AppError('NOT_FOUND', 'No such post in this series');
      const input = c.req.valid('json');
      const current = await readSourceAiDraft(container, post.generationId);
      // Only the version the owner sees, and only before approval: a stale or approved one is refused, not rewritten.
      if (current.versionId !== input.versionId)
        throw new AppError('CONFLICT', 'A newer version exists', { reason: 'STALE_REVISION' });
      if (current.postId !== null) throw new AppError('CONFLICT', 'Already approved', { reason: 'APPROVED' });
      if (input.action === 'custom' && input.instruction === undefined)
        throw new AppError('VALIDATION_ERROR', 'Say what to change', { reason: 'NO_INSTRUCTION' });
      await rewriteDraft(await createWriterDeps(container, c.get('requestId')), {
        generationId: input.versionId,
        instruction: input.action === 'custom' ? (input.instruction ?? '') : REWRITES[input.action],
        signal: AbortSignal.timeout(REWRITE_TIMEOUT_MS)
      });
      return c.json(sourceEventAiDraftSchema.parse(await readSourceAiDraft(container, post.generationId)));
    }
  )
  // Attaches the announcement's images to the event's post again (a failed or partial run); one copy per image.
  .post('/events/:id/images', validated('param', eventParamsSchema), async (c) => {
    const container = c.get('container');
    const event = await findEvent(c);
    const key = parseSourceEventId(event.id);
    if (key === null || key.sourceKey !== 'steam_news' || event.draft === null)
      throw new AppError('CONFLICT', 'No announcement post to attach images to', { reason: 'NO_POST' });
    const chatId = Number(container.ownerChatId);
    if (container.ownerChatId === null || !Number.isSafeInteger(chatId))
      throw new AppError('UNAVAILABLE', 'The owner chat is not configured', { reason: 'NO_OWNER_CHAT' });
    await container.aiJobs.send({
      id: container.newId(),
      kind: 'source_media',
      chatId,
      postId: event.draft.postId,
      externalId: key.externalId
    });
    return c.json(event, 202);
  })
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
