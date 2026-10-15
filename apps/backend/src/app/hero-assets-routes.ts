import { dotaHeroAssetsSchema, heroAssetParamsSchema } from '@alexeev/contracts';
import { Hono } from 'hono';
import { listHeroAssets, readHeroAsset } from '../modules/hero-assets';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { validated } from './validation';

// Official hero media mirrored into R2 (docs/API_CONTRACTS.md § Dota hero assets). Files are served through
// the Worker with the owner's session, never as public R2 URLs.
export const heroAssetsRoutes = new Hono<AppBindings>()
  .get('/', async (c) => {
    const container = c.get('container');
    return c.json(dotaHeroAssetsSchema.parse(await listHeroAssets(container.heroAssets)));
  })
  .get('/:slug/:kind', validated('param', heroAssetParamsSchema), async (c) => {
    const container = c.get('container');
    const storage = container.heroAssetStorage;
    if (storage === undefined) throw new AppError('UNAVAILABLE', 'Media storage is not configured');
    const { slug, kind } = c.req.valid('param');
    const object = await readHeroAsset({ repo: container.heroAssets, storage }, slug, kind);
    return new Response(object.body, {
      headers: {
        'content-type': object.contentType,
        'content-length': String(object.size),
        'cache-control': 'private, max-age=86400',
        'x-content-type-options': 'nosniff'
      }
    });
  });
