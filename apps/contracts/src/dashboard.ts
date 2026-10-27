import { z } from 'zod';
import { publicationStatusSchema } from './publications';
import { postOriginSchema } from './post-origin';

/** The longest day the client may ask for: a 25-hour DST day plus slack. */
export const DASHBOARD_MAX_RANGE_MS = 48 * 60 * 60 * 1000;
export const DASHBOARD_ATTENTION_LIMIT = 5;
export const DASHBOARD_TODAY_LIMIT = 8;
export const DASHBOARD_UPCOMING_LIMIT = 5;
export const DASHBOARD_RECENT_SENT_LIMIT = 5;
/** `attentionTotal` never exceeds this: 99 means "99 or more". */
export const DASHBOARD_ATTENTION_TOTAL_CAP = 99;
/** `todayTotal` never exceeds this. */
export const DASHBOARD_TODAY_TOTAL_CAP = 100;

// GET /api/v1/dashboard?from&to → 200 DashboardDto.
// `from` (inclusive) and `to` (exclusive) are the UTC instants of the owner's "today" as the client
// computed them; the server never guesses the zone. They must be UTC datetimes, `to` after `from`
// and at most 48 hours apart. Read-only: one D1 batch, no post body, no incident `details`.
// Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403.
export const dashboardQuerySchema = z
  .strictObject({
    from: z.iso.datetime(),
    to: z.iso.datetime()
  })
  .refine(({ from, to }) => Date.parse(to) > Date.parse(from), { error: 'to must be after from' })
  .refine(({ from, to }) => Date.parse(to) - Date.parse(from) <= DASHBOARD_MAX_RANGE_MS, {
    error: 'The range must not exceed 48 hours'
  });
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

// stuck: a `scheduled`/`queued` publication more than 10 minutes past its time (a Cron or kill-switch symptom).
export const attentionKindSchema = z.enum(['unknown', 'failed', 'stuck']);
export type AttentionKind = z.infer<typeof attentionKindSchema>;

export const dashboardPublicationSchema = z.object({
  publicationId: z.uuid(),
  scheduledAt: z.iso.datetime(),
  status: publicationStatusSchema,
  /** Truncated to 120 characters. */
  postTitle: z.string(),
  destinationName: z.string(),
  /** Studio-only: who wrote the post (as `PostDto.origin`); null — the owner. */
  postOrigin: postOriginSchema.nullable().optional()
});
export type DashboardPublicationDto = z.infer<typeof dashboardPublicationSchema>;

export const dashboardSentSchema = dashboardPublicationSchema.extend({
  /** When the send was confirmed (the publication's `updatedAt`). */
  sentAt: z.iso.datetime(),
  /** `https://t.me/<username>/<messageId>`; only for a destination saved with a public `@username`. */
  messageUrl: z.string().optional()
});
export type DashboardSentDto = z.infer<typeof dashboardSentSchema>;

export const dashboardAttentionSchema = z.object({
  kind: attentionKindSchema,
  /** The publication fields are absent only for an incident without a publication (never in normal operation). */
  publicationId: z.uuid().optional(),
  /** Present for `unknown` and `failed`. */
  incidentId: z.uuid().optional(),
  code: z.string().optional(),
  postTitle: z.string().optional(),
  destinationName: z.string().optional(),
  scheduledAt: z.iso.datetime().optional(),
  /** Incident time for `unknown`/`failed`; the missed `scheduledAt` for `stuck`. */
  occurredAt: z.iso.datetime()
});
export type DashboardAttentionDto = z.infer<typeof dashboardAttentionSchema>;

export const dashboardSchema = z.object({
  /** At most 5: unknown first, then failed (newest first), then stuck (most overdue first). */
  attention: z.array(dashboardAttentionSchema).max(DASHBOARD_ATTENTION_LIMIT),
  /** Open incidents plus stuck publications, capped at 99. */
  attentionTotal: z.number().int().min(0).max(DASHBOARD_ATTENTION_TOTAL_CAP),
  /** Publications scheduled in [from, to), earliest first, at most 8; cancelled ones are not listed. */
  today: z.array(dashboardPublicationSchema).max(DASHBOARD_TODAY_LIMIT),
  /** How many publications are in the range (cancelled excluded), capped at 100. */
  todayTotal: z.number().int().min(0).max(DASHBOARD_TODAY_TOTAL_CAP),
  /** The next 5 `scheduled`/`queued`/`retry_wait` publications from `to` on. */
  upcoming: z.array(dashboardPublicationSchema).max(DASHBOARD_UPCOMING_LIMIT),
  /** The last 5 `sent` publications, latest scheduled first. */
  recentSent: z.array(dashboardSentSchema).max(DASHBOARD_RECENT_SENT_LIMIT),
  generatedAt: z.iso.datetime()
});
export type DashboardDto = z.infer<typeof dashboardSchema>;
