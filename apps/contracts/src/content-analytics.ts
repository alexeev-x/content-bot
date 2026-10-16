import { z } from 'zod';
import { pageQuerySchema, pageSchema } from './pagination';

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

export const contentItemDetailSchema = z.object({
  item: contentItemSchema,
  snapshots: z.array(contentItemSnapshotSchema).max(CONTENT_ITEM_SNAPSHOT_LIMIT),
  /** The usual curve of the item's format when enough videos share it, else of its platform (itself excluded). */
  baseline: contentBaselineSchema,
  /** The video's format: from its linked script, else as the owner marked it; null — unknown (or a Telegram post). */
  format: contentVideoFormatSchema.nullable().optional(),
  /** Where `format` comes from: a linked script wins over the owner's mark; null when unknown. */
  formatSource: z.enum(['script', 'owner']).nullable().optional(),
  /** Other tracked videos of that format, so the page can say how far the format curve is (5 needed). */
  formatItems: z.number().int().nonnegative().optional()
});
export type ContentItemDetailDto = z.infer<typeof contentItemDetailSchema>;

// PUT /api/v1/content-analytics/items/:id/format  body ContentItemFormatInput → 204 (replaces; safe to repeat).
// The owner's mark for a video filmed without an AI script (a linked script's format still wins); null clears it.
// Errors: VALIDATION_ERROR 400 (also for a Telegram post), NOT_FOUND 404, UNAUTHORIZED 401, FORBIDDEN 403.
export const contentItemFormatInputSchema = z.strictObject({ format: contentVideoFormatSchema.nullable() });
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
