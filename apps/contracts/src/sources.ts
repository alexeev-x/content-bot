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

export const listSourceEventsQuerySchema = z.strictObject({
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
  draft: z.object({ postId: z.uuid(), title: z.string() }).nullable(),
  // Latest publication of the draft; null until one exists.
  publication: z.object({ status: publicationStatusSchema }).nullable()
});
export type SourceEventDto = z.infer<typeof sourceEventSchema>;

export const sourceEventPageSchema = pageSchema(sourceEventSchema).extend(offsetPageFields);
export type SourceEventPageDto = z.infer<typeof sourceEventPageSchema>;

export const createSourceEventDraftResponseSchema = z.object({
  event: sourceEventSchema,
  created: z.boolean()
});
export type CreateSourceEventDraftResponse = z.infer<typeof createSourceEventDraftResponseSchema>;

// «Источники» (docs/backend/sources.md). Owner-only; reads are D1-only and never fetch a source.
// GET /api/v1/sources/events?status&type&page&limit → 200 SourceEventPageDto, newest published first.
//   `page` is 1-based (default 1), limit default 10, max 100; `nextCursor` is always null.
//   status: new = no draft yet, drafted = a draft exists, published = the draft's latest publication is
//   sent, hidden = dismissed (wins over the others). Seeded history (the first sync) is not an event.
// POST /api/v1/sources/events/{id}/draft → 201 { event, created: true } when this call created the draft,
//   200 { event, created: false } when it already existed. Idempotent without a key: one draft per
//   event, however often it is called or detected. A hidden event is 409 CONFLICT (EVENT_HIDDEN); a click while
//   the Cron auto-draft holds the same creation is 409 CONFLICT (IN_FLIGHT) — re-read the event.
// POST /api/v1/sources/events/{id}/hide and …/unhide → 200 SourceEventDto, idempotent.
// Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403, NOT_FOUND 404, CONFLICT 409, UNAVAILABLE 503.
