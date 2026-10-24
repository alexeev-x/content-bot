import { z } from 'zod';
import { pageQuerySchema, pageSchema } from './pagination';
import { cleanText } from './text';

// Audience and per-video counters of the owner's own channels, collected by the Worker
// (docs/API_CONTRACTS.md § Content analytics). Separate from publication analytics (analytics.ts),
// which reports the Studio's own send outcomes.

export const contentPlatformSchema = z.enum(['telegram', 'youtube', 'tiktok']);
export type ContentPlatform = z.infer<typeof contentPlatformSchema>;

// ok: the last collection succeeded. pending: configured, never collected yet.
// not_configured: the owner has not supplied the channel or the key. error: the last collection failed.
export const contentSourceStateSchema = z.enum(['ok', 'pending', 'not_configured', 'error']);
export type ContentSourceState = z.infer<typeof contentSourceStateSchema>;

export const CONTENT_ANALYTICS_RECENT_LIMIT = 8;
export const CONTENT_ANALYTICS_TOP_LIMIT = 5;
export const CONTENT_ANALYTICS_SERIES_DAYS = 30;
export const CONTENT_ITEM_SNAPSHOT_LIMIT = 200;

const countSchema = z.number().int().nonnegative();
const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const contentItemSchema = z.object({
  /** `<platform>:<external id>`, opaque to the client. */
  id: z.string().min(3).max(160),
  platform: contentPlatformSchema,
  /** First line of a post or the video title, at most 200 characters; may be empty for a media-only post. */
  title: z.string().max(200),
  url: z.url().max(2048),
  thumbnailUrl: z.url().max(2048).nullable(),
  publishedAt: z.iso.datetime(),
  /** Null when the platform does not expose the counter (Telegram previews show views only). */
  views: countSchema.nullable(),
  likes: countSchema.nullable(),
  comments: countSchema.nullable(),
  shares: countSchema.nullable(),
  observedAt: z.iso.datetime()
});
export type ContentItemDto = z.infer<typeof contentItemSchema>;

export const contentSourceSchema = z.object({
  platform: contentPlatformSchema,
  state: contentSourceStateSchema,
  /** Public handle without `@`, or the channel id; null while not configured. */
  handle: z.string().max(100).nullable(),
  profileUrl: z.url().max(2048).nullable(),
  followers: countSchema.nullable(),
  /** Followers now minus the closest stored day at least 7 days ago; null without that history. */
  followersChange7d: z.number().int().nullable(),
  /** Views of the items published in the last 7 days, as last observed. */
  views7d: countSchema.nullable(),
  items7d: countSchema,
  lastSyncedAt: z.iso.datetime().nullable(),
  /** Stable code of the last failed collection; null after a success. */
  errorCode: z.string().max(64).nullable(),
  /**
   * Account sign-in of an OAuth platform (TikTok): `available` — the owner can connect an account,
   * `connected` — one is connected and can be disconnected; `none` — no sign-in applies (Telegram,
   * YouTube) or the app keys are missing.
   */
  connection: z.enum(['none', 'available', 'connected'])
});
export type ContentSourceDto = z.infer<typeof contentSourceSchema>;

export const followersPointSchema = z.object({ day: dayKeySchema, followers: countSchema });
export type FollowersPointDto = z.infer<typeof followersPointSchema>;

// GET /api/v1/content-analytics → 200 ContentAnalyticsOverviewDto. Read-only, bounded.
// Errors: UNAUTHORIZED 401, FORBIDDEN 403, UNAVAILABLE 503.
// POST /api/v1/content-analytics/sync (no body) → 200 ContentAnalyticsOverviewDto after collecting
// every configured source that was not collected in the last 5 minutes. Safe to repeat: a source
// already collected recently, or claimed by a concurrent Cron tick, is skipped.
// Errors: UNAUTHORIZED 401, FORBIDDEN 403, UNAVAILABLE 503.
export const contentAnalyticsOverviewSchema = z.object({
  observedAt: z.iso.datetime(),
  /** Always the three platforms, in a fixed order: telegram, youtube, tiktok. */
  sources: z.array(contentSourceSchema).length(3),
  /** Daily follower counts per platform for the last 30 UTC days, oldest first; days without data are absent. */
  followers: z
    .array(z.object({ platform: contentPlatformSchema, points: z.array(followersPointSchema).max(31) }))
    .max(3),
  /** Newest first. */
  recent: z.array(contentItemSchema).max(CONTENT_ANALYTICS_RECENT_LIMIT),
  /** Most viewed among the items published in the last 30 days. */
  top: z.array(contentItemSchema).max(CONTENT_ANALYTICS_TOP_LIMIT)
});
export type ContentAnalyticsOverviewDto = z.infer<typeof contentAnalyticsOverviewSchema>;

// GET /api/v1/content-analytics/items?platform&cursor&limit → 200 PageDto<ContentItemDto>, newest first.
// Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403, UNAVAILABLE 503.
export const contentItemsQuerySchema = pageQuerySchema.extend({
  platform: contentPlatformSchema.optional()
});
export type ContentItemsQuery = z.infer<typeof contentItemsQuerySchema>;
export const contentItemsPageSchema = pageSchema(contentItemSchema);

export const contentItemSnapshotSchema = z.object({
  observedAt: z.iso.datetime(),
  views: countSchema.nullable(),
  likes: countSchema.nullable(),
  comments: countSchema.nullable(),
  shares: countSchema.nullable()
});
export type ContentItemSnapshotDto = z.infer<typeof contentItemSnapshotSchema>;

// GET /api/v1/content-analytics/items/:id → 200 ContentItemDetailDto. Snapshots are hourly while the
// item is younger than 72 hours, then daily; oldest first, at most 200.
// Errors: VALIDATION_ERROR 400, NOT_FOUND 404, UNAUTHORIZED 401, FORBIDDEN 403, UNAVAILABLE 503.
export const contentItemIdSchema = z.string().regex(/^(telegram|youtube|tiktok):[A-Za-z0-9_-]{1,140}$/);
/** Ages after publishing at which views are compared «на том же возрасте». */
export const CONTENT_CHECKPOINT_HOURS = [1, 3, 6, 12, 24, 48, 72] as const;

/**
 * The platform's usual curve: at each checkpoint, the median views of the items published in the last
 * 90 days that were tracked from their first hours, with how many items it rests on. A checkpoint with
 * fewer than 3 items is left out.
 */
/** The rubric of a Reels video, known once the owner links it to its AI script (docs/ai/architecture.md, item 1). */
export const contentVideoFormatSchema = z.enum(['fidit', 'igrat', 'standalone']);
export type ContentVideoFormat = z.infer<typeof contentVideoFormatSchema>;

export const contentBaselineSchema = z.object({
  platform: contentPlatformSchema,
  /**
   * Set when the curve rests on videos of this format only (at least 5 per checkpoint); absent or null — every
   * item of the platform, which for a video of a known format is a weak comparison.
   */
  format: contentVideoFormatSchema.nullable().optional(),
  points: z
    .array(
      z.object({
        ageHours: z.number().int().positive(),
        views: countSchema,
        items: z.number().int().min(3),
        /** The 25th and 75th percentiles: the «обычно» range around the median. */
        low: countSchema.optional(),
        high: countSchema.optional()
      })
    )
    .max(CONTENT_CHECKPOINT_HOURS.length)
});
export type ContentBaselineDto = z.infer<typeof contentBaselineSchema>;

/**
 * A confirmed factor outside the content that distorted an item's numbers (docs/ai/architecture.md item 12):
 * restricted recommendations, removed or unavailable, a platform incident, a broken or incomplete collection.
 * A weak result alone is never one.
 */
export const contentContaminationReasonSchema = z.enum([
  'restricted',
  'removed',
  'platform_incident',
  'collection_failure'
]);
export type ContentContaminationReason = z.infer<typeof contentContaminationReasonSchema>;

export const contentItemDetailSchema = z.object({
  item: contentItemSchema,
  snapshots: z.array(contentItemSnapshotSchema).max(CONTENT_ITEM_SNAPSHOT_LIMIT),
  /** The usual curve of the item's format when enough videos share it, else of its platform (itself excluded). */
  baseline: contentBaselineSchema,
  /** The video's format: from its linked script, else as the owner marked it; null — unknown (or a Telegram post). */
  format: contentVideoFormatSchema.nullable().optional(),
  /** Where `format` comes from: a linked script, an earlier manual mark, else the video's title; null for a post. */
  formatSource: z.enum(['script', 'owner', 'title']).nullable().optional(),
  /** Other tracked videos of that format, so the page can say how far the format curve is (5 needed). */
  formatItems: z.number().int().nonnegative().optional(),
  /** The owner's confirmation that the item's numbers are distorted; such an item is left out of every curve. */
  contamination: z.object({ reason: contentContaminationReasonSchema, setAt: z.iso.datetime() }).nullable().optional()
});
export type ContentItemDetailDto = z.infer<typeof contentItemDetailSchema>;

// PUT /api/v1/content-analytics/items/:id/format  body ContentItemFormatInput → 204 (replaces; safe to repeat).
// The owner's mark for a video filmed without an AI script (a linked script's format still wins); null clears it.
// Errors: VALIDATION_ERROR 400 (also for a Telegram post), NOT_FOUND 404, UNAUTHORIZED 401, FORBIDDEN 403.
export const contentItemFormatInputSchema = z.strictObject({ format: contentVideoFormatSchema.nullable() });

// PUT /api/v1/content-analytics/items/:id/contamination  body ContentItemContaminationInput → 204 (replaces; safe
// to repeat). The owner confirms why an item's numbers are distorted, on any platform; null clears it.
// Errors: VALIDATION_ERROR 400, NOT_FOUND 404, UNAUTHORIZED 401, FORBIDDEN 403.
export const contentItemContaminationInputSchema = z.strictObject({
  reason: contentContaminationReasonSchema.nullable()
});
export type ContentItemContaminationInput = z.infer<typeof contentItemContaminationInputSchema>;
export type ContentItemFormatInput = z.infer<typeof contentItemFormatInputSchema>;

// POST /api/v1/content-analytics/tiktok/connect (no body) → 200 { authorizeUrl }: the browser goes there to
// approve access on TikTok. Errors: UNAUTHORIZED 401, FORBIDDEN 403, UNAVAILABLE 503 (app keys not set).
// GET /api/v1/content-analytics/tiktok/callback?code&state|error — public: TikTok's redirect. Always answers
// 302 to `/analytics?platform=tiktok&tiktok=<result>` (also when rate-limited or failing). The state must match
// the HttpOnly cookie set by /connect in the same browser; a missing, foreign, reused or expired state never
// reaches TikTok.
// POST /api/v1/content-analytics/tiktok/disconnect (no body) → 204: forgets the tokens, revokes them at TikTok
// (best effort). Safe to repeat. Errors: UNAUTHORIZED 401, FORBIDDEN 403, UNAVAILABLE 503.
export const tiktokConnectSchema = z.object({
  authorizeUrl: z.url().max(4096).startsWith('https://www.tiktok.com/')
});
export type TikTokConnectDto = z.infer<typeof tiktokConnectSchema>;
export const tiktokConnectResultSchema = z.enum(['connected', 'denied', 'expired', 'failed']);
export type TikTokConnectResult = z.infer<typeof tiktokConnectResultSchema>;

export const CONTENT_REPORT_PERIODS = [7, 30, 90] as const;
export type ContentReportPeriod = (typeof CONTENT_REPORT_PERIODS)[number];
export const CONTENT_REPORT_ITEM_LIMIT = 1000;

// GET /api/v1/content-analytics/report?days=7|30|90 → 200 ContentReportDto. Everything the analytics
// page compares, in one bounded read: the items published in this period and the previous one of the
// same length (newest first) and the daily follower counts over both. Comparisons, medians and
// conclusions are computed by the client from these rows.
// Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403, UNAVAILABLE 503.
export const contentReportQuerySchema = z.strictObject({
  days: z.coerce
    .number()
    .int()
    .refine((days) => (CONTENT_REPORT_PERIODS as readonly number[]).includes(days), {
      error: 'days must be 7, 30 or 90'
    })
    .default(30)
});
export type ContentReportQuery = z.infer<typeof contentReportQuerySchema>;

export const contentReportSchema = z.object({
  /** Start of the period (inclusive) and now. */
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  /** Start of the previous period of the same length; it ends at `from`. */
  previousFrom: z.iso.datetime(),
  /** Items published since `previousFrom`, newest first. */
  items: z.array(contentItemSchema).max(CONTENT_REPORT_ITEM_LIMIT),
  /** True when more items existed than the limit; the oldest are left out. */
  truncated: z.boolean(),
  /** Daily follower counts since `previousFrom`, oldest first. */
  followers: z
    .array(z.object({ platform: contentPlatformSchema, points: z.array(followersPointSchema).max(200) }))
    .max(3),
  /** Usual curves per platform, for the «на том же возрасте» status of young items. */
  baselines: z.array(contentBaselineSchema).max(3),
  /**
   * Views gained per UTC day and platform since `previousFrom`, from the daily snapshots: the last reading
   * of each item that day minus its previous one (an item published that day counts from zero). History
   * starts with the first collection, so early days may be missing.
   */
  growth: z.array(z.object({ platform: contentPlatformSchema, day: dayKeySchema, views: countSchema })).max(3 * 200),
  /** Items of the last 90 days tracked from their first hours (they have «same age» readings): comparable curves. */
  tracked: z.array(z.string().min(3).max(160)).max(2000)
});
export type ContentReportDto = z.infer<typeof contentReportSchema>;

// Goals: a follower target per platform, with the pace of the last CONTENT_GOAL_PACE_DAYS days and the
// UTC day it is reached at that pace.
//   GET    /api/v1/content-analytics/goals            → 200 ContentGoalsDto
//   PUT    /api/v1/content-analytics/goals/:platform  body ContentGoalInput → 200 ContentGoalsDto (replaces; safe to repeat)
//   DELETE /api/v1/content-analytics/goals/:platform  → 200 ContentGoalsDto (safe to repeat)
// Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403.
export const CONTENT_GOAL_MAX_TARGET = 100_000_000;
export const CONTENT_GOAL_PACE_DAYS = 28;
export const contentGoalParamsSchema = z.strictObject({ platform: contentPlatformSchema });
export const contentGoalInputSchema = z.strictObject({
  target: z.number().int().min(1).max(CONTENT_GOAL_MAX_TARGET)
});
export type ContentGoalInput = z.infer<typeof contentGoalInputSchema>;
export const contentGoalSchema = z.object({
  platform: contentPlatformSchema,
  target: z.number().int().min(1).max(CONTENT_GOAL_MAX_TARGET),
  /** The latest stored follower count; null before the first collection. */
  followers: countSchema.nullable(),
  /** Followers gained per week over the pace window; null with less than 7 days of counts. */
  perWeek: z.number().nullable(),
  /** The UTC day the target is reached at that pace; null when reached, not growing or beyond 5 years. */
  forecastDay: dayKeySchema.nullable(),
  reached: z.boolean(),
  setAt: z.iso.datetime()
});
export type ContentGoalDto = z.infer<typeof contentGoalSchema>;
export const contentGoalsSchema = z.object({ goals: z.array(contentGoalSchema).max(3) });
export type ContentGoalsDto = z.infer<typeof contentGoalsSchema>;

// The history of the daily and Monday reports (AI plan P8; SYS-03, SYS-04). Owner-only, read-only.
// GET /api/v1/content-analytics/reports?cursor → 200 ContentReportsPageDto, released reports newest first,
// CONTENT_REPORTS_PAGE a page. Errors: VALIDATION_ERROR 400 (a bad cursor), UNAUTHORIZED 401, FORBIDDEN 403.
// GET /api/v1/content-analytics/reports/{id} → 200 ContentReportDetailDto: the text from the stored numbers and
// review (today's layout), and a daily report's forecasts with their scores. NOT_FOUND 404 for an unknown id or
// a report still waiting for its review.
export const CONTENT_REPORTS_PAGE = 20;
export const CONTENT_REPORT_TEXT_MAX = 20_000;
export const CONTENT_REPORT_HEADLINE_MAX = 300;
export const contentReportSummarySchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(['day', 'week']),
  asOf: z.iso.datetime(),
  timezone: z.string().min(1).max(100),
  status: z.enum(['reviewed', 'unreviewed']),
  /** Why the review is missing (AI_DISABLED, AI_BUDGET, REVIEW_TIMEOUT, AI_NUMBERS_UNVERIFIED…); null with it. */
  reviewError: z.string().max(100).nullable(),
  model: z.string().max(100).nullable(),
  /** The review's recorded cost; null without a model call, without a price or before migration 0080. */
  costUsd: z.number().nonnegative().nullable(),
  /** The review's main line («Главное», or «Попробовать» in a review before 20.10.2026); null without one. */
  headline: z.string().max(CONTENT_REPORT_HEADLINE_MAX).nullable()
});
export type ContentReportSummaryDto = z.infer<typeof contentReportSummarySchema>;
export const contentReportsQuerySchema = z.strictObject({ cursor: z.string().min(1).max(512).optional() });
export const contentReportsPageSchema = z.object({
  items: z.array(contentReportSummarySchema).max(CONTENT_REPORTS_PAGE),
  nextCursor: z.string().nullable()
});
export type ContentReportsPageDto = z.infer<typeof contentReportsPageSchema>;
export const contentReportForecastSchema = z.object({
  itemId: z.string().min(1).max(200),
  /** The video's title in the report; null when the stored numbers do not name it. */
  title: z.string().max(500).nullable(),
  platform: contentPlatformSchema.nullable(),
  method: z.string().min(1).max(40),
  /** The reading the forecast started from. */
  origin: z.iso.datetime(),
  horizonHours: z.union([z.literal(24), z.literal(72), z.literal(168)]),
  targetAt: z.iso.datetime(),
  expected: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  /** The reading near the horizon; null before scoring or when there was none (`no_fact`). */
  fact: z.number().int().nonnegative().nullable(),
  /** null: not scored yet. */
  outcome: z.enum(['in_band', 'below', 'above', 'no_fact']).nullable()
});
export type ContentReportForecastDto = z.infer<typeof contentReportForecastSchema>;
export const contentReportDetailSchema = z.object({
  report: contentReportSummarySchema,
  text: z.string().max(CONTENT_REPORT_TEXT_MAX),
  /** The same text in parts: prose, and the platform tables that Telegram shows in monospace. */
  blocks: z.array(z.object({ kind: z.enum(['text', 'table']), text: z.string().max(CONTENT_REPORT_TEXT_MAX) })).max(40),
  forecasts: z.array(contentReportForecastSchema).max(36)
});
export type ContentReportDetailDto = z.infer<typeof contentReportDetailSchema>;
export const contentReportParamsSchema = z.strictObject({ id: z.string().min(1).max(100) });

// GET /api/v1/content-analytics/forecasts/accuracy → 200 ContentForecastAccuracyDto: how the daily report's
// forecasts scored in the last 30 days, per horizon, and the ones past their horizon still waiting for the next
// report to score them. Errors: UNAUTHORIZED 401, FORBIDDEN 403.
export const CONTENT_FORECAST_ACCURACY_DAYS = 30;
export const contentForecastAccuracySchema = z.object({
  horizons: z
    .array(
      z.object({
        horizonHours: z.union([z.literal(24), z.literal(72), z.literal(168)]),
        inBand: z.number().int().nonnegative(),
        below: z.number().int().nonnegative(),
        above: z.number().int().nonnegative(),
        /** No reading near the horizon: not counted as a hit or a miss. */
        noFact: z.number().int().nonnegative()
      })
    )
    .max(3),
  /** Past their horizon, scored with the next daily report. */
  waiting: z.number().int().nonnegative(),
  /** The earliest horizon still ahead; null when none is. */
  nextTargetAt: z.iso.datetime().nullable()
});
export type ContentForecastAccuracyDto = z.infer<typeof contentForecastAccuracySchema>;

// Invite links (plan B1, owner 20.10.2026): named links into the analytics Telegram channel, one per traffic source
// (TikTok bio, a YouTube description, an ad post). The bot creates them and counts who joined the channel through
// each one and who of those left, from Telegram's chat_member updates. Joins by the public @username or by a link
// the studio did not create count as «без ссылки».
//   GET  /api/v1/content-analytics/invite-links?days=7|30|90   → 200 InviteLinksDto (joins of the period)
//   POST /api/v1/content-analytics/invite-links               body InviteLinkInput → 201 InviteLinkDto
//        errors: VALIDATION_ERROR 400 (details.reason NAME_TAKEN: an active link has this name;
//        TOO_MANY_LINKS: INVITE_LINKS_MAX links are active),
//        UNAVAILABLE 503 (details.reason CHANNEL_NOT_CONFIGURED | BOT_NOT_CONFIGURED | BOT_CANNOT_INVITE, or Telegram
//        is down), RATE_LIMIT 429, UNAUTHORIZED, FORBIDDEN. A repeat with the same name gets NAME_TAKEN, never a
//        second Telegram link; after a timeout the name stays held for a minute, since Telegram may have made it.
//   POST /api/v1/content-analytics/invite-links/:id/revoke     → 200 InviteLinkDto (safe to repeat; the link stops
//        working, its counts stay). errors: NOT_FOUND 404, UNAVAILABLE 503, RATE_LIMIT 429, UNAUTHORIZED, FORBIDDEN.
/** Telegram's own limit for an invite link name. */
export const INVITE_LINK_NAME_MAX = 32;
export const INVITE_LINKS_MAX = 50;
export const inviteLinkInputSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Name is required' })
    .max(INVITE_LINK_NAME_MAX)
    .refine(cleanText(false), { error: 'Name contains forbidden characters' })
});
export type InviteLinkInput = z.infer<typeof inviteLinkInputSchema>;
export const inviteLinkParamsSchema = z.strictObject({ id: z.uuid() });
const inviteCountsSchema = z.object({
  /** People who joined the channel in the period through this source. */
  joined: z.number().int().nonnegative(),
  /** Of them, the ones who have left since. */
  left: z.number().int().nonnegative()
});
export const inviteLinkSchema = inviteCountsSchema.extend({
  id: z.uuid(),
  name: z.string().min(1).max(INVITE_LINK_NAME_MAX),
  url: z.url(),
  createdAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable()
});
export type InviteLinkDto = z.infer<typeof inviteLinkSchema>;
export const inviteLinksSchema = z.object({
  /** The channel the links lead to (`ANALYTICS_TELEGRAM_CHANNEL`, without «@»); null when it is not set. */
  channel: z.string().min(1).max(64).nullable(),
  /** Newest first; revoked ones stay, so their history is not lost. */
  links: z.array(inviteLinkSchema).max(INVITE_LINKS_MAX),
  withoutLink: inviteCountsSchema,
  /** The first join or leave the bot ever recorded; null until Telegram sends one (the bot must be reconnected once). */
  trackingSince: z.iso.datetime().nullable()
});
export type InviteLinksDto = z.infer<typeof inviteLinksSchema>;

// Telegram rubrics against results (plan B3, migration 0089; owner, 20.10.2026: «Оба способа»). A Telegram post's
// rubric is the owner's pick for the studio post it was sent from, else a marker in the post: the rubric's hashtag,
// or its name opening the post's first line. Owner-only.
// GET /api/v1/content-analytics/rubrics[?days=7|30|90] → 200 ContentRubricsDto: the rubrics, and with `days` the
//   rubric of each Telegram post published in this period and the previous one (the report's window); without it
//   `items` is empty (the settings and the editor need only the names).
// POST /api/v1/content-analytics/rubrics ContentRubricInput → 201 ContentRubricDto.
// PUT /api/v1/content-analytics/rubrics/{id} ContentRubricInput → 200 ContentRubricDto.
// DELETE /api/v1/content-analytics/rubrics/{id} → 204; the posts' picks of it go with it; repeating is a no-op.
// GET /api/v1/content-analytics/posts/{postId}/rubric → 200 ContentPostRubricDto.
// PUT /api/v1/content-analytics/posts/{postId}/rubric { rubricId | null } → 200 ContentPostRubricDto; idempotent.
// Errors: VALIDATION_ERROR 400; NOT_FOUND 404 (PUT of an unknown rubric; a pick of an unknown post or rubric — a GET or
// a null pick of an unknown post answers { rubricId: null }); CONFLICT 409 with details.reason
// NAME_TAKEN, TAG_TAKEN or LIMIT (CONTENT_RUBRICS_MAX); UNAUTHORIZED 401; FORBIDDEN 403.
export const CONTENT_RUBRICS_MAX = 20;
export const CONTENT_RUBRIC_NAME_MAX = 40;
export const contentRubricSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(CONTENT_RUBRIC_NAME_MAX),
  /** Without «#», lower case, «ё» as «е»; null: the rubric is recognised by its name only. */
  // Lower case may lengthen a letter («İ» → «i̇»), so the stored tag gets room past the 32 typed.
  tag: z.string().min(2).max(64).nullable()
});
export type ContentRubricDto = z.infer<typeof contentRubricSchema>;
export const contentRubricInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(CONTENT_RUBRIC_NAME_MAX),
  /** «#Вердикт» or «вердикт»; letters, digits and «_», 2–32 of them. */
  tag: z
    .string()
    .trim()
    .regex(/^#?[\p{L}\p{N}_]{2,32}$/u, { error: 'A hashtag is 2–32 letters, digits or «_»' })
    .transform((tag) => tag.replace(/^#/, '').toLowerCase().replaceAll('ё', 'е'))
    .nullable()
});
export type ContentRubricInput = z.input<typeof contentRubricInputSchema>;
export const contentRubricParamsSchema = z.strictObject({ id: z.uuid() });
export const contentRubricsQuerySchema = z.strictObject({
  days: z.coerce
    .number()
    .int()
    .refine((days) => (CONTENT_REPORT_PERIODS as readonly number[]).includes(days), {
      error: 'days must be 7, 30 or 90'
    })
    .optional()
});
export const contentRubricsSchema = z.object({
  rubrics: z.array(contentRubricSchema).max(CONTENT_RUBRICS_MAX),
  items: z
    .array(
      z.object({
        itemId: contentItemIdSchema,
        rubricId: z.uuid(),
        /** `studio`: the owner's pick for the post it was sent from; `marker`: a hashtag or the name in the text. */
        source: z.enum(['studio', 'marker'])
      })
    )
    .max(CONTENT_REPORT_ITEM_LIMIT)
});
export type ContentRubricsDto = z.infer<typeof contentRubricsSchema>;
export const contentPostRubricParamsSchema = z.strictObject({ postId: z.uuid() });
export const contentPostRubricSchema = z.object({ rubricId: z.uuid().nullable() });
export type ContentPostRubricDto = z.infer<typeof contentPostRubricSchema>;
export const setContentPostRubricInputSchema = z.strictObject({ rubricId: z.uuid().nullable() });
