import { dashboardQuerySchema } from '@alexeev/contracts';
import { Hono } from 'hono';
import { readDashboard } from '../modules/publishing';
import type { AppBindings } from './env';
import { readStudioOrigins } from './post-origins';
import { readRubricDay } from './rubric-scheduler/read-history';
import { validated } from './validation';

export const dashboardRoutes = new Hono<AppBindings>().get('/', validated('query', dashboardQuerySchema), async (c) => {
  const container = c.get('container');
  const query = c.req.valid('query');
  const dashboard = await readDashboard(
    {
      repo: container.dashboard,
      now: container.clock.now(),
      origins: (postIds) => readStudioOrigins(container, postIds)
    },
    query
  );
  // Rubric posts show as rubrics on «Лента дня», and the day's rubric slots with no publication beside them (owner,
  // 31.10.2026). Before migration 0119 there are no slots: the dashboard stays as it was.
  const day = await readRubricDay(container, Date.parse(query.from), Date.parse(query.to)).catch((error: unknown) => {
    if (error instanceof Error && /no such table/i.test(error.message)) return null;
    throw error;
  });
  if (day === null) return c.json(dashboard);
  const mark = <T extends { publicationId: string }>(item: T) => ({
    ...item,
    rubricKey: day.byPublication.get(item.publicationId) ?? null
  });
  return c.json({
    ...dashboard,
    today: dashboard.today.map(mark),
    upcoming: dashboard.upcoming.map(mark),
    recentSent: dashboard.recentSent.map(mark),
    rubricSlots: day.slots
  });
});
