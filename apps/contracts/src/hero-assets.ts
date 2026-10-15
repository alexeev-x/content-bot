import { z } from 'zod';

// Official Dota hero media mirrored from Valve's CDN into R2 (docs/API_CONTRACTS.md § Dota hero assets): the
// source material for AI posts and auto content. A Cron step copies a few files per idle tick.

export const HERO_ASSET_KINDS = ['render_webm', 'render_mov', 'render_png', 'portrait', 'icon', 'crop'] as const;
export const heroAssetKindSchema = z.enum(HERO_ASSET_KINDS);
export type HeroAssetKind = z.infer<typeof heroAssetKindSchema>;
export const heroAssetStatusSchema = z.enum(['pending', 'stored', 'missing', 'failed']);
export type HeroAssetStatus = z.infer<typeof heroAssetStatusSchema>;
/** Valve's internal hero name without `npc_dota_hero_`, e.g. `nevermore` for Shadow Fiend. */
export const heroSlugSchema = z.string().regex(/^[a-z0-9_]{1,40}$/);

export const heroAssetSchema = z.object({
  kind: heroAssetKindSchema,
  status: heroAssetStatusSchema,
  /** Bytes in R2; null until stored. */
  size: z.number().int().nonnegative().nullable(),
  /** Why the last attempt failed (a stable code such as HTTP_502); null when it did not. */
  errorCode: z.string().max(80).nullable()
});
export const dotaHeroSchema = z.object({
  slug: heroSlugSchema,
  id: z.number().int().nonnegative(),
  name: z.string().min(1).max(100),
  assets: z.array(heroAssetSchema).max(HERO_ASSET_KINDS.length)
});
export type DotaHeroDto = z.infer<typeof dotaHeroSchema>;

// GET /api/v1/dota/hero-assets → 200 DotaHeroAssetsDto: every hero (by name) with each file's state and the
// totals. Read-only, one bounded read. Empty until «Проверить у Valve» was pressed once.
export const dotaHeroAssetsSchema = z.object({
  total: z.number().int().nonnegative(),
  stored: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  heroes: z.array(dotaHeroSchema).max(300)
});
export type DotaHeroAssetsDto = z.infer<typeof dotaHeroAssetsSchema>;

// POST /api/v1/dota/hero-assets/refresh (no body) → 200 DotaHeroAssetsDto: «Проверить у Valve». Reads the hero
// list, adds new heroes and queues again the files Valve did not have; Cron then copies them. Safe to repeat.
// errors: UNAVAILABLE 503 (the hero list did not answer), UNAUTHORIZED, FORBIDDEN

// GET /api/v1/dota/hero-assets/{slug}/{kind} → private binary stream of a stored file (not a public R2 URL).
// errors: NOT_FOUND 404 (unknown or not stored yet), UNAVAILABLE 503 (no R2 binding), UNAUTHORIZED, FORBIDDEN
export const heroAssetParamsSchema = z.strictObject({ slug: heroSlugSchema, kind: heroAssetKindSchema });
