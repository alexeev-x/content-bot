import { z } from 'zod';

export const dotaHeroBracketSchema = z.enum(['1', '2', '3', '4', '5', '6', '7', '8']);
export type DotaHeroBracket = z.infer<typeof dotaHeroBracketSchema>;

const heroCountSchema = z.number().int().nonnegative().nullable();
export const dotaHeroStatisticSchema = z.object({
  heroId: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  ranked: z.record(dotaHeroBracketSchema, z.object({ picks: heroCountSchema, wins: heroCountSchema })),
  professional: z.object({ picks: heroCountSchema, wins: heroCountSchema, bans: heroCountSchema })
});
export type DotaHeroStatisticDto = z.infer<typeof dotaHeroStatisticSchema>;

export const dotaHeroStatisticsSnapshotSchema = z.object({
  observedAt: z.iso.datetime(),
  heroes: z.array(dotaHeroStatisticSchema).min(1).max(200)
});
export type DotaHeroStatisticsSnapshotDto = z.infer<typeof dotaHeroStatisticsSnapshotSchema>;

export const dotaHeroStatisticsHealthSchema = z.enum(['healthy', 'stale', 'unverified', 'degraded']);
export const dotaHeroStatisticsErrorSchema = z.enum([
  'DOTA_HERO_STATS_FETCH',
  'DOTA_HERO_STATS_HTTP',
  'DOTA_HERO_STATS_BODY_LIMIT',
  'DOTA_HERO_STATS_JSON',
  'DOTA_HERO_STATS_SHAPE'
]);

export const dotaHeroStatisticsSchema = z.object({
  source: z.object({ name: z.string(), url: z.url() }),
  health: dotaHeroStatisticsHealthSchema,
  lastAttemptAt: z.iso.datetime().nullable(),
  lastSuccessAt: z.iso.datetime().nullable(),
  lastErrorCode: dotaHeroStatisticsErrorSchema.nullable(),
  latest: dotaHeroStatisticsSnapshotSchema.nullable(),
  previous: dotaHeroStatisticsSnapshotSchema.nullable()
});
export type DotaHeroStatisticsDto = z.infer<typeof dotaHeroStatisticsSchema>;

// GET /api/v1/dota/hero-statistics -> 200 DotaHeroStatisticsDto. Owner-only, read-only; returns
// persisted OpenDota observations and their provenance, never fetches upstream during a request.
// Errors: UNAUTHORIZED 401, FORBIDDEN 403, UNAVAILABLE 503.
