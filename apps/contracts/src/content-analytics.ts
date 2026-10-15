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
  errorCode: z.string().max(64).nullable()
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
export const contentItemDetailSchema = z.object({
  item: contentItemSchema,
  snapshots: z.array(contentItemSnapshotSchema).max(CONTENT_ITEM_SNAPSHOT_LIMIT)
});
export type ContentItemDetailDto = z.infer<typeof contentItemDetailSchema>;
