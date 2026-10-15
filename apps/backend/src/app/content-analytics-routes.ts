import {
  contentAnalyticsOverviewSchema,
  contentItemDetailSchema,
  contentItemIdSchema,
  contentItemsPageSchema,
  contentItemsQuerySchema,
  contentReportQuerySchema,
  contentReportSchema
} from '@alexeev/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  collectContentAnalytics,
  listContentItems,
  readContentAnalyticsOverview,
  readContentItem,
  readContentReport
} from '../modules/content-analytics';
import type { AppBindings } from './env';
import { validated } from './validation';

const itemParamsSchema = z.strictObject({ id: contentItemIdSchema });

export const contentAnalyticsRoutes = new Hono<AppBindings>()
  .get('/', async (c) => {
    const container = c.get('container');
    return c.json(
      contentAnalyticsOverviewSchema.parse(
        await readContentAnalyticsOverview({
          repo: container.contentAnalytics,
          sources: container.contentSources,
          clock: container.clock
        })
      )
    );
  })
  .post('/sync', async (c) => {
    const container = c.get('container');
    const repo = container.contentAnalytics;
    const sources = container.contentSources;
    await collectContentAnalytics({
      repo,
      sources,
      clock: container.clock,
      logger: container.logger,
      requestId: c.get('requestId'),
      manual: true
    });
    return c.json(
      contentAnalyticsOverviewSchema.parse(
        await readContentAnalyticsOverview({ repo, sources, clock: container.clock })
      )
    );
  })
  .get('/report', validated('query', contentReportQuerySchema), async (c) => {
    const container = c.get('container');
    return c.json(
      contentReportSchema.parse(
        await readContentReport({ repo: container.contentAnalytics, clock: container.clock }, c.req.valid('query'))
      )
    );
  })
  .get('/items', validated('query', contentItemsQuerySchema), async (c) => {
    const container = c.get('container');
    return c.json(
      contentItemsPageSchema.parse(await listContentItems(container.contentAnalytics, c.req.valid('query')))
    );
  })
  .get('/items/:id', validated('param', itemParamsSchema), async (c) => {
    const container = c.get('container');
    return c.json(
      contentItemDetailSchema.parse(await readContentItem(container.contentAnalytics, c.req.valid('param').id))
    );
  });
