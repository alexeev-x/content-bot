import { z } from 'zod';
import { dotaPatchFactSchema, dotaSourceKeySchema } from './dota';

export const dotaWatchableEntityTypeSchema = z.enum(['hero', 'item']);
export type DotaWatchableEntityType = z.infer<typeof dotaWatchableEntityTypeSchema>;

export const dotaWatchlistSchema = z.object({
  id: z.uuid(),
  entityType: dotaWatchableEntityTypeSchema,
  entityName: z.string().min(1).max(200),
  createdAt: z.iso.datetime(),
  lastMatchedUpdate: z
    .object({
      id: z.string().min(1).max(160),
      title: z.string().min(1).max(500),
      detectedAt: z.iso.datetime()
    })
    .nullable()
});
export type DotaWatchlistDto = z.infer<typeof dotaWatchlistSchema>;

export const dotaWatchlistAlertStatusSchema = z.enum(['pending', 'sending', 'sent', 'failed', 'unknown', 'disabled']);
export type DotaWatchlistAlertStatus = z.infer<typeof dotaWatchlistAlertStatusSchema>;

export const dotaWatchMatchSchema = z.object({
  id: z.uuid(),
  watchId: z.uuid(),
  entityType: dotaWatchableEntityTypeSchema,
  entityName: z.string().min(1).max(200),
  update: z.object({
    id: z.string().min(1).max(160),
    sourceKey: dotaSourceKeySchema,
    externalId: z.string().min(1).max(100),
    title: z.string().min(1).max(500),
    sourceUrl: z.url(),
    publishedAt: z.iso.datetime(),
    detectedAt: z.iso.datetime(),
    linkedDraft: z.object({ id: z.uuid(), title: z.string().min(1).max(500) }).optional()
  }),
  fact: dotaPatchFactSchema,
  alertStatus: dotaWatchlistAlertStatusSchema,
  alertErrorCode: z.string().max(80).optional()
});
export type DotaWatchMatchDto = z.infer<typeof dotaWatchMatchSchema>;

export const dotaWatchlistsSchema = z.object({
  watches: z.array(dotaWatchlistSchema).max(100),
  matches: z.array(dotaWatchMatchSchema).max(100)
});
export type DotaWatchlistsDto = z.infer<typeof dotaWatchlistsSchema>;

export const addDotaWatchlistInputSchema = z.strictObject({
  sourceKey: z.literal('patch_notes'),
  externalId: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/),
  factId: z.string().trim().min(1).max(160)
});
export type AddDotaWatchlistInput = z.infer<typeof addDotaWatchlistInputSchema>;

export const addDotaWatchlistResponseSchema = z.object({
  watch: dotaWatchlistSchema,
  created: z.boolean()
});
export type AddDotaWatchlistResponse = z.infer<typeof addDotaWatchlistResponseSchema>;

// GET /api/v1/dota/watchlists -> 200 DotaWatchlistsDto; owner-only, persisted reads only.
// POST /api/v1/dota/watchlists, Idempotency-Key -> 201 when created or 200 when already active.
// The server derives entity identity from the referenced confirmed patch fact; repeated entity adds
// return the active watch. Same idempotency key + payload replays; key reuse with a different payload
// returns 409 CONFLICT (IDEMPOTENCY_KEY_REUSED); a request with the same key still in progress
// returns 409 CONFLICT (IN_FLIGHT). A missing key or unsupported fact returns 400
// VALIDATION_ERROR.
// DELETE /api/v1/dota/watchlists/:watchId -> 204, idempotent including an already-absent watch.
// All endpoints are owner-only. Errors: VALIDATION_ERROR 400, CONFLICT 409, UNAUTHORIZED 401,
// FORBIDDEN 403, and UNAVAILABLE 503. Reads are safe to retry; alert sends are never retried.
