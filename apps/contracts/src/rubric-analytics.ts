import { z } from 'zod';
import { rubricKeySchema } from './rubric-keys';

// Rubric analytics (rubric scheduler stage 7, docs/scheduler/area-backend-analytics.md §12): every rubric post scored
// at 24 h against the channel's usual post; ×1.4 is sent as 1.4 and formatted by the frontend. Owner only. Errors:
// VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403, NOT_FOUND 404 (unknown rubric), UNAVAILABLE 503
// (`details.reason = MIGRATION_PENDING`).

const ratio = z.number().finite().nullable();
const count = z.number().int().nonnegative();
export const rubricPartSchema = z.enum(['views', 'reactions', 'comments', 'votes']);
export type RubricPart = z.infer<typeof rubricPartSchema>;
const partsSchema = z.object({ views: ratio, reactions: ratio, comments: ratio, votes: ratio });
export const rubricMissingReasonSchema = z.enum([
  'OTHER_CHANNEL',
  'NOT_TRACKED_FROM_BIRTH',
  'NO_BASELINE',
  'CONTAMINATED',
  'NO_VIEWS'
]);
export const rubricCommentKindSchema = z.enum([
  'praise',
  'joke',
  'disagree',
  'confused',
  'request',
  'complaint',
  'recognition',
  'offtopic'
]);
export type RubricCommentKind = z.infer<typeof rubricCommentKindSchema>;

export const rubricCompareQuerySchema = z.strictObject({
  days: z.enum(['7', '30', '90']).default('30').transform(Number)
});

/** GET /api/v1/rubric-analytics/compare?days=7|30|90 */
export const rubricCompareSchema = z.object({
  days: z.number().int(),
  asOf: z.iso.datetime(),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  channel: z.object({ baselinePosts: count, viewsMedian24: count.nullable() }),
  rows: z
    .array(
      z.object({
        rubric: rubricKeySchema,
        posts: count,
        scored: count,
        enough: z.boolean(),
        x: ratio,
        xPrev: ratio,
        parts: partsSchema,
        rank: z.number().int().positive().nullable(),
        mark: z.enum(['best', 'worst']).nullable(),
        reason: rubricPartSchema.nullable()
      })
    )
    .max(40),
  hours: z.object({
    cells: z
      .array(
        z.object({
          weekday: z.number().int().min(0).max(6),
          hour: z.number().int().min(0).max(23),
          n: count,
          x: ratio,
          trial: z.boolean()
        })
      )
      .max(168)
  }),
  coverage: z.object({ sent: count, scored: count, pending: count, missing: count })
});
export type RubricCompare = z.infer<typeof rubricCompareSchema>;

export const rubricPostsQuerySchema = z.strictObject({
  rubric: rubricKeySchema,
  days: z.enum(['30', '90', 'all']).default('90')
});

const sliceDimensionSchema = z.enum(['hero', 'line', 'look', 'picture', 'hour', 'weekday']);
export type RubricSliceDimension = z.infer<typeof sliceDimensionSchema>;

/** GET /api/v1/rubric-analytics/posts?rubric=<key>&days=30|90|all */
export const rubricPostsSchema = z.object({
  rubric: rubricKeySchema,
  days: z.enum(['30', '90', 'all']),
  asOf: z.iso.datetime(),
  /** The rubric's median composite against the channel (its usual post). */
  usual: ratio,
  counts: z.object({ sent: count, scored: count, pending: count, missing: count }),
  bestMessageId: z.string().nullable(),
  worstMessageId: z.string().nullable(),
  posts: z
    .array(
      z.object({
        messageId: z.string(),
        sentAt: z.iso.datetime(),
        hero: z.string().nullable(),
        line: z.string().nullable(),
        look: z.string().nullable(),
        picture: z.boolean(),
        hour: z.number().int().min(0).max(23),
        weekday: z.number().int().min(0).max(6),
        status: z.enum(['scored', 'pending', 'missing']),
        missingReason: rubricMissingReasonSchema.nullable(),
        views24: count.nullable(),
        /** Against the rubric's usual post; `xChannel` against the channel's. */
        x: ratio,
        xChannel: ratio,
        parts: partsSchema,
        comments: count.nullable(),
        voters: count.nullable(),
        telegramUrl: z.string().nullable()
      })
    )
    .max(200),
  truncated: z.boolean(),
  slices: z
    .array(
      z.object({
        dimension: sliceDimensionSchema,
        rows: z
          .array(
            z.object({
              key: z.string(),
              label: z.string(),
              n: count,
              x: ratio,
              few: z.boolean(),
              mark: z.enum(['best', 'worst']).nullable()
            })
          )
          .max(200)
      })
    )
    .max(6)
});
export type RubricPosts = z.infer<typeof rubricPostsSchema>;

export const rubricCommentsQuerySchema = z.strictObject({
  days: z.enum(['7', '30']).default('30').transform(Number),
  rubric: rubricKeySchema.optional()
});

/** GET /api/v1/rubric-analytics/comments?days=7|30&rubric=<key>? */
export const rubricCommentsSchema = z.object({
  asOf: z.iso.datetime(),
  state: z.enum(['ok', 'not_connected', 'no_data', 'ai_unavailable', 'limited']),
  textKeptDays: z.number().int().positive(),
  rubrics: z
    .array(
      z.object({
        rubric: rubricKeySchema,
        posts: count,
        comments: count,
        xComments: ratio,
        kinds: z.record(rubricCommentKindSchema, count),
        topics: z.array(z.object({ label: z.string().max(40), count })).max(6),
        quote: z.string().max(120).nullable(),
        limited: z.boolean()
      })
    )
    .max(40),
  weekTopics: z.array(z.object({ label: z.string().max(40), count, kind: rubricCommentKindSchema.nullable() })).max(12)
});
export type RubricComments = z.infer<typeof rubricCommentsSchema>;

const hourGroupSchema = z.enum(['wd', 'we', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

/**
 * GET /api/v1/rubric-analytics/learning: four weeks of advice from the first scored post, then the rests and hours
 * change themselves unless the owner turned that off (`off`). Minutes are Moscow minutes after midnight.
 */
export const rubricLearningSchema = z.object({
  mode: z.enum(['advise', 'apply', 'off']),
  startedAt: z.iso.datetime().nullable(),
  applyFrom: z.iso.datetime().nullable(),
  applyEnabled: z.boolean(),
  rest: z
    .array(
      z.object({
        rubric: rubricKeySchema,
        restDays: z.number().int().min(7).max(60),
        source: z.enum(['default', 'learned', 'manual']),
        advice: z.object({ toDays: z.number().int().min(7).max(60), reason: z.enum(['better', 'worse']) }).nullable(),
        /** Fewer than four scored posts: no advice yet. */
        few: z.boolean(),
        history: z
          .array(
            z.object({
              at: z.iso.datetime(),
              from: z.number().int(),
              to: z.number().int(),
              outcome: z.enum(['advised', 'applied', 'conflict', 'manual', 'out_of_range'])
            })
          )
          .max(5)
      })
    )
    .max(40),
  hours: z
    .array(
      z.object({
        group: hourGroupSchema,
        slots: z
          .array(
            z.object({
              part: z.enum(['day', 'evening']),
              minute: z.number().int().min(0).max(1439),
              defaultMinute: z.number().int().min(0).max(1439),
              source: z.enum(['default', 'learned', 'manual']),
              advice: z.object({ toMinute: z.number().int().min(0).max(1439) }).nullable()
            })
          )
          .max(2),
        n: z.number().int().nonnegative()
      })
    )
    .max(9)
});
export type RubricLearning = z.infer<typeof rubricLearningSchema>;

/** PUT /api/v1/rubric-analytics/learning: the switch; setting the same value changes nothing. */
export const updateRubricLearningInputSchema = z.strictObject({ applyEnabled: z.boolean() });
export type UpdateRubricLearningInput = z.infer<typeof updateRubricLearningInputSchema>;
