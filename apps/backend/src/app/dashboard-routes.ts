import { dashboardQuerySchema } from '@alexeev/contracts';
import { Hono } from 'hono';
import { readDashboard } from '../modules/publishing';
import type { AppBindings } from './env';
import { readStudioOrigins } from './post-origins';
import { validated } from './validation';

export const dashboardRoutes = new Hono<AppBindings>().get('/', validated('query', dashboardQuerySchema), async (c) => {
  const container = c.get('container');
  return c.json(
    await readDashboard(
      {
        repo: container.dashboard,
        now: container.clock.now(),
        origins: (postIds) => readStudioOrigins(container, postIds)
      },
      c.req.valid('query')
    )
  );
});
