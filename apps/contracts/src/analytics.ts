import { z } from 'zod';
import { mediaKindSchema } from './media';
import { pageQuerySchema, pageSchema } from './pagination';

export const publicationAnalyticsOutcomeSchema = z.enum(['sent', 'failed', 'unknown']);
export type PublicationAnalyticsOutcome = z.infer<typeof publicationAnalyticsOutcomeSchema>;

const utcInstantSchema = z.iso.datetime();
const MAX_ANALYTICS_PERIOD_MS = 366 * 24 * 60 * 60 * 1000;

export const publicationAnalyticsQuerySchema = pageQuerySchema
  .extend({
    from: utcInstantSchema,
    to: utcInstantSchema,
    destinationId: z.uuid().optional(),
    mediaKind: mediaKindSchema.optional(),
    outcome: publicationAnalyticsOutcomeSchema.optional(),
    comparison: z.enum(['destination', 'media']).default('destination')
  })
  .refine(
    (query) => {
      const from = Date.parse(query.from);
      const to = Date.parse(query.to);
      return to > from && to - from <= MAX_ANALYTICS_PERIOD_MS;
    },
    { error: 'Invalid reporting interval', path: ['to'] }
  );
export type PublicationAnalyticsQuery = z.infer<typeof publicationAnalyticsQuerySchema>;

const nonnegativeCountSchema = z.number().int().nonnegative();

export const publicationAnalyticsCountsSchema = z.object({
  publications: nonnegativeCountSchema,
  sent: nonnegativeCountSchema,
  failed: nonnegativeCountSchema,
  unknown: nonnegativeCountSchema,
  attempts: nonnegativeCountSchema,
  retries: nonnegativeCountSchema
});
export type PublicationAnalyticsCounts = z.infer<typeof publicationAnalyticsCountsSchema>;

export const publicationAnalyticsGroupSchema = z.object({
  key: z.string().min(1).max(255),
  label: z.string().min(1).max(255),
  counts: publicationAnalyticsCountsSchema,
  coveredPublications: nonnegativeCountSchema,
  unrecordedPublications: nonnegativeCountSchema
});
export type PublicationAnalyticsGroupDto = z.infer<typeof publicationAnalyticsGroupSchema>;

export const publicationAnalyticsRowSchema = z.object({
  publicationId: z.uuid(),
  postId: z.uuid(),
  postRevision: z.number().int().nonnegative(),
  title: z.string().max(200),
  outcome: publicationAnalyticsOutcomeSchema,
  observedAt: utcInstantSchema,
  destinationId: z.uuid(),
  destinationTitle: z.string().max(200).nullable(),
  mediaKinds: z.array(mediaKindSchema).max(10).nullable(),
  attemptCount: nonnegativeCountSchema,
  retryCount: nonnegativeCountSchema
});
export type PublicationAnalyticsRowDto = z.infer<typeof publicationAnalyticsRowSchema>;

export const publicationAnalyticsReportSchema = z.object({
  from: utcInstantSchema,
  to: utcInstantSchema,
  observedAt: utcInstantSchema,
  comparison: z.enum(['destination', 'media']),
  summary: publicationAnalyticsCountsSchema,
  groups: z.array(publicationAnalyticsGroupSchema).max(100),
  publications: pageSchema(publicationAnalyticsRowSchema),
  mediaCoverage: z.object({ recorded: nonnegativeCountSchema, unrecorded: nonnegativeCountSchema })
});
export type PublicationAnalyticsReportDto = z.infer<typeof publicationAnalyticsReportSchema>;

// GET /api/v1/analytics/publications?from&to&destinationId&mediaKind&outcome&comparison&cursor&limit
// -> 200 PublicationAnalyticsReportDto. The interval is UTC [from, to), at most 366 days.
// The response contains absolute counts from append-only Studio snapshots only; it never estimates
// rates or infers unavailable dimensions. Read-only and owner-authenticated; no idempotency key.
// Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403, UNAVAILABLE 503.
