import { z } from 'zod';

// DEV only, removed after the check before the release (owner, 23.10.2026): «Проверка автопостов» runs the newest
// announcement of each kind through the whole automatic way again, so the owner sees how the AI writes it and what
// picture it gets.

export const devRunKindSchema = z.enum(['patch', 'hotfix', 'news', 'treasure', 'event', 'treasure_follow_up']);
export type DevRunKind = z.infer<typeof devRunKindSchema>;

/** GET /api/v1/dev-runs → 200: the announcement each kind would run now, or null when DEV has none. */
export const devRunCandidatesSchema = z.object({
  items: z
    .array(
      z.object({
        kind: devRunKindSchema,
        externalId: z.string().max(100).nullable(),
        title: z.string().max(500).nullable(),
        publishedAt: z.iso.datetime().nullable()
      })
    )
    .max(6)
});
export type DevRunCandidatesDto = z.infer<typeof devRunCandidatesSchema>;

/**
 * POST /api/v1/dev-runs { kind } → 202: that announcement's earlier run is reset (its publication key included, so it
 * goes out again) and the automatic way starts: paid AI calls. Errors: FORBIDDEN 403 DEV_RUNS_OFF (not DEV),
 * NOT_FOUND 404 NO_EVENT, CONFLICT 409 AI_WRITING (still writing) or NO_TREASURE_PAGE (Liquipedia has no page yet),
 * UNAVAILABLE 503 NO_OWNER_CHAT or LIQUIPEDIA_UNAVAILABLE, RATE_LIMIT 429.
 */
export const startDevRunInputSchema = z.strictObject({ kind: devRunKindSchema });
export const startDevRunResponseSchema = z.object({
  kind: devRunKindSchema,
  externalId: z.string().max(100),
  title: z.string().max(500)
});
export type StartDevRunResponse = z.infer<typeof startDevRunResponseSchema>;
