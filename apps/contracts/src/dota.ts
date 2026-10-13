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

export const dotaUpdateParamsSchema = z.strictObject({
  sourceKey: dotaSourceKeySchema,
  externalId: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/)
});
export type DotaUpdateParams = z.infer<typeof dotaUpdateParamsSchema>;

export const dotaPatchParseStatusSchema = z.enum([
  'not_applicable',
  'pending',
  'complete',
  'incomplete',
  'no_recognized_facts',
  'unavailable'
]);

export const dotaPatchFactSchema = z.object({
  id: z.string().min(1).max(160),
  entityType: z.enum(['general', 'hero', 'item', 'neutral_item', 'neutral_creep']),
  entityName: z.string().min(1).max(200),
  section: z.enum(['general', 'hero', 'ability', 'talent', 'item', 'neutral_item', 'neutral_creep']),
  change: z.string().min(1).max(500),
  direction: z.enum(['increase', 'decrease', 'change', 'added']).optional(),
  before: z.string().max(40).optional(),
  after: z.string().max(40).optional()
});
export type DotaPatchFactDto = z.infer<typeof dotaPatchFactSchema>;

export const dotaEventDetailSchema = z.object({
  update: dotaUpdateSchema,
  parseStatus: dotaPatchParseStatusSchema,
  facts: z.array(dotaPatchFactSchema).max(500)
});
export type DotaEventDetailDto = z.infer<typeof dotaEventDetailSchema>;

// GET /api/v1/dota/updates/:sourceKey/:externalId -> 200 DotaEventDetailDto.
// Owner-only, read-only. Reads stored parser output and never fetches an upstream feed.
// Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403, NOT_FOUND 404, UNAVAILABLE 503.

// GET /api/v1/dota?source&limit -> 200 DotaIntelligenceDto. Owner-only, read-only. The two
// configured feeds remain visible even when never checked; updates are newest first and bounded.
// `health` is based on persisted attempt/success times and open incidents, not frontend guesses.
// Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403, UNAVAILABLE 503.
