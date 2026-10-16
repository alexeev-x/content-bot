import { z } from 'zod';

// The AI writer's settings, connection and spend (docs/API_CONTRACTS.md § AI). One provider port on the server;
// OpenAI is the first adapter. The key is a Worker secret and never crosses the API.

export const AI_PROVIDERS = ['openai'] as const;
export const aiProviderSchema = z.enum(AI_PROVIDERS);
export type AiProvider = z.infer<typeof aiProviderSchema>;
export const AI_USAGE_KINDS = ['check', 'draft', 'rewrite', 'review', 'profile', 'other'] as const;
export const aiUsageKindSchema = z.enum(AI_USAGE_KINDS);
export type AiUsageKind = z.infer<typeof aiUsageKindSchema>;

/** A model ID as the provider takes it, e.g. `gpt-5-mini`. */
export const aiModelIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/);
const usd = z.number().min(0).max(10_000);

/** USD per 1 000 000 tokens, as on the provider's pricing page. */
export const aiModelPriceSchema = z.object({
  model: aiModelIdSchema,
  inputPerMillion: usd,
  cachedInputPerMillion: usd,
  outputPerMillion: usd
});
export type AiModelPriceDto = z.infer<typeof aiModelPriceSchema>;

export const aiCatalogModelSchema = z.object({
  id: aiModelIdSchema,
  label: z.string().min(1).max(60),
  /** One line in the owner's words: what it is good for and how it compares. */
  note: z.string().max(200),
  roles: z
    .array(z.enum(['draft', 'cheap']))
    .min(1)
    .max(2),
  recommendedFor: z.enum(['draft', 'cheap']).nullable(),
  inputPerMillion: usd,
  cachedInputPerMillion: usd,
  outputPerMillion: usd
});
export type AiCatalogModelDto = z.infer<typeof aiCatalogModelSchema>;

/** The provider's models the owner picks from, with the provider's prices. */
export const aiCatalogSchema = z.object({
  provider: aiProviderSchema,
  providerLabel: z.string(),
  /** When the prices were read from the provider's pricing page (YYYY-MM-DD). */
  pricesCheckedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  models: z.array(aiCatalogModelSchema).max(30)
});
export type AiCatalogDto = z.infer<typeof aiCatalogSchema>;

const settingsFields = {
  provider: aiProviderSchema,
  /** Off: no request is made, whatever else is set. */
  enabled: z.boolean(),
  /** Writes drafts; null until chosen. */
  draftModel: aiModelIdSchema.nullable(),
  /** Checks, tags, classification. */
  cheapModel: aiModelIdSchema.nullable(),
  /** The owner's own prices; a model without one uses the catalog's price. */
  prices: z.array(aiModelPriceSchema).max(10),
  monthlyBudgetUsd: usd,
  dailyCapUsd: usd,
  /** The bot warns once a month when spend passes this share of the monthly budget. */
  warnAtPercent: z.number().int().min(10).max(99)
};

// PUT /api/v1/ai/settings { revision, ...settings } → 200 AiOverviewDto.
// A chosen model must have a price (catalog or own), or the save is VALIDATION_ERROR with details.reason
// NO_PRICE: its requests would never count against the budget.
// errors: VALIDATION_ERROR 400, CONFLICT 409 (details.reason STALE_REVISION), UNAUTHORIZED, FORBIDDEN
export const updateAiSettingsInputSchema = z
  .strictObject({ revision: z.number().int().nonnegative(), ...settingsFields })
  .refine((value) => new Set(value.prices.map((price) => price.model)).size === value.prices.length, {
    message: 'One price per model',
    path: ['prices']
  });
export type UpdateAiSettingsInput = z.infer<typeof updateAiSettingsInputSchema>;

export const aiSettingsSchema = z.object({
  ...settingsFields,
  /** 0 before the first save (defaults). */
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime().nullable()
});
export type AiSettingsDto = z.infer<typeof aiSettingsSchema>;

export const aiSpendSchema = z.object({
  /** The owner-zone month, YYYY-MM. */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  spentUsd: z.number().nonnegative(),
  todayUsd: z.number().nonnegative(),
  /** Budget minus spent, never below zero. */
  leftUsd: z.number().nonnegative(),
  requests: z.number().int().nonnegative(),
  /** Average cost of a priced request this month; null without one. */
  averageUsd: z.number().nonnegative().nullable(),
  /** Requests whose model had no price: their cost is unknown and not in spentUsd. */
  unpricedRequests: z.number().int().nonnegative(),
  byKind: z.array(
    z.object({ kind: aiUsageKindSchema, requests: z.number().int().nonnegative(), spentUsd: z.number().nonnegative() })
  ),
  /** What stops a new request now: null when nothing does. */
  blockedBy: z.enum(['disabled', 'no_key', 'no_model', 'no_price', 'monthly_budget', 'daily_cap']).nullable()
});
export type AiSpendDto = z.infer<typeof aiSpendSchema>;

export const aiConnectionSchema = z.object({
  provider: aiProviderSchema,
  /** Whether the Worker has the provider's key (the key itself is never returned). */
  keyConfigured: z.boolean(),
  /** The secret's name the owner sets, e.g. OPENAI_API_KEY. */
  keyName: z.string(),
  lastCheck: z
    .object({
      at: z.iso.datetime(),
      ok: z.boolean(),
      model: z.string().nullable(),
      errorCode: z.string().max(80).nullable()
    })
    .nullable()
});
export type AiConnectionDto = z.infer<typeof aiConnectionSchema>;

// GET /api/v1/ai → 200 AiOverviewDto. Read-only, a few bounded reads.
export const aiOverviewSchema = z.object({
  settings: aiSettingsSchema,
  connection: aiConnectionSchema,
  spend: aiSpendSchema,
  catalog: aiCatalogSchema
});
export type AiOverviewDto = z.infer<typeof aiOverviewSchema>;

// POST /api/v1/ai/check (no body) → 200 AiOverviewDto: one tiny request to the cheap (or draft) model; the
// result and its cost are recorded. errors: UNAVAILABLE 503 (details.reason: NO_KEY | NO_MODEL | DISABLED |
// NO_PRICE | BUDGET), RATE_LIMIT 429 (a few checks per 10 minutes), UNAUTHORIZED, FORBIDDEN. A provider failure is not an error: it is the check's result.
