import { z } from 'zod';
import { rubricKeySchema } from './rubric-keys';

// «Рубрики» (rubric scheduler, docs/scheduler/MASTER-PLAN.md): the scheduler's state and its 35-day forecast. Owner
// only; instants are UTC ISO, days Moscow `YYYY-MM-DD`. Errors: UNAUTHORIZED 401, FORBIDDEN 403, RATE_LIMIT 429.

export const rubricNeedSchema = z.enum(['browser', 'ai_text', 'ai_image', 'ai_upscale', 'stratz', 'stats_db']);
export type RubricNeed = z.infer<typeof rubricNeedSchema>;

/**
 * GET /api/v1/rubrics/status. `forecast_only`: the scheduler only forecasts (its tables are not there yet); `rehearsal`:
 * DEV posts to the test channel without AI; `live`: production. `capabilities` is what this Worker can run.
 */
export const rubricSchedulerStatusSchema = z.object({
  mode: z.enum(['live', 'rehearsal', 'unavailable', 'forecast_only']),
  enabled: z.boolean(),
  effective: z.enum(['running', 'switched_off', 'locked', 'unavailable']),
  locks: z.array(z.object({ code: z.string().max(40) })).max(20),
  capabilities: z.object({ browser: z.boolean(), openai: z.boolean(), stratz: z.boolean(), statsDb: z.boolean() }),
  updatedAt: z.iso.datetime()
});
export type RubricSchedulerStatusDto = z.infer<typeof rubricSchedulerStatusSchema>;

export const forecastSlotSchema = z.object({
  rubricKey: rubricKeySchema,
  at: z.iso.datetime(),
  hasPicture: z.boolean(),
  hasPoll: z.boolean(),
  /** Why it goes then, in Russian: «Отдых 14 дн. прошёл», «Понедельник через неделю, 08:00». */
  reason: z.object({ kind: z.enum(['rest', 'anchor']), text: z.string().max(200) })
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
