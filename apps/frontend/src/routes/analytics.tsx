import { contentItemIdSchema, contentPlatformSchema, tiktokConnectResultSchema } from '@alexeev/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AnalyticsPage } from '../pages/analytics/AnalyticsPage';

const analyticsSearchSchema = z
  .looseObject({
    days: z
      .union([z.literal(7), z.literal(30), z.literal(90)])
      .optional()
      .catch(undefined),
    tab: z.enum(['items', 'audience']).optional().catch(undefined),
    platform: contentPlatformSchema.optional().catch(undefined),
    page: z.number().int().min(1).max(1000).optional().catch(undefined),
    sort: z.enum(['published', 'views', 'likes', 'comments', 'er', 'multiple']).optional().catch(undefined),
    dir: z.literal('asc').optional().catch(undefined),
    id: contentItemIdSchema.optional().catch(undefined),
    /** Items in «Сравнение роликов», in order; absent means the panel's default pair. */
    compare: z.array(contentItemIdSchema).max(4).optional().catch(undefined),
    tiktok: tiktokConnectResultSchema.optional().catch(undefined)
  })
  .catch({});

export const Route = createFileRoute('/analytics')({ validateSearch: analyticsSearchSchema, component: AnalyticsPage });
