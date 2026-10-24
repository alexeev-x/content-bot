import { z } from 'zod';
import { pageQuerySchema, pageSchema } from './pagination';
import { publicationStatusSchema } from './publications';

// Something a human has to look at: a send that failed for good, or one that may or may not have
// reached the channel. Written by Cron in the same batch as the job's state change.
export const incidentKindSchema = z.enum(['publish_failed', 'publish_unknown']);
export type IncidentKind = z.infer<typeof incidentKindSchema>;

export const incidentStateSchema = z.enum(['open', 'resolved']);
export type IncidentState = z.infer<typeof incidentStateSchema>;

export const INCIDENT_PAGE_LIMIT_DEFAULT = 25;
export const INCIDENT_PAGE_LIMIT_MAX = 50;
/** `openCount` never exceeds this: 99 means "99 or more". */
export const OPEN_INCIDENT_COUNT_CAP = 99;

/** The publication an incident is about, with what a row needs (no post body, never raw `details`). */
export const incidentPublicationSchema = z.object({
  id: z.uuid(),
  status: publicationStatusSchema,
  /** Truncated to 120 characters. */
  postTitle: z.string(),
  destinationName: z.string(),
  scheduledAt: z.iso.datetime()
});
export type IncidentPublicationDto = z.infer<typeof incidentPublicationSchema>;

export const incidentSchema = z.object({
  id: z.uuid(),
  kind: incidentKindSchema,
  /** Stable machine code, for example SEND_UNCONFIRMED or DESTINATION_UNAVAILABLE. */
  code: z.string(),
  /** When the incident was raised. */
  occurredAt: z.iso.datetime(),
  /** Absent while the incident is open. */
  resolvedAt: z.iso.datetime().optional(),
  /** Absent when the incident has no job. */
  jobId: z.uuid().optional(),
  /** Finished send attempts of the job. */
  attemptCount: z.number().int().nonnegative(),
  /** Absent only when the incident has no publication (never in normal operation). */
  publication: incidentPublicationSchema.optional()
});
export type IncidentDto = z.infer<typeof incidentSchema>;

// GET /api/v1/incidents?state&kind&cursor&limit → 200 IncidentPageDto. `state` defaults to `open`.
// Open incidents come newest first by `occurredAt`, resolved ones by `resolvedAt` (most recently closed first);
// the cursor is opaque. `limit` defaults to 25, at most 50. `openCount` is the number of open incidents
// (all kinds, regardless of the filters), capped at 99, for the sidebar badge.
// Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403.
export const listIncidentsQuerySchema = pageQuerySchema.extend({
  state: incidentStateSchema.default('open'),
  kind: incidentKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(INCIDENT_PAGE_LIMIT_MAX).default(INCIDENT_PAGE_LIMIT_DEFAULT)
});
export type ListIncidentsQuery = z.infer<typeof listIncidentsQuerySchema>;

export const incidentPageSchema = pageSchema(incidentSchema).extend({
  openCount: z.number().int().min(0).max(OPEN_INCIDENT_COUNT_CAP)
});
export type IncidentPageDto = z.infer<typeof incidentPageSchema>;

// POST /api/v1/incidents/{id}/resolve (no body) → 200 IncidentDto with `resolvedAt`.
// Acknowledges a `publish_failed` incident: the owner has seen it. It changes nothing about the
// publication and never retries or republishes. Naturally idempotent: closing a closed incident is
// 200 with the same row, and exactly one audit row exists however often it is pressed.
// A `publish_unknown` incident is closed only by POST /publications/{id}/resolve-unknown.
// Errors: NOT_FOUND 404, CONFLICT 409 (details.reason USE_RESOLVE_UNKNOWN), UNAUTHORIZED 401, FORBIDDEN 403.
