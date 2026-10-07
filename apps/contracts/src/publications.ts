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
// STALE_REVISION | POST_NOT_APPROVED | POST_ARCHIVED | DESTINATION_DISABLED | IDEMPOTENCY_KEY_REUSED |
// IN_FLIGHT),
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

// Telegram message id as the owner reads it in the channel link (t.me/<channel>/<id>): a positive integer.
const telegramMessageIdSchema = z.string().regex(/^[1-9]\d{0,15}$/, { error: 'Telegram message id' });

// POST /api/v1/publications/{id}/resolve-unknown → 200 PublicationDto with revision + 1.
// Manual reconciliation of an `unknown` send, after the owner checked the channel; never automatic.
// - `sent`: the message is in the channel → status 'sent' with this externalMessageId.
// - `resend`: the message is not in the channel → status 'scheduled' at scheduledAt ('queued' when it is already due) (same range rules as create:
//   up to 5 min in the past means "send now", more than 366 days ahead is SCHEDULE_OUT_OF_RANGE).
// - `cancel`: the message is not in the channel and should not go out → status 'cancelled'.
// The revision guards a double press or two tabs: only the first answer applies, the second gets STALE_REVISION or
// NOT_UNKNOWN. Errors: VALIDATION_ERROR 400 (SCHEDULE_OUT_OF_RANGE) or 413, NOT_FOUND 404, CONFLICT 409
// (details.reason STALE_REVISION | NOT_UNKNOWN), UNAUTHORIZED 401, FORBIDDEN 403.
export const resolveUnknownPublicationInputSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ outcome: z.literal('sent'), revision: revisionSchema, externalMessageId: telegramMessageIdSchema }),
  z.strictObject({
    outcome: z.literal('resend'),
    revision: revisionSchema,
    scheduledAt: z.iso.datetime(),
    timezone: timezoneSchema
  }),
  z.strictObject({ outcome: z.literal('cancel'), revision: revisionSchema })
]);
export type ResolveUnknownPublicationInput = z.infer<typeof resolveUnknownPublicationInputSchema>;
export type ResolveUnknownOutcome = ResolveUnknownPublicationInput['outcome'];

// GET /api/v1/publications?status&postId&destinationId&cursor&limit → 200 PublicationPageDto,
// latest scheduledAt first. GET /api/v1/publications/{id} → 200 PublicationDto or NOT_FOUND 404.
// Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403.
export const listPublicationsQuerySchema = pageQuerySchema.extend({
  status: publicationStatusSchema.optional(),
  postId: z.uuid().optional(),
  destinationId: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  order: z.enum(['asc', 'desc']).default('desc')
});
export type ListPublicationsQuery = z.infer<typeof listPublicationsQuerySchema>;

export const publicationPageSchema = pageSchema(publicationSchema);
export type PublicationPageDto = z.infer<typeof publicationPageSchema>;
