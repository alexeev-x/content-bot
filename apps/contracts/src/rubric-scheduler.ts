import { z } from 'zod';
import { rubricKeySchema } from './rubric-keys';

// «Рубрики» (rubric scheduler, docs/scheduler/MASTER-PLAN.md): the scheduler's state and its 35-day forecast. Owner
// only; instants are UTC ISO, days Moscow `YYYY-MM-DD`. Errors: UNAUTHORIZED 401, FORBIDDEN 403, RATE_LIMIT 429.

export const rubricNeedSchema = z.enum(['browser', 'ai_text', 'ai_image', 'ai_upscale', 'stratz', 'stats_db']);
export type RubricNeed = z.infer<typeof rubricNeedSchema>;

const revisionSchema = z.number().int().nonnegative();

/** What stops the scheduler now; locks are state, never errors. */
export const rubricLockSchema = z.enum([
  'NOT_HERE',
  'NOT_BUILT',
  'SCHEMA',
  'SWITCHED_OFF',
  'LAB_OFF',
  'NO_DESTINATION',
  'DESTINATION_DISABLED',
  'REHEARSAL_DESTINATION',
  'PUBLISHING_OFF'
]);
export type RubricLock = z.infer<typeof rubricLockSchema>;

/**
 * GET /api/v1/rubrics/status. `live`: production posts to the chosen channel; `rehearsal`: DEV posts to the test channel
 * without AI; `forecast_only`: the scheduler only forecasts here. `capabilities` is what this Worker can run.
 */
export const rubricSchedulerStatusSchema = z.object({
  mode: z.enum(['live', 'rehearsal', 'unavailable', 'forecast_only']),
  enabled: z.boolean(),
  effective: z.enum(['running', 'switched_off', 'locked', 'unavailable']),
  locks: z.array(z.object({ code: rubricLockSchema })).max(20),
  /** The channel the rubrics go to (the test channel in rehearsal). */
  destination: z.object({ id: z.uuid(), title: z.string() }).nullable().default(null),
  liveSlots: z.number().int().nonnegative().default(0),
  next: z.object({ rubricKey: rubricKeySchema, at: z.iso.datetime() }).nullable().default(null),
  lastPlanAt: z.iso.datetime().nullable().default(null),
  /** Browser Rendering used by today's builds against the daily cap (Moscow day). */
  browserBudget: z.object({ usedMs: z.number().int().nonnegative(), capMs: z.number().int().positive() }).optional(),
  capabilities: z.object({ browser: z.boolean(), openai: z.boolean(), stratz: z.boolean(), statsDb: z.boolean() }),
  revision: revisionSchema.default(0),
  updatedAt: z.iso.datetime()
});
export type RubricSchedulerStatusDto = z.infer<typeof rubricSchedulerStatusSchema>;

export const forecastSlotSchema = z.object({
  rubricKey: rubricKeySchema,
  at: z.iso.datetime(),
  hasPicture: z.boolean(),
  hasPoll: z.boolean(),
  /** Why it goes then, in Russian: «Отдых 14 дн. прошёл», «Понедельник через неделю, 08:00». */
  reason: z.object({ kind: z.enum(['rest', 'anchor', 'event']), text: z.string().max(200) })
});
export type ForecastSlotDto = z.infer<typeof forecastSlotSchema>;

/** GET /api/v1/rubrics/forecast: the plan over 35 Moscow days against the channel as it is now; nothing is stored. */
export const rubricForecastSchema = z.object({
  from: z.iso.date(),
  until: z.iso.date(),
  computedAt: z.iso.datetime(),
  days: z.array(z.object({ date: z.iso.date(), slots: z.array(forecastSlotSchema).max(6) })).max(42),
  /** Rubrics this Worker cannot run, and what each lacks. */
  unavailable: z.array(z.object({ rubricKey: rubricKeySchema, missing: z.array(rubricNeedSchema).min(1) })).max(40)
});
export type RubricForecastDto = z.infer<typeof rubricForecastSchema>;

/**
 * PUT /api/v1/rubrics/scheduler: the switch and the channel. Off cancels the slots not yet released (their posts are
 * deleted); released ones finish. Errors: VALIDATION_ERROR 400 (details.reason DESTINATION_REQUIRED when switching on
 * without a channel), CONFLICT 409 (STALE_REVISION; UNAVAILABLE_HERE where the scheduler does not run).
 */
export const updateRubricSchedulerInputSchema = z.strictObject({
  enabled: z.boolean(),
  destinationId: z.uuid().nullable().optional(),
  revision: revisionSchema
});
export type UpdateRubricSchedulerInput = z.infer<typeof updateRubricSchedulerInputSchema>;

export const rubricSlotStateSchema = z.enum([
  'planned',
  'building',
  'ready',
  'released',
  'waiting_parent',
  'unknown',
  'sent',
  'partial',
  'unresolved',
  'send_failed',
  'missed',
  'empty',
  'skipped',
  'yielded',
  'cancelled',
  'superseded'
]);
export type RubricSlotState = z.infer<typeof rubricSlotStateSchema>;

export const rubricSlotSchema = z.object({
  id: z.uuid(),
  rubricKey: rubricKeySchema,
  at: z.iso.datetime(),
  state: rubricSlotStateSchema,
  hasPicture: z.boolean(),
  hasPoll: z.boolean(),
  reason: z.object({ kind: z.string().max(20), text: z.string().max(200) }),
  /** Why it failed or ended early, in Russian with its code and step. */
  detail: z.object({ code: z.string().max(80), step: z.string().max(20).nullable() }).nullable(),
  publicationId: z.uuid().nullable(),
  /** The fallbacks it may fall back to, best first. */
  candidates: z.array(rubricKeySchema).max(3)
});
export type RubricSlotDto = z.infer<typeof rubricSlotSchema>;

/** GET /api/v1/rubrics/calendar?from=&to= (MSK days, span ≤ 42): the real slots, every state. */
export const rubricCalendarQuerySchema = z.strictObject({ from: z.iso.date(), to: z.iso.date() });
export const rubricCalendarSchema = z.object({ slots: z.array(rubricSlotSchema).max(500) });
export type RubricCalendarDto = z.infer<typeof rubricCalendarSchema>;

export const rubricItemSchema = z.object({
  key: rubricKeySchema,
  /** active: may go out; paused: its bank ran out; unavailable: this Worker lacks what it needs; waiting: its rules
   * are not built yet (a later stage); off: the owner switched it off. */
  state: z.enum(['active', 'paused', 'unavailable', 'waiting', 'off']),
  missing: z.array(rubricNeedSchema).max(6),
  enabled: z.boolean(),
  hasPicture: z.boolean(),
  hasPoll: z.boolean(),
  rest: z
    .object({ baseDays: z.number().int(), days: z.number().int(), source: z.enum(['default', 'manual', 'learned']) })
    .nullable(),
  lastPostAt: z.iso.datetime().nullable(),
  /** The last post time is the start-up seed, not a real post. */
  lastPostSeeded: z.boolean(),
  next: z.object({ slotId: z.uuid(), at: z.iso.datetime() }).nullable(),
  revision: revisionSchema
});
export type RubricItemDto = z.infer<typeof rubricItemSchema>;

/** GET /api/v1/rubrics: every rubric with its state, rest, last post and next slot. */
export const rubricListSchema = z.object({ items: z.array(rubricItemSchema).max(40) });
export type RubricListDto = z.infer<typeof rubricListSchema>;

/**
 * PATCH /api/v1/rubrics/{key}: on/off and the rest in days (7–60; the owner's rest wins over the default). Turning a
 * rubric on makes it due at its next fitting slot. Errors: VALIDATION_ERROR 400, NOT_FOUND 404 (RUBRIC_NOT_FOUND),
 * CONFLICT 409 (STALE_REVISION).
 */
export const updateRubricInputSchema = z.strictObject({
  enabled: z.boolean().optional(),
  restDays: z.number().int().min(7).max(60).optional(),
  revision: revisionSchema
});
export type UpdateRubricInput = z.infer<typeof updateRubricInputSchema>;
export const rubricKeyParamsSchema = z.strictObject({ key: rubricKeySchema });

/** GET /api/v1/rubrics/slots/{id}: one slot with every attempt (step, code, message). Errors: NOT_FOUND 404. */
export const rubricSlotDetailSchema = rubricSlotSchema.extend({
  attempts: z
    .array(
      z.object({
        attempt: z.number().int(),
        step: z.string().max(20),
        rubricKey: rubricKeySchema,
        outcome: z.enum(['ok', 'failed', 'skipped', 'degraded']),
        code: z.string().max(80).nullable(),
        message: z.string().max(300).nullable(),
        at: z.iso.datetime()
      })
    )
    .max(50)
});
export type RubricSlotDetailDto = z.infer<typeof rubricSlotDetailSchema>;
export const rubricSlotParamsSchema = z.strictObject({ id: z.uuid() });

/**
 * POST /api/v1/rubrics/slots/{id}/skip, body {}: «Пропустить слот». A slot not yet released is cancelled (its posts
 * deleted) and the rubric keeps its turn; a released one is cancelled in «Публикации». Errors: NOT_FOUND 404,
 * CONFLICT 409 (details.reason ALREADY_RELEASED | NOT_LIVE).
 */
export const skipRubricSlotInputSchema = z.strictObject({});
