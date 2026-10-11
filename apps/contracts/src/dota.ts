import { z } from 'zod';

export const dotaSourceKeySchema = z.enum(['steam_news', 'patch_notes']);
export type DotaSourceKey = z.infer<typeof dotaSourceKeySchema>;

export const dotaSourceHealthSchema = z.enum(['healthy', 'stale', 'unverified', 'degraded']);
export type DotaSourceHealth = z.infer<typeof dotaSourceHealthSchema>;

export const dotaSourceSchema = z.object({
  key: dotaSourceKeySchema,
  name: z.string(),
  officialUrl: z.url(),
  lastAttemptAt: z.iso.datetime().nullable(),
  lastSuccessAt: z.iso.datetime().nullable(),
  health: dotaSourceHealthSchema,
  openIncident: z
    .object({
      code: z.string(),
      occurredAt: z.iso.datetime(),
      externalId: z.string().optional()
    })
    .optional()
});
export type DotaSourceDto = z.infer<typeof dotaSourceSchema>;

export const dotaUpdateSchema = z.object({
  id: z.string(),
  sourceKey: dotaSourceKeySchema,
  type: z.enum(['news', 'patch']),
  title: z.string(),
  sourceUrl: z.url(),
  publishedAt: z.iso.datetime(),
  detectedAt: z.iso.datetime(),
  isBaseline: z.boolean(),
  linkedDraft: z
    .object({
      id: z.uuid(),
      title: z.string()
    })
    .optional()
});
export type DotaUpdateDto = z.infer<typeof dotaUpdateSchema>;

export const listDotaIntelligenceQuerySchema = z.strictObject({
  source: dotaSourceKeySchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});
export type ListDotaIntelligenceQuery = z.infer<typeof listDotaIntelligenceQuerySchema>;

export const dotaIntelligenceSchema = z.object({
  sources: z.array(dotaSourceSchema).length(2),
  updates: z.array(dotaUpdateSchema)
});
export type DotaIntelligenceDto = z.infer<typeof dotaIntelligenceSchema>;

// GET /api/v1/dota?source&limit -> 200 DotaIntelligenceDto. Owner-only, read-only. The two
// configured feeds remain visible even when never checked; updates are newest first and bounded.
// `health` is based on persisted attempt/success times and open incidents, not frontend guesses.
// Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403, UNAVAILABLE 503.
