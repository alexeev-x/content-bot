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

export const manualObservationMetricSchema = z.enum(['views', 'forwards', 'reactions']);
export type ManualObservationMetric = z.infer<typeof manualObservationMetricSchema>;

export const manualObservationAgeMinutesSchema = z.union([
  z.literal(60),
  z.literal(180),
  z.literal(360),
  z.literal(720),
  z.literal(1440),
  z.literal(2880),
  z.literal(4320),
  z.literal(10080)
]);
export type ManualObservationAgeMinutes = z.infer<typeof manualObservationAgeMinutesSchema>;

export const manualObservationCoverageSchema = z.enum(['complete', 'partial']);
export type ManualObservationCoverage = z.infer<typeof manualObservationCoverageSchema>;

export const manualObservationInputSchema = z
  .strictObject({
    publicationId: z.uuid(),
    metric: manualObservationMetricSchema,
    value: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    contentAgeMinutes: manualObservationAgeMinutesSchema,
    sourceLabel: z.string().trim().min(1).max(120),
    coverage: manualObservationCoverageSchema,
    coverageNote: z.string().trim().min(1).max(500).optional()
  })
  .refine((input) => input.coverage !== 'partial' || input.coverageNote !== undefined, {
    error: 'Partial coverage requires a note',
    path: ['coverageNote']
  });
export type ManualObservationInput = z.infer<typeof manualObservationInputSchema>;

export const manualObservationSchema = z.object({
  id: z.uuid(),
  publicationId: z.uuid(),
  postTitle: z.string().max(200),
  destinationTitle: z.string().max(200),
  metric: manualObservationMetricSchema,
  value: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  contentAgeMinutes: manualObservationAgeMinutesSchema,
  sourceLabel: z.string().min(1).max(120),
  coverage: manualObservationCoverageSchema,
  coverageNote: z.string().max(500).nullable(),
  observedAt: utcInstantSchema
});
export type ManualObservationDto = z.infer<typeof manualObservationSchema>;

export const manualObservationQuerySchema = pageQuerySchema.extend({
  publicationId: z.uuid().optional(),
  metric: manualObservationMetricSchema.optional(),
  contentAgeMinutes: z.coerce.number().pipe(manualObservationAgeMinutesSchema).optional()
});
export type ManualObservationQuery = z.infer<typeof manualObservationQuerySchema>;

export const eligibleObservationPublicationSchema = z.object({
  publicationId: z.uuid(),
  postTitle: z.string().max(200),
  destinationTitle: z.string().max(200)
});
export type EligibleObservationPublicationDto = z.infer<typeof eligibleObservationPublicationSchema>;

export const eligibleObservationPublicationsQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().min(1).max(200).optional()
});
export type EligibleObservationPublicationsQuery = z.infer<typeof eligibleObservationPublicationsQuerySchema>;

export const eligibleObservationPublicationsPageSchema = pageSchema(eligibleObservationPublicationSchema);
export type EligibleObservationPublicationsPageDto = z.infer<typeof eligibleObservationPublicationsPageSchema>;

export const manualObservationsPageSchema = pageSchema(manualObservationSchema);
export type ManualObservationsPageDto = z.infer<typeof manualObservationsPageSchema>;

// GET /api/v1/analytics/eligible-publications?q&cursor&limit → 200 bounded sent-publication picker.
// GET /api/v1/analytics/observations?publicationId&metric&contentAgeMinutes&cursor&limit
//   → 200 append-only owner-entered observations; all filters are optional.
// POST /api/v1/analytics/observations with Idempotency-Key → 201 ManualObservationDto.
// Errors: VALIDATION_ERROR 400, NOT_FOUND 404 (publication not sent), CONFLICT 409
// (IDEMPOTENCY_KEY_REUSED | IN_FLIGHT), UNAUTHORIZED 401, FORBIDDEN 403, UNAVAILABLE 503.

// GET /api/v1/analytics/publications?from&to&destinationId&mediaKind&outcome&comparison&cursor&limit
// -> 200 PublicationAnalyticsReportDto. The interval is UTC [from, to), at most 366 days.
// The response contains absolute counts from append-only Studio snapshots only; it never estimates
// rates or infers unavailable dimensions. Read-only and owner-authenticated; no idempotency key.
// Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403, UNAVAILABLE 503.
