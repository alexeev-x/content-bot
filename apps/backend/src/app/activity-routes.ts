import { activityQuerySchema } from '@alexeev/contracts';
import { Hono } from 'hono';
import { readActivity } from '../modules/activity';
import type { AppBindings } from './env';
import { validated } from './validation';

export const activityRoutes = new Hono<AppBindings>().get('/', validated('query', activityQuerySchema), async (c) => {
  const container = c.get('container');
  return c.json(
    await readActivity(
      {
        repo: container.activity,
        ownerId: c.get('actor').telegramId,
        aiPosts: async (postIds) => new Set((await container.aiWriter.postOrigins(postIds)).map((row) => row.postId))
      },
      c.req.valid('query')
    )
  );
});
