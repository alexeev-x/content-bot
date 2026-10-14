import { deleteMediaAsset, deleteMediaAssets, getPostMediaContent, listMediaLibrary } from '../modules/content';
import { bulkDeleteMediaInputSchema, mediaLibraryQuerySchema } from '@alexeev/contracts';
import { AppError } from '../shared/app-error';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppBindings } from './env';
import { limitBody, validated } from './validation';

const MAX_BODY_BYTES = 4096;

const mediaIdSchema = z.strictObject({ mediaId: z.uuid() });

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
          c.req.valid('json').ids
        )
      );
    }
  )
  .delete('/:mediaId', validated('param', mediaIdSchema), async (c) => {
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
      c.req.valid('param').mediaId
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
