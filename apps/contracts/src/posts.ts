import { z } from 'zod';
import { pageQuerySchema, pageSchema } from './pagination';
import { normalizeAndCheckEntities, normalizeEntities, postEntityListSchema, postEntitySchema } from './post-entities';
import { publicationStatusSchema } from './publications';
import { cleanText } from './text';
import { postMediaSchema } from './media';

// Editorial state only; scheduling and delivery live in publications.
export const postStatusSchema = z.enum(['draft', 'approved']);
export type PostStatus = z.infer<typeof postStatusSchema>;

// Telegram caps a text message at 4096 characters; the editor keeps the body within it.
export const POST_TITLE_MAX = 200;
export const POST_BODY_MAX = 4096;

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

// What the post's publications amount to, so a list row needs no second request. Counts use the
// user-facing PublicationStatus and always carry every status (zero included). A draft has none.
export const POST_SUMMARY_DESTINATIONS_MAX = 20;
export const postPublicationSummarySchema = z.object({
  counts: z.record(publicationStatusSchema, z.number().int().nonnegative()),
  /** The earliest `scheduledAt` among scheduled, queued and retry_wait publications, and where it goes. */
  nextScheduled: z.object({ scheduledAt: z.iso.datetime(), destinationId: z.uuid() }).nullable(),
  /** When the latest publication was confirmed sent. */
  lastSentAt: z.iso.datetime().nullable(),
  /** Destinations of the publications that are live or went out (not failed or cancelled), by title, at most 20. */
  destinations: z.array(z.object({ id: z.uuid(), title: z.string() })).max(POST_SUMMARY_DESTINATIONS_MAX)
});
export type PostPublicationSummary = z.infer<typeof postPublicationSummarySchema>;

export const postSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  /** Telegram entities of `body` (UTF-16 offsets), in the normal form of `normalizeEntities`; empty for plain text. */
  entities: z.array(postEntitySchema),
  revision: revisionSchema,
  status: postStatusSchema,
  /** Ordered media currently attached to this draft; approved posts use their immutable revision snapshot. */
  media: z.array(postMediaSchema).max(10).default([]),
  /** Set while the post is in the archive (sent, nothing left to send); null for a live post. */
  archivedAt: z.iso.datetime().nullable(),
  /** `archivedAt` + the retention period (30 days, server setting); null for a live post. */
  autoDeleteAt: z.iso.datetime().nullable(),
  publicationSummary: postPublicationSummarySchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});
export type PostDto = z.infer<typeof postSchema>;

// POST /api/v1/posts, header Idempotency-Key (required) → 201 PostDto (revision 0, status 'draft').
// `entities` (default none) are checked against `body` and stored in their normal form (see post-entities.ts).
// Errors: VALIDATION_ERROR 400 (body, missing key, or details.reason ENTITIES_* when the entity list does not
// fit the body) or 413 (request over 32 KB), CONFLICT 409 (details.reason IDEMPOTENCY_KEY_REUSED | IN_FLIGHT),
// UNAUTHORIZED 401, FORBIDDEN 403.
export const createPostInputSchema = z
  .strictObject({
    title: titleSchema,
    body: bodySchema.default(''),
    entities: postEntityListSchema.default([])
  })
  .transform((input, ctx) => ({ ...input, entities: normalizeAndCheckEntities(input.body, input.entities, ctx) }));
export type CreatePostInput = z.infer<typeof createPostInputSchema>;

// PATCH /api/v1/posts/{id} → 200 PostDto with revision + 1.
// The revision travels in the body; a stale one is 409, never a silent overwrite.
// `entities` replaces the whole list. A new `body` must come with its `entities` (send [] for plain text):
// offsets of the old list would point into other text, so a body alone is VALIDATION_ERROR with
// details.reason ENTITIES_REQUIRED, never a silent keep. `entities` alone is allowed (formatting change)
// and is checked against the stored body by the server. A title-only update keeps both.
// Errors: VALIDATION_ERROR 400 (details.reason ENTITIES_REQUIRED | ENTITIES_*) or 413 (request over 32 KB),
// NOT_FOUND 404, CONFLICT 409 (details.reason STALE_REVISION | NOT_EDITABLE), UNAUTHORIZED 401, FORBIDDEN 403.
export const updatePostInputSchema = z
  .strictObject({
    revision: revisionSchema,
    title: titleSchema.optional(),
    body: bodySchema.optional(),
    entities: postEntityListSchema.optional()
  })
  .refine((input) => input.title !== undefined || input.body !== undefined || input.entities !== undefined, {
    error: 'Nothing to update'
  })
  .transform((input, ctx) => {
    const { entities, body } = input;
    if (body !== undefined && entities === undefined) {
      ctx.addIssue({ code: 'custom', message: 'ENTITIES_REQUIRED', path: ['entities'] });
      return input;
    }
    if (entities === undefined) return input;
    // Without a body here, the stored one is the reference and only the server has it.
    return {
      ...input,
      entities: body === undefined ? normalizeEntities(entities) : normalizeAndCheckEntities(body, entities, ctx)
    };
  });
export type UpdatePostInput = z.infer<typeof updatePostInputSchema>;

// POST /api/v1/posts/{id}/approve → 200 PostDto (status 'approved', revision + 1).
// Errors: VALIDATION_ERROR 400 (details.reason EMPTY_BODY) or 413 (request over 32 KB), NOT_FOUND 404, CONFLICT 409
// (details.reason STALE_REVISION | ALREADY_APPROVED), UNAUTHORIZED 401, FORBIDDEN 403.
export const approvePostInputSchema = z.strictObject({
  revision: revisionSchema
});
export type ApprovePostInput = z.infer<typeof approvePostInputSchema>;

// GET /api/v1/posts?view&status&q&sort&direction&cursor&limit → 200 PostPageDto.
// view=live (default): posts that are not archived, newest update first. view=archive: archived posts,
// most recently archived first. `archivedCount` is the size of the archive whatever the view and page,
// q searches title, text, channel and status over the complete selected view; sort/direction apply
// before cursor pagination. `totalCount` counts that filtered view, while `archivedCount` always
// counts the entire archive for the tab badge.
// Errors: VALIDATION_ERROR 400 (bad query or cursor), UNAUTHORIZED 401, FORBIDDEN 403.
export const postViewSchema = z.enum(['live', 'archive']);
export type PostView = z.infer<typeof postViewSchema>;

export const postSortSchema = z.enum(['title', 'updated', 'sentAt', 'left']);
export type PostSort = z.infer<typeof postSortSchema>;
export const postSortDirectionSchema = z.enum(['ascending', 'descending']);
export type PostSortDirection = z.infer<typeof postSortDirectionSchema>;

export const listPostsQuerySchema = pageQuerySchema.extend({
  status: postStatusSchema.optional(),
  view: postViewSchema.default('live'),
  q: z.string().trim().max(120).optional(),
  sort: postSortSchema.optional(),
  direction: postSortDirectionSchema.optional()
});
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;

export const postPageSchema = pageSchema(postSchema).extend({
  archivedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative()
});
export type PostPageDto = z.infer<typeof postPageSchema>;

// GET /api/v1/posts/{id} → 200 PostDto. Errors: NOT_FOUND 404, UNAUTHORIZED 401, FORBIDDEN 403.

// Deleting and restoring posts. The post is removed for good together with its publication records
// (and their attempts and incidents); a message already sent to a channel is never touched.
// Every operation carries the post revision, so a post edited elsewhere is not removed blindly.
const postRefSchema = z.strictObject({ id: z.uuid(), revision: revisionSchema });
export type PostRef = z.infer<typeof postRefSchema>;

export const POST_BULK_MAX = 100;
const bulkPostsInputSchema = z.strictObject({
  items: z
    .array(postRefSchema)
    .min(1)
    .max(POST_BULK_MAX)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length, { error: 'DUPLICATE_IDS' })
});

// Why a post was not deleted. PUBLICATION_IN_PROGRESS: a publication is being prepared or sent right
// now. PUBLICATION_UNKNOWN: a send may have happened and has not been reconciled (until then the post
// and everything linked to it stay). NOT_FOUND also covers "already deleted", so a retry is harmless.
export const postDeleteRefusalSchema = z.enum([
  'NOT_FOUND',
  'STALE_REVISION',
  'PUBLICATION_IN_PROGRESS',
  'PUBLICATION_UNKNOWN'
]);
export type PostDeleteRefusal = z.infer<typeof postDeleteRefusalSchema>;

export const postRestoreRefusalSchema = z.enum(['NOT_FOUND', 'STALE_REVISION', 'NOT_ARCHIVED']);
export type PostRestoreRefusal = z.infer<typeof postRestoreRefusalSchema>;

/** A publication that was still waiting (scheduled, queued, retry_wait) and went away with its post. */
export const cancelledPublicationSchema = z.object({
  id: z.uuid(),
  destinationId: z.uuid(),
  scheduledAt: z.iso.datetime()
});
export type CancelledPublicationDto = z.infer<typeof cancelledPublicationSchema>;

// POST /api/v1/posts/{id}/delete → 200 DeletePostResultDto. Waiting publications are cancelled and removed
// in the same atomic write; nothing is sent for them afterwards.
// Errors: VALIDATION_ERROR 400 or 413, NOT_FOUND 404, CONFLICT 409 (details.reason STALE_REVISION |
// PUBLICATION_IN_PROGRESS | PUBLICATION_UNKNOWN; the last two add details.publicationId),
// UNAUTHORIZED 401, FORBIDDEN 403.
export const deletePostInputSchema = z.strictObject({ revision: revisionSchema });
export type DeletePostInput = z.infer<typeof deletePostInputSchema>;

export const deletePostResultSchema = z.object({
  id: z.uuid(),
  cancelledPublications: z.array(cancelledPublicationSchema)
});
export type DeletePostResultDto = z.infer<typeof deletePostResultSchema>;

// POST /api/v1/posts/delete (1 to 100 posts, no repeated id) → 200 BulkDeletePostsResultDto with one entry
// per requested post, in request order. The whole request is 200 even when every post is refused:
// each post is decided on its own, atomically with its publications, and one refusal never blocks the rest.
// Errors: VALIDATION_ERROR 400 (details.reason DUPLICATE_IDS) or 413, UNAUTHORIZED 401, FORBIDDEN 403.
export const bulkDeletePostsInputSchema = bulkPostsInputSchema;
export type BulkDeletePostsInput = z.infer<typeof bulkDeletePostsInputSchema>;

export const bulkDeletePostsResultSchema = z.object({
  items: z.array(
    z.discriminatedUnion('outcome', [
      z.object({
        id: z.uuid(),
        outcome: z.literal('deleted'),
        cancelledPublications: z.array(cancelledPublicationSchema)
      }),
      z.object({
        id: z.uuid(),
        outcome: z.literal('refused'),
        reason: postDeleteRefusalSchema,
        /** The publication that blocks the delete (PUBLICATION_IN_PROGRESS | PUBLICATION_UNKNOWN). */
        publicationId: z.uuid().optional()
      })
    ])
  )
});
export type BulkDeletePostsResultDto = z.infer<typeof bulkDeletePostsResultSchema>;

// POST /api/v1/posts/{id}/restore → 200 PostDto: out of the archive, `approved`, same revision, at the top of
// the live list. Nothing is sent or scheduled by it.
// Errors: VALIDATION_ERROR 400 or 413, NOT_FOUND 404, CONFLICT 409 (details.reason STALE_REVISION |
// NOT_ARCHIVED), UNAUTHORIZED 401, FORBIDDEN 403.
export const restorePostInputSchema = z.strictObject({ revision: revisionSchema });
export type RestorePostInput = z.infer<typeof restorePostInputSchema>;

// POST /api/v1/posts/restore (1 to 100 posts) → 200 BulkRestorePostsResultDto, per post like the bulk delete.
// Errors: as the bulk delete.
export const bulkRestorePostsInputSchema = bulkPostsInputSchema;
export type BulkRestorePostsInput = z.infer<typeof bulkRestorePostsInputSchema>;

export const bulkRestorePostsResultSchema = z.object({
  items: z.array(
    z.discriminatedUnion('outcome', [
      z.object({ id: z.uuid(), outcome: z.literal('restored') }),
      z.object({ id: z.uuid(), outcome: z.literal('refused'), reason: postRestoreRefusalSchema })
    ])
  )
});
export type BulkRestorePostsResultDto = z.infer<typeof bulkRestorePostsResultSchema>;
