import { activityQuerySchema } from '@alexeev/contracts';
import { Hono } from 'hono';
import { readActivity } from '../modules/activity';
import type { AppBindings } from './env';
import { validated } from './validation';

export const activityRoutes = new Hono<AppBindings>().get('/', validated('query', activityQuerySchema), async (c) => {
  const container = c.get('container');
  return c.json(
    await readActivity({ repo: container.activity, ownerId: c.get('actor').telegramId }, c.req.valid('query'))
  );
});
