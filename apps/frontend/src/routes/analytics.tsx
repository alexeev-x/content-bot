import { contentItemIdSchema, contentPlatformSchema } from '@alexeev/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AnalyticsPage } from '../pages/analytics/AnalyticsPage';

const analyticsSearchSchema = z
  .looseObject({
    platform: contentPlatformSchema.optional().catch(undefined),
    id: contentItemIdSchema.optional().catch(undefined)
  })
  .catch({});

export const Route = createFileRoute('/analytics')({ validateSearch: analyticsSearchSchema, component: AnalyticsPage });
