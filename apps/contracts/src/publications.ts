import { z } from 'zod';
import { postMediaSchema } from './media';
import { postOriginSchema } from './post-origin';
import { postEntitySchema } from './post-entities';
import {
  CURSOR_XOR_PAGE_ISSUE,
  cursorXorPage,
  offsetPageFields,
  offsetPageQuerySchema,
  pageSchema
} from './pagination';

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
  /** Every Telegram message ID from a successful send; `externalMessageId` remains the first for compatibility. */
  externalMessageIds: z
    .array(z.string().regex(/^[1-9]\d{0,15}$/))
    .min(1)
    .max(10)
    .optional(),
  lastErrorCode: z.string().optional(),
  revision: revisionSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /**
   * True once the owner deleted the post. The publication stays as history («Пост удалён»): the post can no
   * longer be opened or edited, so `postSnapshot` carries what was sent. The server always sends the flag.
   */
  postDeleted: z.boolean().optional(),
  /**
   * Studio-only: the post came from an approved AI draft or the automatic publishing (as `PostDto.origin`); null —
   * the owner wrote it.
   */
  postOrigin: postOriginSchema.nullable().optional(),
  /**
   * The series this publication belongs to (owner, 22.10.2026: posts of one event go out in order with a gap);
   * null for a single publication. `waitingForPrevious`: the previous post has not gone out yet, so this one waits
   * whatever its time says.
   */
  series: z
    .object({
      id: z.uuid(),
      position: z.number().int().min(1).max(10),
      total: z.number().int().min(1).max(10),
      waitingForPrevious: z.boolean()
    })
    .nullable()
    .optional(),
  /** The sent revision, only with `postDeleted`; a media file removed by retention is missing from `media`. */
  postSnapshot: z
    .object({
      title: z.string(),
      body: z.string(),
      entities: z.array(postEntitySchema),
      media: z.array(postMediaSchema).max(10)
    })
    .optional()
});
export type PublicationDto = z.infer<typeof publicationSchema>;

// POST /api/v1/publications, header Idempotency-Key (required) → 202 PublicationDto
// (status 'scheduled' or 'queued'). 202 is NOT a claim that the post was sent.
// scheduledAt in the past (up to 5 min) means "send now"; later than 366 days ahead is refused.
// Errors: VALIDATION_ERROR 400 (details.reason SCHEDULE_OUT_OF_RANGE) or 413, NOT_FOUND 404
// (details.reason POST_NOT_FOUND | DESTINATION_NOT_FOUND), CONFLICT 409 (details.reason
// STALE_REVISION | POST_NOT_APPROVED | POST_ARCHIVED | MEDIA_PENDING | DESTINATION_DISABLED | IDEMPOTENCY_KEY_REUSED |
// IN_FLIGHT | ALREADY_PUBLISHED: the same post is already scheduled, queued, being sent or unknown for this
// destination; after a sent one it may be published again),
// UNAUTHORIZED 401, FORBIDDEN 403.
export const createPublicationInputSchema = z.strictObject({
  postId: z.uuid(),
  revision: revisionSchema,
  destinationId: z.uuid(),
  scheduledAt: z.iso.datetime(),
  timezone: timezoneSchema
});
export type CreatePublicationInput = z.infer<typeof createPublicationInputSchema>;

// Each post costs reads and three writes of one request: five keep it under the Free plan's 50 queries (35 on success).
export const PUBLICATION_SERIES_MAX = 5;

// POST /api/v1/publications/series, header Idempotency-Key (required) → 202 PublicationSeriesDto: one publication per
// post, in this order, all to one destination. The first goes at `scheduledAt`; each next one only after the previous
// went out and no sooner than `intervalMinutes` after it and after its own planned time. A post that does not go out
// (failed, unknown) holds the later ones until the owner resolves it; cancelling one cancels the later ones.
// Errors: as POST /api/v1/publications for any of its posts (the whole series is written or none of it), plus
// VALIDATION_ERROR 400 for a post listed twice.
export const createPublicationSeriesInputSchema = z.strictObject({
  items: z
    .array(z.strictObject({ postId: z.uuid(), revision: revisionSchema }))
    .min(2)
    .max(PUBLICATION_SERIES_MAX),
  destinationId: z.uuid(),
  scheduledAt: z.iso.datetime(),
  timezone: timezoneSchema,
  intervalMinutes: z.number().int().min(5).max(1440)
});
export type CreatePublicationSeriesInput = z.infer<typeof createPublicationSeriesInputSchema>;

export const publicationSeriesSchema = z.object({
  seriesId: z.uuid(),
  /** In series order. */
  publications: z.array(publicationSchema).min(2).max(PUBLICATION_SERIES_MAX)
});
export type PublicationSeriesDto = z.infer<typeof publicationSeriesSchema>;

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

export const publicationDeleteRefusalSchema = z.enum([
  'NOT_FOUND',
  'STALE_REVISION',
  'NOT_FINAL',
  'PUBLICATION_IN_PROGRESS',
  'PUBLICATION_UNKNOWN'
]);
export type PublicationDeleteRefusal = z.infer<typeof publicationDeleteRefusalSchema>;

export const deletePublicationInputSchema = z.strictObject({ revision: revisionSchema });
export type DeletePublicationInput = z.infer<typeof deletePublicationInputSchema>;

const publicationDeleteItemSchema = z.strictObject({ id: z.uuid(), revision: revisionSchema });
export const bulkDeletePublicationsInputSchema = z.strictObject({
  items: z
    .array(publicationDeleteItemSchema)
    .min(1)
    .max(100)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length, { error: 'DUPLICATE_IDS' })
});
export type BulkDeletePublicationsInput = z.infer<typeof bulkDeletePublicationsInputSchema>;

const publicationDeleteItemResultSchema = z.discriminatedUnion('outcome', [
  z.object({ id: z.uuid(), outcome: z.literal('deleted') }),
  z.object({ id: z.uuid(), outcome: z.literal('refused'), reason: publicationDeleteRefusalSchema })
]);
export const deletePublicationResultSchema = publicationDeleteItemResultSchema;
export type DeletePublicationResultDto = z.infer<typeof deletePublicationResultSchema>;
export const bulkDeletePublicationsResultSchema = z.object({ items: z.array(publicationDeleteItemResultSchema) });
export type BulkDeletePublicationsResultDto = z.infer<typeof bulkDeletePublicationsResultSchema>;

// POST /api/v1/publications/{id}/delete → one final publication record removed; Telegram messages remain.
// Bulk POST /api/v1/publications/delete → one result per item (1..100). Only sent, failed and cancelled are final.
// Bulk errors: VALIDATION_ERROR 400 (DUPLICATE_IDS); single errors: NOT_FOUND 404; CONFLICT 409
// (STALE_REVISION | NOT_FINAL | PUBLICATION_IN_PROGRESS | PUBLICATION_UNKNOWN).
// UNAUTHORIZED 401, FORBIDDEN 403.

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
  z
    .strictObject({
      outcome: z.literal('sent'),
      revision: revisionSchema,
      externalMessageId: telegramMessageIdSchema.optional(),
      externalMessageIds: z.array(telegramMessageIdSchema).min(1).max(10).optional()
    })
    .refine(
      (input) =>
        (input.externalMessageId !== undefined || input.externalMessageIds !== undefined) &&
        !(input.externalMessageId !== undefined && input.externalMessageIds !== undefined),
      { error: 'Provide externalMessageId or externalMessageIds, but not both' }
    ),
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

// GET /api/v1/publications?status|statusGroup&postId&destinationId&q&from&to&order&cursor|page&limit → 200 PublicationPageDto,
// latest scheduledAt first. totalCount reflects every supplied filter. statusCounts reflects all nine statuses
// after applying postId/destinationId/q/from/to but deliberately ignores `status`/`statusGroup`, so tabs can show counts.
// statusGroup=errors returns failed + unknown and cannot be combined with status.
// GET /api/v1/publications/{id} → 200 PublicationDto or NOT_FOUND 404.
// Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403.
export const listPublicationsQuerySchema = offsetPageQuerySchema
  .extend({
    status: publicationStatusSchema.optional(),
    /** A server-side grouping for the operator's Errors tab. Mutually exclusive with status. */
    statusGroup: z.enum(['errors']).optional(),
    postId: z.uuid().optional(),
    destinationId: z.uuid().optional(),
    q: z.string().trim().min(1).max(200).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    order: z.enum(['asc', 'desc']).default('desc')
  })
  .refine((query) => query.status === undefined || query.statusGroup === undefined, {
    error: 'Use either status or statusGroup, not both',
    path: ['statusGroup']
  })
  .refine(cursorXorPage, CURSOR_XOR_PAGE_ISSUE);
export type ListPublicationsQuery = z.infer<typeof listPublicationsQuerySchema>;

export const publicationStatusCountsSchema = z.object({
  scheduled: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  preparing: z.number().int().nonnegative(),
  sending: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  retry_wait: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative()
});
export type PublicationStatusCounts = z.infer<typeof publicationStatusCountsSchema>;

export const publicationPageSchema = pageSchema(publicationSchema).extend({
  ...offsetPageFields,
  statusCounts: publicationStatusCountsSchema
});
export type PublicationPageDto = z.infer<typeof publicationPageSchema>;

// GET /api/v1/publications/{id}/history → 200 PublicationHistoryDto; 404 NOT_FOUND for an unknown id.
// Oldest first, at most PUBLICATION_HISTORY_LIMIT events: owner actions from the audit log and the send attempts.
// `scheduledAt` is the plan the event set (absent on events recorded before it was stored).
export const PUBLICATION_HISTORY_LIMIT = 100;

export const publicationAttemptOutcomeSchema = z.enum([
  'sent',
  'rate_limited',
  'rejected',
  'unknown',
  'skipped',
  'lease_expired'
]);
export type PublicationAttemptOutcome = z.infer<typeof publicationAttemptOutcomeSchema>;

export const publicationHistoryEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('created'), at: z.iso.datetime(), scheduledAt: z.iso.datetime().optional() }),
  z.object({ kind: z.literal('rescheduled'), at: z.iso.datetime(), scheduledAt: z.iso.datetime().optional() }),
  z.object({ kind: z.literal('cancelled'), at: z.iso.datetime() }),
  z.object({
    kind: z.literal('resolved'),
    at: z.iso.datetime(),
    outcome: z.enum(['sent', 'resend', 'cancel']),
    scheduledAt: z.iso.datetime().optional()
  }),
  z.object({
    kind: z.literal('attempt'),
    at: z.iso.datetime(),
    attempt: z.number().int().min(1),
    outcome: publicationAttemptOutcomeSchema,
    errorCode: z.string().min(1).max(64).nullable(),
    retryAfterSeconds: z.number().int().nonnegative().nullable()
  })
]);
export type PublicationHistoryEvent = z.infer<typeof publicationHistoryEventSchema>;

export const publicationHistorySchema = z.object({
  items: z.array(publicationHistoryEventSchema).max(PUBLICATION_HISTORY_LIMIT)
});
export type PublicationHistoryDto = z.infer<typeof publicationHistorySchema>;
