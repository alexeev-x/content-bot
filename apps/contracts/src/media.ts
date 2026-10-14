import { z } from 'zod';
import {
  CURSOR_XOR_PAGE_ISSUE,
  cursorXorPage,
  offsetPageFields,
  offsetPageQuerySchema,
  pageSchema
} from './pagination';

export const mediaKindSchema = z.enum(['photo', 'animation', 'video']);
export type MediaKind = z.infer<typeof mediaKindSchema>;

export const POST_MEDIA_MAX_ITEMS = 10;
// Decimal byte limits stay below Telegram's published 10 MB / 50 MB ceilings.
export const PHOTO_MEDIA_MAX_BYTES = 10_000_000;
export const ANIMATION_MEDIA_MAX_BYTES = 50_000_000;
export const VIDEO_MEDIA_MAX_BYTES = 50_000_000;

export const postMediaSchema = z.object({
  id: z.uuid(),
  // A cropped attachment is a derived raster; null means this attachment is the original asset.
  sourceMediaId: z.uuid().nullable(),
  kind: mediaKindSchema,
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive().max(VIDEO_MEDIA_MAX_BYTES),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationMs: z.number().int().positive().nullable(),
  position: z.number().int().nonnegative()
});
export type PostMediaDto = z.infer<typeof postMediaSchema>;

export const mediaLibraryKindSchema = z.enum(['all', 'photo', 'video']);
export type MediaLibraryKind = z.infer<typeof mediaLibraryKindSchema>;

export const mediaLibraryUsageFilterSchema = z.enum(['all', 'used', 'unused']);
export const mediaLibraryUsageSchema = z.object({
  postId: z.uuid(),
  title: z.string().nullable()
});

export const mediaLibraryItemSchema = z.object({
  id: z.uuid(),
  kind: mediaKindSchema,
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive().max(VIDEO_MEDIA_MAX_BYTES),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationMs: z.number().int().positive().nullable(),
  createdAt: z.iso.datetime(),
  duplicateCount: z.number().int().min(1),
  usageCount: z.number().int().nonnegative(),
  // False while a post, a publication snapshot or a crop holds the file: deleting it would answer 409.
  deletable: z.boolean(),
  usages: z.array(mediaLibraryUsageSchema).max(3)
});
export type MediaLibraryItemDto = z.infer<typeof mediaLibraryItemSchema>;

// GET /api/v1/media?kind=all|photo|video&search&usage=all|used|unused&cursor|page&limit -> 200 MediaLibraryPageDto.
// Search is an SQLite filename-prefix match (ASCII case-insensitive; non-ASCII case-sensitive).
// Usage describes current post attachments;
// duplicateCount compares exact SHA-256 among retained assets. Content remains private.
export const mediaLibraryQuerySchema = offsetPageQuerySchema
  .extend({
    kind: mediaLibraryKindSchema.default('all'),
    search: z.string().trim().min(1).max(80).optional(),
    usage: mediaLibraryUsageFilterSchema.default('all'),
    // hidden=true lists only items the owner hid; without it hidden items are left out.
    hidden: z.stringbool().optional()
  })
  .refine(cursorXorPage, CURSOR_XOR_PAGE_ISSUE);
export type MediaLibraryQuery = z.infer<typeof mediaLibraryQuerySchema>;
export const mediaLibraryPageSchema = pageSchema(mediaLibraryItemSchema).extend(offsetPageFields);
export type MediaLibraryPageDto = z.infer<typeof mediaLibraryPageSchema>;

// POST /api/v1/posts/{postId}/media?revision&fileName; raw binary body, Content-Type is checked
// against the file signature; Idempotency-Key is required. Returns 201 { media, revision }.
// Same key + same bytes/metadata returns the original result; reused key with different payload is
// CONFLICT (IDEMPOTENCY_KEY_REUSED). Uploads are sequential per post because each successful
// upload increments revision; a stale revision is CONFLICT (STALE_REVISION).
// Errors: VALIDATION_ERROR 400 (bad metadata/signature or unsupported type), 413 (size/count limit),
// NOT_FOUND 404, CONFLICT 409 (STALE_REVISION | NOT_EDITABLE | IDEMPOTENCY_KEY_REUSED),
// UNAVAILABLE 503 (R2 failure), UNAUTHORIZED 401, FORBIDDEN 403.
export const uploadPostMediaQuerySchema = z.strictObject({
  revision: z.coerce.number().int().nonnegative(),
  fileName: z.string().trim().min(1).max(255)
});
export type UploadPostMediaQuery = z.infer<typeof uploadPostMediaQuerySchema>;

export const uploadPostMediaResultSchema = z.object({
  media: postMediaSchema,
  revision: z.number().int().nonnegative()
});
export type UploadPostMediaResultDto = z.infer<typeof uploadPostMediaResultSchema>;

// POST /api/v1/posts/{postId}/media/{mediaId}/crop?revision&fileName; raw rasterized photo bytes
// (JPEG, PNG, WebP) for a photo target or MP4 bytes for a video target; the bytes must match the target's kind.
// Content-Length, Content-Type, and Idempotency-Key are required. The server atomically
// replaces the existing draft photo or video at the same position; it does not consume another media slot.
// The derivative points to the original asset (including when cropping an existing derivative),
// so the original remains retained while a derivative refers to it. Crop geometry is represented
// by the derivative bytes, not persisted separately.
// Same key + same path/query/bytes replays the original response; a different payload with that
// key is CONFLICT (IDEMPOTENCY_KEY_REUSED), and an in-flight request is CONFLICT (IN_FLIGHT).
// Errors: VALIDATION_ERROR 400 (bad query, animation target, kind mismatch, invalid media/signature or headers),
// 413 (photo or video size limit), NOT_FOUND 404, CONFLICT 409 (STALE_REVISION | NOT_EDITABLE |
// IDEMPOTENCY_KEY_REUSED | IN_FLIGHT), UNAVAILABLE 503 (storage failure), UNAUTHORIZED 401,
// FORBIDDEN 403.
export const cropPostMediaQuerySchema = z.strictObject({
  revision: z.coerce.number().int().nonnegative(),
  fileName: z.string().trim().min(1).max(255)
});
export type CropPostMediaQuery = z.infer<typeof cropPostMediaQuerySchema>;

export const cropPostMediaResultSchema = z.object({
  media: postMediaSchema,
  revision: z.number().int().nonnegative()
});
export type CropPostMediaResultDto = z.infer<typeof cropPostMediaResultSchema>;

// POST /api/v1/media/{sourceId}/derived?fileName&kind=photo|video; raw bytes of a cropped photo (JPEG, PNG, WebP)
// or an MP4 video. Content-Length, Content-Type and Idempotency-Key are required; validation matches uploads
// (signature, streamed byte count, per-kind size limit, dimensions). The source must be a retained library item
// of the same kind. Stores a NEW library item (no post involved) whose `source_media_id` is the root original,
// so the original stays and cannot be deleted while the derivative exists. Returns 201 MediaLibraryItemDto.
// Same key + same bytes/metadata/source replays the original response; a reused key with a different payload is
// CONFLICT (IDEMPOTENCY_KEY_REUSED). Errors: VALIDATION_ERROR 400 (bad query, kind mismatch, invalid media),
// 413 (size limit), NOT_FOUND 404 (unknown source), CONFLICT 409, UNAVAILABLE 503, UNAUTHORIZED 401, FORBIDDEN 403.
//
// `mode=replace` (default `new`) also swaps the source for the new item in every DRAFT post that holds it (same
// position, one revision bump per post like an edit) and takes the source out of the library listing for good
// (library_state 2), in the same guarded D1 batch. Approved/scheduled/published posts and revision snapshots keep
// the source untouched; its object is removed by the normal cleanup only once nothing references it.
// The reply is still the new item. A replay of the same key returns it again without a second swap; the source
// of an already replaced item answers NOT_FOUND.
export const deriveMediaModeSchema = z.enum(['new', 'replace']);
export const deriveMediaQuerySchema = z.strictObject({
  fileName: z.string().trim().min(1).max(255),
  kind: z.enum(['photo', 'video']),
  mode: deriveMediaModeSchema.optional()
});
export type DeriveMediaQuery = z.infer<typeof deriveMediaQuerySchema>;

// DELETE /api/v1/posts/{postId}/media/{mediaId}, JSON { revision } -> 200 { revision }.
export const changePostMediaRevisionInputSchema = z.strictObject({ revision: z.number().int().nonnegative() });
export type ChangePostMediaRevisionInput = z.infer<typeof changePostMediaRevisionInputSchema>;
export const changePostMediaResultSchema = z.object({ revision: z.number().int().nonnegative() });
export type ChangePostMediaResultDto = z.infer<typeof changePostMediaResultSchema>;

// PATCH /api/v1/posts/{postId}/media/order -> 200 { revision }.
export const reorderPostMediaInputSchema = changePostMediaRevisionInputSchema.extend({
  mediaIds: z.array(z.uuid()).min(1).max(POST_MEDIA_MAX_ITEMS)
});
export type ReorderPostMediaInput = z.infer<typeof reorderPostMediaInputSchema>;

// POST /api/v1/posts/{postId}/media/attach -> 200 { media, revision }.
// `mediaIds` are appended in the submitted order; existing attachments remain before them.
// The server verifies every asset is in the retained library and enforces the 10-item cap. The same picture may
// be attached again, also within one request: each repeat becomes a new asset with its own copy of the stored file.
export const attachPostMediaInputSchema = changePostMediaRevisionInputSchema.extend({
  mediaIds: z.array(z.uuid()).min(1).max(POST_MEDIA_MAX_ITEMS)
});
export type AttachPostMediaInput = z.infer<typeof attachPostMediaInputSchema>;
export const attachPostMediaResultSchema = z.object({
  media: z.array(postMediaSchema).max(POST_MEDIA_MAX_ITEMS),
  revision: z.number().int().nonnegative()
});
export type AttachPostMediaResultDto = z.infer<typeof attachPostMediaResultSchema>;

// GET /api/v1/media/{mediaId}/content -> private binary stream (not a public R2 URL).
// Errors: NOT_FOUND 404, UNAVAILABLE 503, UNAUTHORIZED 401, FORBIDDEN 403.

// DELETE /api/v1/media/{mediaId}?detachDrafts=true|false -> 204 (no body). Deletes a library file no post uses.
// "In use" means any post holds it (draft, approved or archived) or a publication's snapshot names it,
// or a derivative still points to it as its source.
// With detachDrafts=true the file is first removed from DRAFT posts (same rules as removing it in the editor:
// one revision bump per post, positions renumbered; at most MEDIA_DETACH_DRAFTS_MAX drafts) and then deleted.
// If something else still needs it, nothing changes (drafts stay attached) and the answer is 409.
// Errors: NOT_FOUND 404, CONFLICT 409 (details.reason MEDIA_IN_USE, details.blockedBy one of
// PUBLISHED | APPROVED | DERIVATIVES | DRAFTS, strongest first), UNAUTHORIZED 401, FORBIDDEN 403.
// The D1 row is removed first, in one conditional statement; the R2 object follows and, if that fails,
// stays in the durable cleanup queue.
export const MEDIA_IN_USE_REASON = 'MEDIA_IN_USE';
export const MEDIA_BULK_DELETE_MAX_IDS = 50;
export const MEDIA_DETACH_DRAFTS_MAX = 20;
export const mediaBlockedBySchema = z.enum(['PUBLISHED', 'APPROVED', 'DERIVATIVES', 'DRAFTS']);
export type MediaBlockedBy = z.infer<typeof mediaBlockedBySchema>;
export const deleteMediaQuerySchema = z.strictObject({ detachDrafts: z.stringbool().optional() });
export type DeleteMediaQuery = z.infer<typeof deleteMediaQuerySchema>;

// POST /api/v1/media/delete { ids, detachDrafts? } -> 200 { deleted, inUse }. Each id is handled independently
// (detachDrafts as for the single delete; an id that stays blocked is left untouched):
// `deleted` lists ids that are gone (an id that no longer exists counts, so a retry is harmless),
// `inUse` lists ids that were kept because something references them.
export const bulkDeleteMediaInputSchema = z.strictObject({
  ids: z
    .array(z.uuid())
    .min(1)
    .max(MEDIA_BULK_DELETE_MAX_IDS)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'DUPLICATE_MEDIA_IDS' }),
  detachDrafts: z.boolean().optional()
});
export type BulkDeleteMediaInput = z.infer<typeof bulkDeleteMediaInputSchema>;
export const bulkDeleteMediaResultSchema = z.object({
  deleted: z.array(z.uuid()).max(MEDIA_BULK_DELETE_MAX_IDS),
  inUse: z.array(z.uuid()).max(MEDIA_BULK_DELETE_MAX_IDS)
});
export type BulkDeleteMediaResultDto = z.infer<typeof bulkDeleteMediaResultSchema>;

// GET /api/v1/media/{mediaId}/usage -> 200 MediaUsageDto. Each list holds at most MEDIA_USAGE_LIST_MAX posts,
// newest first. drafts: posts in draft status holding the file; approved: approved posts holding it plus posts
// whose scheduled/unfinished publication snapshot names it; published: posts with a sent (or unconfirmed) publication
// that names it, publishedAt = when that job last changed. derivatives: crops that point at it as their source.
// deletable: a plain DELETE would succeed; hideable: POST .../hide would change something.
// Errors: NOT_FOUND 404, UNAUTHORIZED 401, FORBIDDEN 403.
export const MEDIA_USAGE_LIST_MAX = 20;
export const mediaUsagePostSchema = z.object({ postId: z.uuid(), title: z.string().nullable() });
export const mediaUsageSchema = z.object({
  drafts: z.array(mediaUsagePostSchema).max(MEDIA_USAGE_LIST_MAX),
  approved: z.array(mediaUsagePostSchema).max(MEDIA_USAGE_LIST_MAX),
  published: z.array(mediaUsagePostSchema.extend({ publishedAt: z.iso.datetime() })).max(MEDIA_USAGE_LIST_MAX),
  derivatives: z.number().int().nonnegative(),
  deletable: z.boolean(),
  hideable: z.boolean()
});
export type MediaUsageDto = z.infer<typeof mediaUsageSchema>;

// POST /api/v1/media/{mediaId}/hide and /unhide -> 204. Hiding takes the item out of the default listing
// (GET /media?hidden=true lists them); nothing else changes: the file stays readable, attachable and retained.
// Both are idempotent. A replaced or unknown item answers NOT_FOUND.
