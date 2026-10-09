import { z } from 'zod';

export const mediaKindSchema = z.enum(['photo', 'animation', 'video']);
export type MediaKind = z.infer<typeof mediaKindSchema>;

export const POST_MEDIA_MAX_ITEMS = 10;
// Decimal byte limits stay below Telegram's published 10 MB / 50 MB ceilings.
export const PHOTO_MEDIA_MAX_BYTES = 10_000_000;
export const ANIMATION_MEDIA_MAX_BYTES = 50_000_000;
export const VIDEO_MEDIA_MAX_BYTES = 50_000_000;

export const postMediaSchema = z.object({
  id: z.uuid(),
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

// GET /api/v1/media/{mediaId}/content -> private binary stream (not a public R2 URL).
// Errors: NOT_FOUND 404, UNAVAILABLE 503, UNAUTHORIZED 401, FORBIDDEN 403.
