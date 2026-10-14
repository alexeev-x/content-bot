import {
  addDotaWatchlistInputSchema,
  dotaHeroStatisticsSchema,
  dotaUpdateParamsSchema,
  listDotaIntelligenceQuerySchema
} from '@alexeev/contracts';
import { Hono } from 'hono';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { validated } from './validation';
import { limitBody } from './validation';
import { z } from 'zod';

const watchIdParamsSchema = z.object({ watchId: z.uuid() });
const idempotencyKeySchema = z.object({ 'idempotency-key': z.string().trim().min(1).max(128) });

export const dotaRoutes = new Hono<AppBindings>()
  .get('/', validated('query', listDotaIntelligenceQuerySchema), async (c) => {
    const container = c.get('container');
    if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
    return c.json(
      await container.dotaRepository.listIntelligence({
        ...c.req.valid('query'),
        now: container.clock.now()
      })
    );
  })
  .get('/updates/:sourceKey/:externalId', validated('param', dotaUpdateParamsSchema), async (c) => {
    const container = c.get('container');
    if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
    const detail = await container.dotaRepository.getUpdateDetail(c.req.valid('param'));
    if (detail === null) throw new AppError('NOT_FOUND', 'Dota update not found');
    return c.json(detail);
  })
  .get('/hero-statistics', async (c) => {
    const container = c.get('container');
    if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
    return c.json(dotaHeroStatisticsSchema.parse(await container.dotaHeroStatistics.get(container.clock.now())));
  })
  .get('/watchlists', validated('query', z.strictObject({})), async (c) => {
    const container = c.get('container');
    if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
    return c.json(await container.dotaWatchlists.list());
  })
  .post(
    '/watchlists',
    limitBody(4096),
    validated('header', idempotencyKeySchema),
    validated('json', addDotaWatchlistInputSchema),
    async (c) => {
      const container = c.get('container');
      if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
      const result = await container.dotaWatchlists.add({
        actor: c.get('actor').telegramId,
        key: c.req.valid('header')['idempotency-key'],
        rawInput: c.req.valid('json'),
        now: container.clock.now(),
        newId: container.newId,
        idempotency: container.idempotency
      });
      return c.json(result.body, result.status);
    }
  )
  .delete('/watchlists/:watchId', validated('param', watchIdParamsSchema), async (c) => {
    const container = c.get('container');
    if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
    await container.dotaWatchlists.remove(c.req.valid('param').watchId, container.clock.now());
    return c.body(null, 204);
  });
