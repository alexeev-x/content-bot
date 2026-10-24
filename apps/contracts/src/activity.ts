import { z } from 'zod';

// The owner's activity feed (owner, 14.10.2026): what happened in the studio, read from the audit log.
// GET /api/v1/activity?category&from&to&cursor&limit → 200 ActivityPageDto, newest first.
// Errors: VALIDATION_ERROR 400 (bad query or cursor), UNAUTHORIZED 401, FORBIDDEN 403.

export const ACTIVITY_PAGE_MAX = 50;

export const activityActionSchema = z.enum([
  'post.create',
  'post.approve',
  'post.return_to_draft',
  'post.archive',
  'post.restore',
  'post.delete',
  'post.purge',
  'media.upload',
  'media.derive',
  'media.delete',
  'publication.create',
  'publication.reschedule',
  'publication.cancel',
  'publication.resolve_unknown',
  'publication.delete',
  'job.succeeded',
  'job.failed',
  'job.unknown',
  'job.retry_wait',
  'incident.resolve',
  'destination.create',
  'destination.update',
  'automation.pause',
  'automation.resume',
  'automation.run_now'
]);
export type ActivityAction = z.infer<typeof activityActionSchema>;

/** Filter chips: `errors` is failed and unconfirmed sends; `system` is channels, incidents and automations. */
export const activityCategorySchema = z.enum(['posts', 'media', 'publications', 'errors', 'system']);
export type ActivityCategory = z.infer<typeof activityCategorySchema>;

export const activityQuerySchema = z
  .strictObject({
    category: activityCategorySchema.optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    cursor: z.string().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(ACTIVITY_PAGE_MAX).default(20)
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.from < query.to, {
    error: 'from must be before to',
    path: ['to']
  });
export type ActivityQuery = z.infer<typeof activityQuerySchema>;

export const activityItemSchema = z.object({
  /** Audit row id: stable, used as a React key and in the cursor. */
  id: z.string(),
  at: z.iso.datetime(),
  action: activityActionSchema,
  category: activityCategorySchema,
  /**
   * `owner` for the owner's own actions (admin or bot), `system` for Cron and automations, `ai` for a post the
   * AI editor wrote (made from an approved AI draft; owner, 17.10.2026: «Кто: Вы» there was wrong).
   */
  actor: z.enum(['owner', 'system', 'ai']),
  entityType: z.enum(['post', 'media', 'publication', 'destination', 'automation', 'incident', 'job']),
  entityId: z.string(),
  /** Post title, file name, channel or automation name at read time; null when the object is gone. */
  title: z.string().nullable(),
  /** The post behind a post or publication event, for a link; null when it was deleted. */
  postId: z.uuid().nullable(),
  /** The publication behind a publication or send event, for a link; null when it was deleted. */
  publicationId: z.uuid().nullable(),
  channelTitle: z.string().nullable(),
  /** The plan an event set (created, rescheduled), when the audit row stored it. */
  scheduledAt: z.iso.datetime().nullable(),
  /** Stable code of a failed or unconfirmed send. */
  errorCode: z.string().nullable()
});
export type ActivityItemDto = z.infer<typeof activityItemSchema>;

export const activityPageSchema = z.object({
  items: z.array(activityItemSchema).max(ACTIVITY_PAGE_MAX),
  nextCursor: z.string().nullable()
});
export type ActivityPageDto = z.infer<typeof activityPageSchema>;
