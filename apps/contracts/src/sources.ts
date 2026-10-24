import { z } from 'zod';
import { offsetPageFields, pageSchema, PAGE_NUMBER_MAX, PAGE_SIZE } from './pagination';
import { publicationStatusSchema } from './publications';

export const sourceEventTypeSchema = z.enum(['patch', 'treasure', 'news']);
export type SourceEventType = z.infer<typeof sourceEventTypeSchema>;

export const sourceEventStatusSchema = z.enum(['new', 'drafted', 'published', 'hidden']);
export type SourceEventStatus = z.infer<typeof sourceEventStatusSchema>;

export const sourceEventIdSchema = z
  .string()
  .regex(/^(?:steam_news|patch_notes):[A-Za-z0-9._-]{1,100}$/, { error: 'Invalid event id' });

/**
 * Which rows the table shows (owner, 21.10.2026: one list, no switching by status): `active` = every event that
 * is not hidden, `hidden` = the skipped ones, `past` = Steam announcements from before the watcher started,
 * listed only to try the AI on them (temporary).
 */
export const sourceEventViewSchema = z.enum(['active', 'hidden', 'past']);
export type SourceEventView = z.infer<typeof sourceEventViewSchema>;

export const listSourceEventsQuerySchema = z.strictObject({
  view: sourceEventViewSchema.optional(),
  status: sourceEventStatusSchema.optional(),
  type: sourceEventTypeSchema.optional(),
  page: z.coerce.number().int().min(1).max(PAGE_NUMBER_MAX).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE)
});
export type ListSourceEventsQuery = z.infer<typeof listSourceEventsQuerySchema>;

export const sourceEventEntitySchema = z.object({
  kind: z.enum(['hero', 'item']),
  name: z.string().min(1).max(200)
});
export type SourceEventEntityDto = z.infer<typeof sourceEventEntitySchema>;

export const sourceEventSchema = z.object({
  // `<sourceKey>:<externalId>`, e.g. `patch_notes:7.41`.
  id: sourceEventIdSchema,
  type: sourceEventTypeSchema,
  title: z.string(),
  sourceName: z.string(),
  sourceUrl: z.url(),
  publishedAt: z.iso.datetime(),
  detectedAt: z.iso.datetime(),
  summary: z.string(),
  // Patch: the changed heroes and items (the notes' order, up to 500). Treasure and news: always empty.
  facts: z.array(sourceEventEntitySchema).max(500),
  // The subset of `facts` the owner watches (dota watchlists), exact hero/item match.
  watchHits: z.array(sourceEventEntitySchema).max(100),
  status: sourceEventStatusSchema,
  // A Steam announcement from before the watcher started (`view=past`); the AI can still be asked to write it.
  isPast: z.boolean(),
  // The AI writer was asked for a post and no post exists yet: the draft waits in the bot for approval.
  aiRequested: z.boolean(),
  // The AI is writing it right now (at most 15 minutes): «Написать через ИИ» stays locked until it ends.
  aiWriting: z.boolean(),
  // The AI draft the latest request wrote (the first version of its chain); null until one exists.
  aiDraftId: z.uuid().nullable(),
  // The event's planned series of posts (an event with its own dota2.com page); null without one.
  aiSeriesId: z.uuid().nullable(),
  draft: z.object({ postId: z.uuid(), title: z.string() }).nullable(),
  // Latest publication of the draft; null until one exists.
  publication: z.object({ status: publicationStatusSchema }).nullable()
});
export type SourceEventDto = z.infer<typeof sourceEventSchema>;

export const sourceEventPageSchema = pageSchema(sourceEventSchema).extend(offsetPageFields);
export type SourceEventPageDto = z.infer<typeof sourceEventPageSchema>;

/** The announcement itself, read from Steam when the side panel opens. */
export const sourceEventContentSchema = z.object({
  // Plain text in the original language, links and markup removed; null for a patch or when Steam lost it.
  text: z.string().max(20_000).nullable(),
  // The announcement's page on dota2.com when Steam's event list still has it.
  officialUrl: z.url().nullable(),
  // Its own images (Steam's CDN), in order.
  images: z.array(z.url()).max(10)
});
export type SourceEventContentDto = z.infer<typeof sourceEventContentSchema>;

/**
 * POST /api/v1/sources/events/{id}/ai-draft. `autopublishTest` (DEV only, owner 23.10.2026): the announcement goes the
 * whole automatic way, as if Cron had just found it — written, fact-checked, published without the owner when the
 * automatic publishing is on. Refused (403) where the Worker does not allow it.
 */
export const requestSourceEventAiDraftInputSchema = z.strictObject({ autopublishTest: z.literal(true).optional() });
export type RequestSourceEventAiDraftInput = z.infer<typeof requestSourceEventAiDraftInputSchema>;

/** The newest version of an event's AI draft, for the side panel. */
export const sourceEventAiDraftSchema = z.object({
  // The version the owner sees; approval names it, so a newer rewrite is never approved unseen.
  versionId: z.uuid(),
  status: z.enum(['writing', 'ready', 'failed', 'question']),
  text: z.string().max(8000).nullable(),
  // The editor asked for facts instead of writing.
  question: z.string().max(1000).nullable(),
  // The studio post an approved version became.
  postId: z.uuid().nullable()
});
export type SourceEventAiDraftDto = z.infer<typeof sourceEventAiDraftSchema>;

/** An event's series of posts, each with its AI draft, for the side panel. */
export const sourceEventSeriesSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  pageUrl: z.url(),
  posts: z
    .array(
      z.object({
        id: z.uuid(),
        position: z.number().int().min(1).max(6),
        topic: z.string(),
        status: z.enum(['writing', 'ready', 'failed']),
        // The post's AI draft; null while it is written or when it failed.
        draft: sourceEventAiDraftSchema.nullable(),
        // Valve's images and videos chosen for this post (attached when it is approved).
        media: z.array(z.url()).max(10)
      })
    )
    .max(6)
});
export type SourceEventSeriesDto = z.infer<typeof sourceEventSeriesSchema>;

/** Rewrites the version shown of one series post: a ready instruction, or the owner's own words. */
export const rewriteSourceEventSeriesPostInputSchema = z.strictObject({
  versionId: z.uuid(),
  action: z.enum(['short', 'more', 'again', 'custom']),
  // Required for `custom`: what to change, in the owner's words.
  instruction: z.string().trim().min(1).max(300).optional()
});
export type RewriteSourceEventSeriesPostInput = z.infer<typeof rewriteSourceEventSeriesPostInputSchema>;

export const approveSourceEventAiDraftInputSchema = z.strictObject({ versionId: z.uuid() });
export const approveSourceEventAiDraftResponseSchema = z.object({ postId: z.uuid(), created: z.boolean() });
export type ApproveSourceEventAiDraftResponse = z.infer<typeof approveSourceEventAiDraftResponseSchema>;

export const createSourceEventDraftResponseSchema = z.object({
  event: sourceEventSchema,
  created: z.boolean()
});
export type CreateSourceEventDraftResponse = z.infer<typeof createSourceEventDraftResponseSchema>;

// «Источники» (docs/backend/sources.md). Owner-only; reads are D1-only and never fetch a source.
// GET /api/v1/sources/events?view&status&type&page&limit → 200 SourceEventPageDto, newest published first.
//   view: active (default: not hidden), hidden, past (temporary: Steam announcements seen before the watcher).
//   `page` is 1-based (default 1), limit default 10, max 100; `nextCursor` is always null.
//   status: new = no draft yet, drafted = a draft exists, published = the draft's latest publication is
//   sent, hidden = dismissed (wins over the others). Seeded history (the first sync) is not an event.
// POST /api/v1/sources/events/{id}/draft → 201 { event, created: true } when this call created the draft,
//   200 { event, created: false } when it already existed. Idempotent without a key: one draft per
//   event, however often it is called or detected. A hidden event is 409 CONFLICT (EVENT_HIDDEN); a click while
//   the Cron auto-draft holds the same creation is 409 CONFLICT (IN_FLIGHT) — re-read the event.
// POST /api/v1/sources/events/{id}/hide and …/unhide → 200 SourceEventDto, idempotent.
// GET /api/v1/sources/events/{id}/content → 200 SourceEventContentDto; reads Steam (UNAVAILABLE 503 when it fails).
// POST /api/v1/sources/events/{id}/ai-draft → 202 SourceEventDto with aiRequested: the AI writer drafts a Steam
//   announcement (a past one included) in the bot. Each call asks again (paid). A patch is 409 CONFLICT
//   (NOT_AI_SOURCE), a hidden event 409 CONFLICT (EVENT_HIDDEN), no queue or bot 503 UNAVAILABLE.
// POST /api/v1/sources/events/{id}/images → 202 SourceEventDto: the announcement's images are attached to the
//   event's post again (one copy per image). 409 CONFLICT (NO_POST) without a post or for a patch.
// GET /api/v1/sources/events/{id}/series → 200 SourceEventSeriesDto (404 without one).
// POST /api/v1/sources/events/{id}/series/{postId}/approve { versionId } → as …/ai-draft/approve, for one post of the
//   series: its own studio post, with the media chosen for it.
// POST /api/v1/sources/events/{id}/series/{postId}/rewrite { versionId, action, instruction? } → 200 SourceEventAiDraftDto
//   (the new version). A paid model call; 409 CONFLICT when the version was approved or is not the newest.
// GET /api/v1/sources/events/{id}/ai-draft → 200 SourceEventAiDraftDto (404 when there is none yet).
// POST /api/v1/sources/events/{id}/ai-draft/approve { versionId } → 201 { postId, created: true }, or 200 with the
//   same post when that version was approved before (here or in the bot). 404 for a version of another draft,
//   409 CONFLICT (NOT_A_POST) when the text does not fit a post.
// Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403, NOT_FOUND 404, CONFLICT 409, UNAVAILABLE 503.
