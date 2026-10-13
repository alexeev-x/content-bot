import { createFileRoute } from '@tanstack/react-router';
import { mediaKindSchema, publicationAnalyticsOutcomeSchema } from '@alexeev/contracts';
import { z } from 'zod';
import { AnalyticsPage } from '../pages/analytics/AnalyticsPage';

const analyticsSearchSchema = z.looseObject({
  from: z.iso.datetime().optional().catch(undefined),
  to: z.iso.datetime().optional().catch(undefined),
  destinationId: z.uuid().optional().catch(undefined),
  mediaKind: mediaKindSchema.optional().catch(undefined),
  outcome: publicationAnalyticsOutcomeSchema.optional().catch(undefined),
  comparison: z.enum(['destination', 'media']).optional().catch(undefined),
  cursor: z.string().min(1).max(512).optional().catch(undefined),
  publicationId: z.uuid().optional().catch(undefined)
});

export const Route = createFileRoute('/analytics')({
  validateSearch: analyticsSearchSchema,
  component: AnalyticsPage
});
