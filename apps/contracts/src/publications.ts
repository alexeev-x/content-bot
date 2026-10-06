import { z } from 'zod';
import { pageQuerySchema, pageSchema } from './pagination';

// User-facing projection of internal job states (docs/BACKEND_ARCHITECTURE.md §5).
export const publicationStatusSchema = z.enum([
  'scheduled',
  'queued',
  'preparing',
  'sending',
  'sent',
  'retry_wait',
  'failed',
  'unknown',
  'cancelled'
]);
export type PublicationStatus = z.infer<typeof publicationStatusSchema>;

const revisionSchema = z.number().int().nonnegative();
// IANA zone of the operator when scheduling; the instant itself is always UTC. Aliases are
// normalised to the canonical name (EST5EDT → America/New_York) so equal requests hash equally;
// fixed offsets like +05:00 are refused because they ignore DST.
function canonicalTimeZone(zone: string): string | null {
  if (!/^[A-Za-z]/.test(zone)) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .transform((zone, ctx) => {
    const canonical = canonicalTimeZone(zone);
    if (canonical === null) {
      ctx.addIssue({ code: 'custom', message: 'Unknown time zone' });
      return z.NEVER;
    }
    return canonical;
  });

export const publicationSchema = z.object({
  id: z.uuid(),
  postId: z.uuid(),
  /** The approved post revision that will be sent. */
  postRevision: revisionSchema,
  destinationId: z.uuid(),
  status: publicationStatusSchema,
  scheduledAt: z.iso.datetime(),
  timezone: z.string(),
  externalMessageId: z.string().optional(),
  lastErrorCode: z.string().optional(),
  revision: revisionSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});
export type PublicationDto = z.infer<typeof publicationSchema>;

// POST /api/v1/publications, header Idempotency-Key (required) → 202 PublicationDto
// (status 'scheduled' or 'queued'). 202 is NOT a claim that the post was sent.
// scheduledAt in the past (up to 5 min) means "send now"; later than 366 days ahead is refused.
// Errors: VALIDATION_ERROR 400 (details.reason SCHEDULE_OUT_OF_RANGE) or 413, NOT_FOUND 404
// (details.reason POST_NOT_FOUND | DESTINATION_NOT_FOUND), CONFLICT 409 (details.reason
// STALE_REVISION | POST_NOT_APPROVED | DESTINATION_DISABLED | IDEMPOTENCY_KEY_REUSED | IN_FLIGHT),
// UNAUTHORIZED 401, FORBIDDEN 403.
export const createPublicationInputSchema = z.strictObject({
  postId: z.uuid(),
  revision: revisionSchema,
  destinationId: z.uuid(),
  scheduledAt: z.iso.datetime(),
  timezone: timezoneSchema
});
export type CreatePublicationInput = z.infer<typeof createPublicationInputSchema>;

// POST /api/v1/publications/{id}/reschedule → 200 PublicationDto with revision + 1.
// Only before sending starts (scheduled, queued, retry_wait).
// Errors: VALIDATION_ERROR 400 (SCHEDULE_OUT_OF_RANGE) or 413, NOT_FOUND 404, CONFLICT 409
// (details.reason STALE_REVISION | NOT_RESCHEDULABLE), UNAUTHORIZED 401, FORBIDDEN 403.
export const reschedulePublicationInputSchema = z.strictObject({
  revision: revisionSchema,
  scheduledAt: z.iso.datetime(),
  timezone: timezoneSchema
});
export type ReschedulePublicationInput = z.infer<typeof reschedulePublicationInputSchema>;

// POST /api/v1/publications/{id}/cancel → 200 PublicationDto (status 'cancelled').
// Only before sending starts; a send in progress or with an unknown result is never cancelled here.
// Errors: VALIDATION_ERROR 400 or 413, NOT_FOUND 404, CONFLICT 409 (details.reason
// STALE_REVISION | NOT_CANCELLABLE), UNAUTHORIZED 401, FORBIDDEN 403.
export const cancelPublicationInputSchema = z.strictObject({
  revision: revisionSchema
});
export type CancelPublicationInput = z.infer<typeof cancelPublicationInputSchema>;

// GET /api/v1/publications?status&postId&destinationId&cursor&limit → 200 PublicationPageDto,
// latest scheduledAt first. GET /api/v1/publications/{id} → 200 PublicationDto or NOT_FOUND 404.
// Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403.
export const listPublicationsQuerySchema = pageQuerySchema.extend({
  status: publicationStatusSchema.optional(),
  postId: z.uuid().optional(),
  destinationId: z.uuid().optional()
});
export type ListPublicationsQuery = z.infer<typeof listPublicationsQuerySchema>;

export const publicationPageSchema = pageSchema(publicationSchema);
export type PublicationPageDto = z.infer<typeof publicationPageSchema>;
