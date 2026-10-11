import { listDotaIntelligenceQuerySchema } from '@alexeev/contracts';
import { Hono } from 'hono';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { validated } from './validation';

export const dotaRoutes = new Hono<AppBindings>().get(
  '/',
  validated('query', listDotaIntelligenceQuerySchema),
  async (c) => {
    const container = c.get('container');
    if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
    return c.json(
      await container.dotaRepository.listIntelligence({
        ...c.req.valid('query'),
        now: container.clock.now()
      })
    );
  }
);
