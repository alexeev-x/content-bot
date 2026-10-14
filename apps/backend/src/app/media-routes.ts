import {
  deleteMediaAsset,
  deleteMediaAssets,
  deriveLibraryMedia,
  getMediaUsage,
  getPostMediaContent,
  listMediaLibrary,
  setMediaHidden
} from '../modules/content';
import {
  bulkDeleteMediaInputSchema,
  deleteMediaQuerySchema,
  deriveMediaQuerySchema,
  mediaLibraryQuerySchema
} from '@alexeev/contracts';
import { AppError } from '../shared/app-error';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppBindings } from './env';
import { limitBody, validated } from './validation';

const MAX_BODY_BYTES = 4096;

const mediaIdSchema = z.strictObject({ mediaId: z.uuid() });
const idempotencyHeaderSchema = z.object({ 'idempotency-key': z.string().min(1).max(255) });

export const mediaRoutes = new Hono<AppBindings>()
  .get('/', validated('query', mediaLibraryQuerySchema), async (c) => {
    const container = c.get('container');
    return c.json(await listMediaLibrary({ repo: container.postMedia }, c.req.valid('query')));
  })
  .post(
    '/delete',
    limitBody(MAX_BODY_BYTES),
    validated('json', bulkDeleteMediaInputSchema, { reasons: ['DUPLICATE_MEDIA_IDS'] }),
    async (c) => {
      const container = c.get('container');
      if (container.mediaStorage === undefined) throw new AppError('UNAVAILABLE', 'Media storage is not configured');
      return c.json(
        await deleteMediaAssets(
          {
            repo: container.postMedia,
            storage: container.mediaStorage,
            now: container.clock.now(),
            actor: c.get('actor').telegramId,
            logger: container.logger,
            requestId: c.get('requestId')
          },
          c.req.valid('json').ids,
          c.req.valid('json').detachDrafts === true
        )
      );
    }
  )
  .post(
    '/:mediaId/derived',
    validated('param', mediaIdSchema),
    validated('query', deriveMediaQuerySchema),
    validated('header', idempotencyHeaderSchema),
    async (c) => {
      const container = c.get('container');
      const body = c.req.raw.body;
      if (body === null) throw new AppError('VALIDATION_ERROR', 'A media file is required', { reason: 'EMPTY_MEDIA' });
      if (container.mediaStorage === undefined) throw new AppError('UNAVAILABLE', 'Media storage is not configured');
      const query = c.req.valid('query');
      const item = await deriveLibraryMedia(
        {
          repo: container.postMedia,
          storage: container.mediaStorage,
          now: container.clock.now(),
          newId: container.newId
        },
        {
          sourceId: c.req.valid('param').mediaId,
          fileName: query.fileName,
          kind: query.kind,
          mode: query.mode,
          contentType: c.req.header('content-type') ?? '',
          contentLength: Number(c.req.header('content-length')),
          body,
          actor: c.get('actor').telegramId,
          idempotencyKey: c.req.valid('header')['idempotency-key']
        }
      );
      return c.json(item, 201);
    }
  )
  .get('/:mediaId/usage', validated('param', mediaIdSchema), async (c) => {
    const container = c.get('container');
    return c.json(await getMediaUsage({ repo: container.postMedia }, c.req.valid('param').mediaId));
  })
  .post('/:mediaId/hide', validated('param', mediaIdSchema), async (c) => {
    const container = c.get('container');
    await setMediaHidden(
      { repo: container.postMedia, actor: c.get('actor').telegramId, now: container.clock.now() },
      c.req.valid('param').mediaId,
      true
    );
    return c.body(null, 204);
  })
  .post('/:mediaId/unhide', validated('param', mediaIdSchema), async (c) => {
    const container = c.get('container');
    await setMediaHidden(
      { repo: container.postMedia, actor: c.get('actor').telegramId, now: container.clock.now() },
      c.req.valid('param').mediaId,
      false
    );
    return c.body(null, 204);
  })
  .delete('/:mediaId', validated('param', mediaIdSchema), validated('query', deleteMediaQuerySchema), async (c) => {
    const container = c.get('container');
    if (container.mediaStorage === undefined) throw new AppError('UNAVAILABLE', 'Media storage is not configured');
    await deleteMediaAsset(
      {
        repo: container.postMedia,
        storage: container.mediaStorage,
        now: container.clock.now(),
        actor: c.get('actor').telegramId,
        logger: container.logger,
        requestId: c.get('requestId')
      },
      c.req.valid('param').mediaId,
      c.req.valid('query').detachDrafts === true
    );
    return c.body(null, 204);
  })
  .get('/:mediaId/content', validated('param', mediaIdSchema), async (c) => {
    const container = c.get('container');
    if (container.mediaStorage === undefined) throw new AppError('UNAVAILABLE', 'Media storage is not configured');
    const object = await getPostMediaContent(
      { repo: container.postMedia, storage: container.mediaStorage },
      c.req.valid('param').mediaId
    );
    return new Response(object.body, {
      headers: {
        'content-type': object.contentType ?? 'application/octet-stream',
        'content-length': String(object.size),
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff'
      }
    });
  });
