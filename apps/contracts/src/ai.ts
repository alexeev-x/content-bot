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
  /**
   * Stage 5: one cheap-model call per video at 72 h adds up to two hypotheses and one next test to its review. Off
   * (the default, owner decision pending): reviews stay facts and the same-format comparison only, and no request is made.
   */
  videoReviews: z.boolean().default(false),
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

/** How the writer did over the last 30 days (docs/ai/architecture.md item 15): never a model's self-score. */
/** Parts of an AI draft the owner can change before approval (docs/ai/architecture.md, item 4). */
export const AI_CHANGED_PARTS = ['hook', 'ending', 'length', 'structure', 'swearing', 'ai_wording'] as const;
export type AiChangedPart = (typeof AI_CHANGED_PARTS)[number];

/** The owner's reasons for a verdict on a draft (migration 0067); recorded only, never a rule by themselves. */
export const AI_FEEDBACK_KINDS = [
  'topic_repeated',
  'weak_hook',
  'joke_missed',
  'not_my_style',
  'too_long',
  'fact_wrong',
  'missed_task'
] as const;
export type AiFeedbackKind = (typeof AI_FEEDBACK_KINDS)[number];

/** Approvals each period needs before two periods are compared (stage 7: no uplift from a handful of texts). */
export const AI_QUALITY_MIN_APPROVED = 10;

/** One writer format over the quality period (stage 7, docs/ai/architecture.md item 15). */
export const aiFormatQualitySchema = z.object({
  format: z.enum(['fidit', 'igrat', 'standalone', 'telegram']),
  drafts: z.number().int().nonnegative(),
  questions: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  approvedUnchanged: z.number().int().nonnegative(),
  averageEditRatio: z.number().min(0).max(1).nullable(),
  /** Share of tagged approvals where the owner rewrote the hook / the ending; null without tagged approvals. */
  hookChangedShare: z.number().min(0).max(1).nullable(),
  endingChangedShare: z.number().min(0).max(1).nullable(),
  jokeMissed: z.number().int().nonnegative(),
  /** Median minutes from the first draft to its approval; null without approvals. */
  medianMinutesToApproval: z.number().nonnegative().nullable()
});
export type AiFormatQualityDto = z.infer<typeof aiFormatQualitySchema>;

export const aiQualitySchema = z.object({
  days: z.number().int().positive(),
  /**
   * First drafts written (ready, with a text), their rewrites («Короче», «Смешнее», «Ещё вариант») and failed
   * calls. A request for facts is not a draft: it is counted in `questions`, so «approved of drafts» stays honest.
   */
  drafts: z.number().int().nonnegative(),
  rewrites: z.number().int().nonnegative(),
  /** Answers that asked the owner for facts or offered ideas instead of a text. */
  questions: z.number().int().nonnegative().optional(),
  /**
   * Drafts written from the studio (control runs). Only the bot's drafts can be approved, so every other count
   * here is the bot's alone and these never enter a share.
   */
  studioDrafts: z.number().int().nonnegative().optional(),
  failed: z.number().int().nonnegative(),
  /** Drafts and rewrites whose code checks found something. */
  withWarnings: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  /** Approved with at most 5 % of the words changed. */
  approvedUnchanged: z.number().int().nonnegative(),
  /** Mean share of words the owner changed before approving, 0–1; null without approvals. */
  averageEditRatio: z.number().min(0).max(1).nullable(),
  jokeMissed: z.number().int().nonnegative(),
  /** The owner's verdicts by reason over the period, most given first. */
  feedback: z
    .array(z.object({ kind: z.enum(AI_FEEDBACK_KINDS), count: z.number().int().positive() }))
    .max(AI_FEEDBACK_KINDS.length)
    .optional(),
  /** Mean cost of a priced first draft; null without one. */
  averageDraftUsd: z.number().nonnegative().nullable(),
  /**
   * Which parts the owner changes before approving (tagged by code, migration 0061): the share of tagged
   * approvals that changed each part, most changed first; empty without tagged approvals.
   */
  changedParts: z
    .array(z.object({ part: z.enum(AI_CHANGED_PARTS), share: z.number().min(0).max(1) }))
    .max(AI_CHANGED_PARTS.length),
  /** Stage 7: the same period by format (the bot's drafts only), every writer format present, zeros included. */
  byFormat: z.array(aiFormatQualitySchema).max(4).optional(),
  /**
   * Stage 7: the previous period of the same length, for a comparison the owner can trust. `comparable` is true only
   * when both periods have at least AI_QUALITY_MIN_APPROVED approvals; otherwise the UI says there is too little to
   * compare and shows no direction. Never a cause, only the two numbers.
   */
  previous: z
    .object({
      approved: z.number().int().nonnegative(),
      averageEditRatio: z.number().min(0).max(1).nullable(),
      comparable: z.boolean()
    })
    .optional()
});
export type AiQualityDto = z.infer<typeof aiQualitySchema>;

// GET /api/v1/ai → 200 AiOverviewDto. Read-only, a few bounded reads.
export const aiOverviewSchema = z.object({
  settings: aiSettingsSchema,
  connection: aiConnectionSchema,
  spend: aiSpendSchema,
  catalog: aiCatalogSchema,
  quality: aiQualitySchema
});
export type AiOverviewDto = z.infer<typeof aiOverviewSchema>;

// POST /api/v1/ai/check (no body) → 200 AiOverviewDto: one tiny request to the cheap (or draft) model; the
// result and its cost are recorded. errors: UNAVAILABLE 503 (details.reason: NO_KEY | NO_MODEL | DISABLED |
// NO_PRICE | BUDGET), RATE_LIMIT 429 (a few checks per 10 minutes), UNAUTHORIZED, FORBIDDEN. A provider failure is not an error: it is the check's result.

export const AI_WRITER_FORMATS = ['fidit', 'igrat', 'standalone', 'telegram'] as const;
export const aiWriterFormatSchema = z.enum(AI_WRITER_FORMATS);

// POST /api/v1/ai/drafts { format, mode, task } → 200 AiDraftResultDto: one draft written from the studio
// (stored as AI_DRAFT, never publishable without approval). Not idempotent: every call is a paid request.
// errors: VALIDATION_ERROR 400, UNAVAILABLE 503 (details.reason as for /check), RATE_LIMIT 429 (20 per 10
// minutes), UNAUTHORIZED, FORBIDDEN. A provider failure is not an error: status «failed» with its code.
export const createAiDraftInputSchema = z.strictObject({
  format: aiWriterFormatSchema,
  mode: z.enum(['direct', 'automatic']),
  task: z.string().trim().min(1).max(4000),
  /** Reels example ids kept out of the prompt, so a control run compares the draft with an unseen original. */
  holdOut: z
    .array(z.string().regex(/^[a-z0-9-]{1,80}$/))
    .max(20)
    .optional()
});
export type CreateAiDraftInput = z.infer<typeof createAiDraftInputSchema>;

export const aiDraftResultSchema = z.object({
  generationId: z.uuid(),
  /**
   * `ready` — a full draft (text, hooks) to edit and approve; `needs_facts` — the model asks for the owner's
   * experience (`question`, maybe `ideas`), there is no draft and it can never be approved (CONFLICT NOT_A_DRAFT);
   * `failed` — a provider failure or an answer of the wrong shape (`errorCode`, e.g. AI_BAD_FORMAT).
   */
  status: z.enum(['ready', 'needs_facts', 'failed']),
  errorCode: z.string().max(80).nullable(),
  model: z.string().nullable(),
  hooks: z.array(z.string()).max(3),
  text: z.string().nullable(),
  question: z.string().max(1000).nullable(),
  /** Up to 3 topic ideas offered with the question («придумай сам» in a format that needs real experience). */
  ideas: z.array(z.string().max(160)).max(3),
  /** Code-check findings, stable codes (writer-checks.ts). */
  warnings: z.array(z.string()).max(30)
});
export type AiDraftResultDto = z.infer<typeof aiDraftResultSchema>;

// POST /api/v1/ai/improve → 200 AiImproveResultDto: a suggestion for a fragment of the post being edited (the
// selection or the whole text, as the editor's HTML: p, strong, em, u, s, code, pre, blockquote, a, span
// data-spoiler). Saves nothing and sends nothing: the owner applies a variant in the editor, which then saves
// through PATCH /posts/{id} under its revision. Each call is paid; not idempotent. Errors: VALIDATION_ERROR 400,
// UNAVAILABLE 503 (details.reason NO_KEY, DISABLED, NO_MODEL, NO_PRICE, BUDGET), RATE_LIMIT 429, UNAUTHORIZED,
// FORBIDDEN. A provider failure is `status: failed` with its code, not an HTTP error.
export const AI_IMPROVE_ACTIONS = ['improve', 'shorter', 'funnier', 'fix', 'variants', 'custom'] as const;
export const aiImproveActionSchema = z.enum(AI_IMPROVE_ACTIONS);
export type AiImproveAction = z.infer<typeof aiImproveActionSchema>;
/** Room for a full 4096-character post with its tags. */
export const AI_IMPROVE_HTML_MAX = 16_000;

export const aiImproveInputSchema = z
  .strictObject({
    action: aiImproveActionSchema,
    scope: z.enum(['selection', 'all']),
    html: z.string().trim().min(1).max(AI_IMPROVE_HTML_MAX),
    /** The owner's own wish; required for `custom`, an extra note otherwise. */
    instruction: z.string().trim().max(300).optional()
  })
  .refine((input) => input.action !== 'custom' || (input.instruction ?? '') !== '', {
    path: ['instruction'],
    message: 'A custom request needs an instruction'
  });
export type AiImproveInput = z.infer<typeof aiImproveInputSchema>;

export const aiImproveResultSchema = z.object({
  /**
   * `ready` — 1 to 3 variants (3 for `variants`); `needs_facts` — the model asks the owner something instead
   * (`question`), there is nothing to apply; `failed` — a provider failure or a wrong-shaped answer (`errorCode`).
   */
  status: z.enum(['ready', 'needs_facts', 'failed']),
  errorCode: z.string().max(80).nullable(),
  model: z.string().nullable(),
  variants: z.array(z.strictObject({ html: z.string().max(AI_IMPROVE_HTML_MAX), note: z.string().max(200) })).max(3),
  question: z.string().max(1000).nullable()
});
export type AiImproveResultDto = z.infer<typeof aiImproveResultSchema>;

/** An approved Reels script of the AI editor (architecture item 3): what a published video can be linked to. */
export const aiReelsScriptSchema = z.object({
  revisionId: z.uuid(),
  format: z.enum(['fidit', 'igrat', 'standalone']),
  /** The start of the approved text, at most 200 characters. */
  excerpt: z.string().max(200),
  approvedAt: z.iso.datetime()
});
export type AiReelsScriptDto = z.infer<typeof aiReelsScriptSchema>;

// GET /api/v1/ai/scripts/{itemId} → 200 AiItemScriptDto: the script a YouTube or TikTok video is linked to,
// or up to 3 candidates (approved Reels scripts approved in the 14 days before the video, closest title first).
// A Telegram post has no candidates (its link is the post itself, PostDto.origin).
// PUT /api/v1/ai/scripts/{itemId} { revisionId } → 200 AiItemScriptDto: the owner confirms the link; repeating
// it or choosing another script replaces it (one script per video; one script may serve several videos).
// DELETE /api/v1/ai/scripts/{itemId} → 200 AiItemScriptDto with `linked: null`; repeating it is a no-op.
// Errors: VALIDATION_ERROR 400 (bad id; PUT on a Telegram post, details.reason NOT_A_VIDEO), NOT_FOUND 404
// (no such video or approved Reels script), UNAUTHORIZED 401, FORBIDDEN 403.
// The whole way of a linked script, from the task to the videos, so a
// review reads the exact approved text and where it came from. Only stored facts; nothing is re-generated.
export const AI_CHAIN_TEXT_MAX = 4000;
export const AI_CHAIN_TASK_MAX = 300;
/**
 * Why a link may be a mistake: the script was approved after the video went out (`approved_after_video`), or more
 * than 14 days before it (`approved_long_before`). Shown to the owner; the link stays until they change it.
 */
export const aiChainWarningSchema = z.enum(['approved_after_video', 'approved_long_before']);
export type AiChainWarning = z.infer<typeof aiChainWarningSchema>;
export const aiScriptChainSchema = z.object({
  /** The owner's task as it was sent (cut to AI_CHAIN_TASK_MAX). */
  task: z.string().max(AI_CHAIN_TASK_MAX),
  /** The model that wrote the first draft, and the hash of the pack it was written with. */
  model: z.string().max(80).nullable(),
  packRevision: z.string().max(40).nullable(),
  /** The first AI draft of this script, before any of the owner's edits; null when none was stored. */
  draft: z.string().max(AI_CHAIN_TEXT_MAX).nullable(),
  /** The approved text, in full (cut to AI_CHAIN_TEXT_MAX). */
  approved: z.string().max(AI_CHAIN_TEXT_MAX),
  /** Share of the draft's words the owner changed, and what was changed (empty when nothing was). */
  editRatio: z.number().min(0).max(1).nullable(),
  changedParts: z.array(z.enum(AI_CHANGED_PARTS)),
  draftedAt: z.iso.datetime(),
  /** The other videos filmed from the same script (`<platform>:<external id>`), this one excluded. */
  otherItems: z.array(z.string().min(3).max(160)).max(10),
  warnings: z.array(aiChainWarningSchema)
});
export type AiScriptChainDto = z.infer<typeof aiScriptChainSchema>;

export const aiItemScriptSchema = z.object({
  linked: aiReelsScriptSchema.nullable(),
  candidates: z.array(aiReelsScriptSchema).max(3),
  /** Set with `linked` (stage 4): the way from the task to this video. Absent from responses of older servers. */
  chain: aiScriptChainSchema.nullable().default(null)
});
export type AiItemScriptDto = z.infer<typeof aiItemScriptSchema>;

export const linkAiScriptInputSchema = z.strictObject({ revisionId: z.uuid() });
export type LinkAiScriptInput = z.infer<typeof linkAiScriptInputSchema>;

/** What the owner tells the editor about themselves («ИИ-редактор → Обо мне»); sent with every request. */
export const aiAuthorFieldsSchema = z.strictObject({
  /** Dota Friend ID (Steam account id), for the daily read of rank and heroes from OpenDota. */
  dotaAccountId: z
    .string()
    .regex(/^\d{1,12}$/)
    .nullable(),
  hours: z.number().int().min(0).max(100_000).nullable(),
  learningHeroes: z.array(z.string().trim().min(1).max(40)).max(10),
  /** What the owner does not understand in the game yet («тайминги Рошана, стаки»). */
  unknownAspects: z.string().max(1000),
  /** Current experiments of the rubrics. */
  experiments: z.string().max(1000),
  /** Temporary context: streams, giveaways, a CTA of the week. */
  notes: z.string().max(1000)
});
export type AiAuthorFields = z.infer<typeof aiAuthorFieldsSchema>;

export const aiAuthorDotaSchema = z.object({
  /** OpenDota rank tier (tens: medal 1–8, units: stars); null when hidden or unranked. */
  rankTier: z.number().int().min(0).max(99).nullable(),
  /** «Герой 2», «Легенда 5»; null without a rank. */
  rankLabel: z.string().max(40).nullable(),
  plus: z.boolean(),
  /** False when «Expose Public Match Data» is off in Dota: no matches, wins or heroes are visible. */
  publicMatchData: z.boolean(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  topHeroes: z
    .array(
      z.object({
        id: z.number().int().positive(),
        name: z.string().max(60),
        games: z.number().int().nonnegative(),
        winRate: z.number().min(0).max(1)
      })
    )
    .max(5),
  fetchedAt: z.iso.datetime()
});
export type AiAuthorDotaDto = z.infer<typeof aiAuthorDotaSchema>;

export const aiAuthorProfileSchema = aiAuthorFieldsSchema.extend({
  dota: aiAuthorDotaSchema.nullable(),
  /** 0 before the first save (the seed from docs/ai/pack/state.md). */
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime().nullable(),
  /** Exactly what the editor reads with every request, built from the fields and the Dota read. */
  promptText: z.string().max(8000)
});
export type AiAuthorProfileDto = z.infer<typeof aiAuthorProfileSchema>;

// GET /api/v1/ai/profile → 200 AiAuthorProfileDto.
// PUT /api/v1/ai/profile { revision, ...fields } → 200 AiAuthorProfileDto; CONFLICT 409 (STALE_REVISION).
// POST /api/v1/ai/profile/dota AiDotaSnapshotInput → 200 AiAuthorProfileDto: stores a read of OpenDota made by
// the studio in the owner's browser (OpenDota answers 429 to Cloudflare's shared egress, 16.10.2026); the server
// adds the rank label and the time. CONFLICT 409 (details.reason NO_ACCOUNT), RATE_LIMIT 429 (10 per 10 minutes).
// errors also: VALIDATION_ERROR 400, UNAUTHORIZED, FORBIDDEN.
export const aiDotaSnapshotInputSchema = z.strictObject({
  rankTier: z.number().int().min(0).max(99).nullable(),
  plus: z.boolean(),
  publicMatchData: z.boolean(),
  wins: z.number().int().min(0).max(1_000_000),
  losses: z.number().int().min(0).max(1_000_000),
  topHeroes: z
    .array(
      z.strictObject({
        id: z.number().int().positive().max(1000),
        name: z.string().trim().min(1).max(60),
        games: z.number().int().min(0).max(1_000_000),
        winRate: z.number().min(0).max(1)
      })
    )
    .max(5)
});
export type AiDotaSnapshotInput = z.infer<typeof aiDotaSnapshotInputSchema>;

export const updateAiAuthorProfileInputSchema = aiAuthorFieldsSchema.extend({
  revision: z.number().int().nonnegative()
});
export type UpdateAiAuthorProfileInput = z.infer<typeof updateAiAuthorProfileInputSchema>;

// GET /api/v1/ai/feedback → 200 AiFeedbackListDto: the owner's newest recorded verdicts («Что не так?» in the bot),
// at most AI_FEEDBACK_LIST_LIMIT, each with the draft's format and the start of its task and of the judged text.
// DELETE /api/v1/ai/feedback/{id} → 204: the owner takes a verdict back; a verdict already gone is a no-op.
// Errors: VALIDATION_ERROR 400 (id), UNAUTHORIZED 401, FORBIDDEN 403.
export const AI_FEEDBACK_LIST_LIMIT = 30;
export const AI_FEEDBACK_EXCERPT = 160;
export const AI_FEEDBACK_NOTE_MAX = 500;
export const aiFeedbackSchema = z.object({
  id: z.uuid(),
  kind: z.enum(AI_FEEDBACK_KINDS),
  format: aiWriterFormatSchema,
  task: z.string().max(AI_FEEDBACK_EXCERPT),
  /** The start of the judged text; null for a verdict recorded before migration 0067. */
  text: z.string().max(AI_FEEDBACK_EXCERPT).nullable(),
  /** The owner's own words on the verdict, written in the bot right after the reason (migration 0071); null — none. */
  note: z.string().max(AI_FEEDBACK_NOTE_MAX).nullable().default(null),
  createdAt: z.iso.datetime()
});
export type AiFeedbackDto = z.infer<typeof aiFeedbackSchema>;
export const aiFeedbackListSchema = z.object({ items: z.array(aiFeedbackSchema).max(AI_FEEDBACK_LIST_LIMIT) });
export type AiFeedbackListDto = z.infer<typeof aiFeedbackListSchema>;
export const aiFeedbackParamsSchema = z.strictObject({ id: z.uuid() });

// What the writer learns from: the texts that can go into a prompt as the
// owner's examples, newest first, and whether the owner took one out. Two sources:
// - `revision`: an approved AI draft the owner changed noticeably (an unchanged approval is never one, and a draft
//   the owner gave a «Что не так?» verdict is not shown here: a disliked text is not an example);
// - `post`: a Telegram post the owner wrote himself in the studio and approved (no AI draft behind it).
// GET /api/v1/ai/learning → 200 AiLearningListDto, at most AI_LEARNING_LIST_LIMIT items.
// PUT /api/v1/ai/learning/{source}/{id} { excluded } → 200 AiLearningItemDto: «Не учиться на этом» / back;
// repeating it is a no-op. Errors: VALIDATION_ERROR 400, NOT_FOUND 404 (not an eligible text), UNAUTHORIZED 401,
// FORBIDDEN 403.
export const AI_LEARNING_LIST_LIMIT = 40;
export const AI_LEARNING_EXCERPT = 240;
export const aiLearningSourceSchema = z.enum(['revision', 'post']);
export type AiLearningSource = z.infer<typeof aiLearningSourceSchema>;
export const aiLearningItemSchema = z.object({
  source: aiLearningSourceSchema,
  id: z.uuid(),
  format: aiWriterFormatSchema,
  /** The start of the text as it would go into the prompt. */
  excerpt: z.string().max(AI_LEARNING_EXCERPT),
  /** What the owner changed in the AI draft (empty for a post written by the owner). */
  changedParts: z.array(z.enum(AI_CHANGED_PARTS)),
  /** Share of the AI draft's words the owner changed; null for a post written by the owner. */
  editRatio: z.number().min(0).max(1).nullable(),
  /** True: the owner took it out, it never goes into a prompt. */
  excluded: z.boolean(),
  createdAt: z.iso.datetime()
});
export type AiLearningItemDto = z.infer<typeof aiLearningItemSchema>;
export const aiLearningListSchema = z.object({ items: z.array(aiLearningItemSchema).max(AI_LEARNING_LIST_LIMIT) });
export type AiLearningListDto = z.infer<typeof aiLearningListSchema>;
export const aiLearningParamsSchema = z.strictObject({ source: aiLearningSourceSchema, id: z.uuid() });
export const setAiLearningExcludedInputSchema = z.strictObject({ excluded: z.boolean() });
export type SetAiLearningExcludedInput = z.infer<typeof setAiLearningExcludedInputSchema>;

// GET /api/v1/ai/scripts/unlinked → 200 AiUnlinkedScriptsDto (stage 4): approved Reels scripts of the last
// AI_UNLINKED_DAYS days that no video is linked to yet, newest first — filmed but not linked, or not filmed.
// Errors: UNAUTHORIZED 401, FORBIDDEN 403.
export const AI_UNLINKED_DAYS = 60;
export const AI_UNLINKED_LIMIT = 30;
export const aiUnlinkedScriptsSchema = z.object({
  items: z.array(aiReelsScriptSchema).max(AI_UNLINKED_LIMIT)
});
export type AiUnlinkedScriptsDto = z.infer<typeof aiUnlinkedScriptsSchema>;

// Architecture items 11–13: a review of a YouTube/TikTok video once it is
// 72 hours old. Facts are the measured numbers, the observation compares them with the same-format curve, hypotheses
// say «возможно» and never become a rule by themselves. Built by Cron, once per video; nothing is re-generated on read.
// GET /api/v1/ai/reviews/{itemId} → 200 AiVideoReviewResultDto: `review` null while the video is younger than
// AI_REVIEW_AGE_HOURS, older than AI_REVIEW_MAX_AGE_DAYS when reviews began, or not a video.
// Errors: VALIDATION_ERROR 400 (bad id), UNAUTHORIZED 401, FORBIDDEN 403.
export const AI_REVIEW_AGE_HOURS = 72;
export const AI_REVIEW_MAX_AGE_DAYS = 30;
export const AI_REVIEW_TEXT_MAX = 300;
/**
 * Why a review has no hypotheses: no linked script to judge (`no_script`), the same-format curve rests on fewer than
 * 5 videos (`weak_baseline`), no snapshot at 72 h (`no_snapshot`), the owner marked the video distorted
 * (`contaminated`), reviews by the model are off (`reviews_off`), the budget or cap stopped the call (`budget`), or
 * the model failed or answered in the wrong shape (`model_failed`).
 */
export const aiReviewLimitSchema = z.enum([
  'no_script',
  'weak_baseline',
  'no_snapshot',
  'contaminated',
  'reviews_off',
  'budget',
  'model_failed'
]);
export type AiReviewLimit = z.infer<typeof aiReviewLimitSchema>;
export const aiVideoReviewSchema = z.object({
  itemId: z.string().min(3).max(160),
  /** `pending`: due and waiting for the next Cron tick; `ready`: with hypotheses; `limited`: facts only. */
  status: z.enum(['pending', 'ready', 'limited']),
  limitedReason: aiReviewLimitSchema.nullable(),
  facts: z.object({
    /** Views at the 72 h checkpoint; null when that snapshot is missing. */
    views: z.number().int().nonnegative().nullable(),
    /** The latest counters the platform gives, per 1 000 views; null where the platform has none. */
    likesPer1000: z.number().nonnegative().nullable(),
    commentsPer1000: z.number().nonnegative().nullable(),
    sharesPer1000: z.number().nonnegative().nullable()
  }),
  observation: z.object({
    /** The video's format, or null when it was compared with the whole platform (a weak comparison). */
    format: z.enum(['fidit', 'igrat', 'standalone']).nullable(),
    baselineViews: z.number().int().nonnegative().nullable(),
    baselineItems: z.number().int().nonnegative(),
    low: z.number().int().nonnegative().nullable(),
    high: z.number().int().nonnegative().nullable(),
    /** Against the middle half of the curve at 72 h; null without a curve or a snapshot. */
    position: z.enum(['above', 'within', 'below']).nullable()
  }),
  hypotheses: z.array(z.string().max(AI_REVIEW_TEXT_MAX)).max(2),
  nextTest: z.string().max(AI_REVIEW_TEXT_MAX).nullable(),
  model: z.string().max(80).nullable(),
  costUsd: z.number().nonnegative().nullable(),
  createdAt: z.iso.datetime()
});
export type AiVideoReviewDto = z.infer<typeof aiVideoReviewSchema>;
export const aiVideoReviewResultSchema = z.object({ review: aiVideoReviewSchema.nullable() });
export type AiVideoReviewResultDto = z.infer<typeof aiVideoReviewResultSchema>;

// The analyst's hypotheses in the studio (owner, 20.10.2026; migration 0086): raised by the daily report's review,
// weighed every Monday; a supported writing one is asked in the bot and becomes a rule only on «Учитывать».
// GET /api/v1/ai/hypotheses → 200 AiHypothesesDto, at most AI_HYPOTHESES_LIST_LIMIT, newest change first.
// Read-only. Errors: UNAUTHORIZED 401, FORBIDDEN 403.
export const AI_HYPOTHESES_LIST_LIMIT = 50;
export const aiHypothesisSchema = z.object({
  /** Shown as H<code>, the number the reports cite. */
  code: z.number().int().positive(),
  text: z.string().min(1).max(300),
  scope: aiWriterFormatSchema,
  /** `writing`: how a text is written (can become a rule); `topic`: what to film or post. */
  kind: z.enum(['writing', 'topic']),
  status: z.enum(['open', 'supported', 'refuted']),
  confidence: z.enum(['low', 'medium']),
  /** The last review's reason, with its numbers; null before the first Monday. */
  note: z.string().max(300).nullable(),
  /** A supported writing hypothesis put to the owner as «Учитывать?». */
  asked: z.boolean(),
  updatedAt: z.iso.datetime()
});
export type AiHypothesisDto = z.infer<typeof aiHypothesisSchema>;
export const aiHypothesesSchema = z.object({ items: z.array(aiHypothesisSchema).max(AI_HYPOTHESES_LIST_LIMIT) });
export type AiHypothesesDto = z.infer<typeof aiHypothesesSchema>;

// The writer's rules in the studio (AI plan P8, §6.1; migration 0079): the owner's rules from «/rule» and the
// analysis rules from the weekly consolidation, with the videos behind each. In use, closed rules last.
// GET /api/v1/ai/rules → 200 AiRulesDto, at most AI_RULES_LIST_LIMIT rules, each with at most
// AI_RULE_EVIDENCE_LIMIT evidence rows (newest first).
// PUT /api/v1/ai/rules/{id} { action } → 200 AiRuleDto. `disable`: off for good for an analysis rule, off until
// `enable` for an owner rule; `enable`: an owner rule back on; `approve`: a supported analysis rule into prompts
// (the bot's «Учитывать»). Repeating the state it already has is a no-op. Errors: VALIDATION_ERROR 400, NOT_FOUND
// 404, CONFLICT 409 with details.reason LIMIT (15 rules in use) or STATE (the rule cannot take that action:
// a closed analysis rule, a candidate, a scope never picked), UNAUTHORIZED 401, FORBIDDEN 403.
// DELETE /api/v1/ai/rules/{id}/evidence/{key} → 200 AiRuleDto: a wrong observation removed and the status counted
// again (MEM-13); an approved rule that falls out of supported loses its approval. NOT_FOUND 404 when either is
// unknown; only analysis rules have evidence.
export const AI_RULES_LIST_LIMIT = 60;
export const AI_RULE_EVIDENCE_LIMIT = 30;
export const AI_RULE_TEXT_MAX = 300;
export const aiRuleScopeSchema = z.enum(['all', ...AI_WRITER_FORMATS]);
export const aiRuleStatusSchema = z.enum([
  'pending_scope',
  'active',
  'candidate',
  'supported',
  'strong',
  'disabled',
  'deprecated'
]);
export const aiRuleEvidenceSchema = z.object({
  /** `script:<approved revision id>`: one script, whatever platforms its video went to. */
  key: z.string().min(1).max(300),
  polarity: z.enum(['support', 'contradict']),
  /** True: measured before the rule existed, so it never counts as the fresh support a rule needs. */
  origin: z.boolean(),
  /** The start of the approved script; null when it is no longer stored. */
  scriptExcerpt: z.string().max(AI_LEARNING_EXCERPT).nullable(),
  createdAt: z.iso.datetime()
});
export type AiRuleEvidenceDto = z.infer<typeof aiRuleEvidenceSchema>;
export const aiRuleSchema = z.object({
  id: z.uuid(),
  text: z.string().min(1).max(AI_RULE_TEXT_MAX),
  scope: aiRuleScopeSchema,
  source: z.enum(['owner', 'analysis']),
  status: aiRuleStatusSchema,
  /** True: the writer's prompts of its scope get it now. */
  inUse: z.boolean(),
  approvedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  supports: z.number().int().nonnegative(),
  contradicts: z.number().int().nonnegative(),
  evidence: z.array(aiRuleEvidenceSchema).max(AI_RULE_EVIDENCE_LIMIT)
});
export type AiRuleDto = z.infer<typeof aiRuleSchema>;
export const aiRulesSchema = z.object({
  items: z.array(aiRuleSchema).max(AI_RULES_LIST_LIMIT),
  /** At most this many rules are in use at once. */
  inUseMax: z.number().int().positive()
});
export type AiRulesDto = z.infer<typeof aiRulesSchema>;
export const aiRuleParamsSchema = z.strictObject({ id: z.uuid() });
export const aiRuleEvidenceParamsSchema = z.strictObject({ id: z.uuid(), key: z.string().min(1).max(300) });
export const changeAiRuleInputSchema = z.strictObject({ action: z.enum(['enable', 'disable', 'approve']) });
export type ChangeAiRuleInput = z.infer<typeof changeAiRuleInputSchema>;

// The history of AI drafts in the studio (AI plan P8; SYS-01): every first draft from the bot or the studio with
// the versions that hang off it (rewrites, fixes, the draft after a facts answer), their texts with provenance
// and the owner's verdicts. Read-only.
// GET /api/v1/ai/drafts?q&source&format&outcome&sort&dir&page → 200 AiDraftsPageDto, AI_DRAFTS_PAGE a page (owner,
// 20.10.2026: a table like Посты). `source` defaults to the bot: on DEV 133 of 147 drafts were studio control runs.
// Source and format are matched in SQL; of the newest AI_DRAFTS_SCAN matches the task search (any case, Cyrillic
// too), `outcome` and the sort apply, so `capped` says when older drafts were left out. Errors: VALIDATION_ERROR 400,
// UNAUTHORIZED 401, FORBIDDEN 403.
// GET /api/v1/ai/drafts/{id} → 200 AiDraftChainDto. NOT_FOUND 404 when `id` is not a first draft.
export const AI_DRAFTS_PAGE = 20;
export const AI_DRAFT_CHAIN_MAX = 31;
export const AI_DRAFT_TEXTS_MAX = 60;
export const aiTextProvenanceSchema = z.enum(['AI_DRAFT', 'OWNER_EDITED', 'OWNER_APPROVED', 'OWNER_PREAPPROVED']);
export const aiDraftSummarySchema = z.object({
  id: z.uuid(),
  format: aiWriterFormatSchema,
  source: z.enum(['bot', 'studio']),
  /** The start of the owner's task. */
  task: z.string().max(300),
  createdAt: z.iso.datetime(),
  /** The first draft and every version after it. */
  versions: z.number().int().positive(),
  approved: z.boolean(),
  /** The owner wrote their own version of a text. */
  edited: z.boolean(),
  feedbackCount: z.number().int().nonnegative(),
  /** The recorded cost of every model call of the chain; null when none was priced. */
  costUsd: z.number().nonnegative().nullable()
});
export type AiDraftSummaryDto = z.infer<typeof aiDraftSummarySchema>;
/** Drafts read per request before `outcome` and the sort apply; older ones are left out and `capped` is true. */
export const AI_DRAFTS_SCAN = 1000;
export const aiDraftsQuerySchema = z.strictObject({
  /** Words of the task, case-insensitive. */
  q: z.string().trim().max(100).optional(),
  source: z.enum(['bot', 'studio', 'all']).default('bot'),
  format: aiWriterFormatSchema.optional(),
  /** `approved`: approved as is or with edits; `edited`: approved with the owner's edits; `open`: not approved. */
  outcome: z.enum(['approved', 'edited', 'open', 'feedback']).optional(),
  sort: z.enum(['date', 'cost', 'versions']).default('date'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(1000).default(1)
});
export type AiDraftsQuery = z.infer<typeof aiDraftsQuerySchema>;
export const aiDraftsPageSchema = z.object({
  items: z.array(aiDraftSummarySchema).max(AI_DRAFTS_PAGE),
  page: z.number().int().positive(),
  totalCount: z.number().int().nonnegative(),
  capped: z.boolean()
});
export type AiDraftsPageDto = z.infer<typeof aiDraftsPageSchema>;
export const aiDraftTextSchema = z.object({
  id: z.uuid(),
  provenance: aiTextProvenanceSchema,
  text: z.string().min(1).max(8000),
  /** Share of the AI draft's words the owner changed, on an approval. */
  editRatio: z.number().min(0).max(1).nullable(),
  /** The studio post an approved Telegram text became. */
  postId: z.string().nullable(),
  createdAt: z.iso.datetime()
});
export type AiDraftTextDto = z.infer<typeof aiDraftTextSchema>;
export const aiDraftVersionSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  kind: z.enum(['draft', 'rewrite']),
  status: z.enum(['pending', 'ready', 'failed']),
  /** `needs_facts`: the editor asked a question instead of writing. */
  result: z.enum(['draft', 'needs_facts']).nullable(),
  question: z.string().max(1000).nullable(),
  errorCode: z.string().max(100).nullable(),
  model: z.string().max(100).nullable(),
  costUsd: z.number().nonnegative().nullable(),
  createdAt: z.iso.datetime(),
  texts: z.array(aiDraftTextSchema).max(AI_DRAFT_TEXTS_MAX),
  feedback: z
    .array(
      // The bot counts a note's 500 characters by code point; an emoji is two UTF-16 units here.
      z.object({ kind: z.string().max(40), note: z.string().max(1000).nullable(), createdAt: z.iso.datetime() })
    )
    .max(50)
});
export type AiDraftVersionDto = z.infer<typeof aiDraftVersionSchema>;
export const aiDraftChainSchema = z.object({
  draft: aiDraftSummarySchema,
  versions: z.array(aiDraftVersionSchema).max(AI_DRAFT_CHAIN_MAX),
  /** True: the chain has more versions or texts than shown (the newest texts are kept). */
  truncated: z.boolean()
});
export type AiDraftChainDto = z.infer<typeof aiDraftChainSchema>;
export const aiDraftParamsSchema = z.strictObject({ id: z.uuid() });
