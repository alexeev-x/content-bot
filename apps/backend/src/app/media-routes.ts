import { getPostMediaContent } from '../modules/content';
import { AppError } from '../shared/app-error';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppBindings } from './env';
import { validated } from './validation';

const mediaIdSchema = z.strictObject({ mediaId: z.uuid() });

export const mediaRoutes = new Hono<AppBindings>().get(
  '/:mediaId/content',
  validated('param', mediaIdSchema),
  async (c) => {
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
  }
);
