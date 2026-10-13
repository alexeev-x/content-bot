import { publicationAnalyticsQuerySchema } from '@alexeev/contracts';
import { Hono } from 'hono';
import { readPublicationAnalytics } from '../modules/publishing';
import type { AppBindings } from './env';
import { validated } from './validation';

export const analyticsRoutes = new Hono<AppBindings>().get(
  '/publications',
  validated('query', publicationAnalyticsQuerySchema),
  async (c) => {
    const container = c.get('container');
    return c.json(
      await readPublicationAnalytics(
        { repo: container.publicationAnalytics, now: container.clock.now() },
        c.req.valid('query')
      )
    );
  }
);
