import { z } from 'zod';
import { pageQuerySchema, pageSchema } from './pagination';

// Editorial state only; scheduling and delivery live in publications.
export const postStatusSchema = z.enum(['draft', 'approved']);
export type PostStatus = z.infer<typeof postStatusSchema>;

// Telegram caps a text message at 4096 characters; the editor keeps the body within it.
export const POST_TITLE_MAX = 200;
export const POST_BODY_MAX = 4096;

// Control characters and lone surrogates are rejected: SQLite cuts strings at U+0000 and D1
// silently replaces lone surrogates, so the stored post would differ from the response.
const LONE_SURROGATE = /\p{Cs}/u;
const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;

function hasControlCharacter(value: string, allowLineBreaks: boolean): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0x20 && code !== 0x7f) continue;
    if (allowLineBreaks && (code === TAB || code === LINE_FEED || code === CARRIAGE_RETURN)) continue;
    return true;
  }
  return false;
}

const cleanText = (allowLineBreaks: boolean) => (value: string) =>
  !hasControlCharacter(value, allowLineBreaks) && !LONE_SURROGATE.test(value);

const titleSchema = z
  .string()
  .trim()
  .min(1, { error: 'Title is required' })
  .max(POST_TITLE_MAX)
  .refine(cleanText(false), { error: 'Title contains forbidden characters' });
// Tabs and line breaks are allowed in the body; other control characters are not.
const bodySchema = z
  .string()
  .max(POST_BODY_MAX)
  .refine(cleanText(true), { error: 'Body contains forbidden characters' });
const revisionSchema = z.number().int().nonnegative();

export const postSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  revision: revisionSchema,
  status: postStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});
export type PostDto = z.infer<typeof postSchema>;

// POST /api/v1/posts, header Idempotency-Key (required) → 201 PostDto (revision 0, status 'draft').
// Errors: VALIDATION_ERROR 400 (body or missing key) or 413 (request over 32 KB), CONFLICT 409 (details.reason
// IDEMPOTENCY_KEY_REUSED | IN_FLIGHT), UNAUTHORIZED 401, FORBIDDEN 403.
export const createPostInputSchema = z.strictObject({
  title: titleSchema,
  body: bodySchema.default('')
});
export type CreatePostInput = z.infer<typeof createPostInputSchema>;

// PATCH /api/v1/posts/{id} → 200 PostDto with revision + 1.
// The revision travels in the body; a stale one is 409, never a silent overwrite.
// Errors: VALIDATION_ERROR 400 or 413 (request over 32 KB), NOT_FOUND 404, CONFLICT 409
// (details.reason STALE_REVISION | NOT_EDITABLE), UNAUTHORIZED 401, FORBIDDEN 403.
export const updatePostInputSchema = z
  .strictObject({
    revision: revisionSchema,
    title: titleSchema.optional(),
    body: bodySchema.optional()
  })
  .refine((input) => input.title !== undefined || input.body !== undefined, {
    error: 'Nothing to update'
  });
export type UpdatePostInput = z.infer<typeof updatePostInputSchema>;

// POST /api/v1/posts/{id}/approve → 200 PostDto (status 'approved', revision + 1).
// Errors: VALIDATION_ERROR 400 (details.reason EMPTY_BODY) or 413 (request over 32 KB), NOT_FOUND 404, CONFLICT 409
// (details.reason STALE_REVISION | ALREADY_APPROVED), UNAUTHORIZED 401, FORBIDDEN 403.
export const approvePostInputSchema = z.strictObject({
  revision: revisionSchema
});
export type ApprovePostInput = z.infer<typeof approvePostInputSchema>;

// GET /api/v1/posts?status&cursor&limit → 200 PostPageDto, newest update first.
// Errors: VALIDATION_ERROR 400 (bad query or cursor), UNAUTHORIZED 401, FORBIDDEN 403.
export const listPostsQuerySchema = pageQuerySchema.extend({
  status: postStatusSchema.optional()
});
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;

export const postPageSchema = pageSchema(postSchema);
export type PostPageDto = z.infer<typeof postPageSchema>;

// GET /api/v1/posts/{id} → 200 PostDto. Errors: NOT_FOUND 404, UNAUTHORIZED 401, FORBIDDEN 403.
