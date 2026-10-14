import { z } from 'zod';
import { pageQuerySchema, pageSchema } from './pagination';

export const automationIdSchema = z.enum(['dota-intelligence', 'dota-hero-statistics']);
export type AutomationId = z.infer<typeof automationIdSchema>;

export const automationHealthSchema = z.enum(['healthy', 'stale', 'degraded', 'unverified']);
export type AutomationHealth = z.infer<typeof automationHealthSchema>;

export const automationExecutionStateSchema = z.enum(['idle', 'queued', 'running']);
export type AutomationExecutionState = z.infer<typeof automationExecutionStateSchema>;

export const automationRunStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'unknown', 'skipped']);
export type AutomationRunStatus = z.infer<typeof automationRunStatusSchema>;

export const automationRunOriginSchema = z.enum(['scheduled', 'manual']);
export type AutomationRunOrigin = z.infer<typeof automationRunOriginSchema>;

export const automationSideEffectSchema = z.enum([
  'persist_dota_updates',
  'create_review_draft',
  'send_private_alert',
  'persist_hero_snapshot'
]);

const utcInstantSchema = z.iso.datetime();
const nonnegativeCountSchema = z.number().int().nonnegative();

export const automationRunSchema = z.object({
  id: z.uuid(),
  automationId: automationIdSchema,
  origin: automationRunOriginSchema,
  status: automationRunStatusSchema,
  requestedAt: utcInstantSchema,
  scheduledAt: utcInstantSchema.nullable(),
  startedAt: utcInstantSchema.nullable(),
  completedAt: utcInstantSchema.nullable(),
  durationMs: nonnegativeCountSchema.nullable(),
  outputCount: nonnegativeCountSchema.nullable(),
  errorCode: z.string().min(1).max(80).nullable()
});
export type AutomationRunDto = z.infer<typeof automationRunSchema>;

export const automationSummarySchema = z.object({
  id: automationIdSchema,
  enabled: z.boolean(),
  revision: nonnegativeCountSchema,
  cron: z.string().min(1).max(100),
  cadenceMinutes: z.number().int().positive(),
  nextRunAt: utcInstantSchema.nullable(),
  health: automationHealthSchema,
  executionState: automationExecutionStateSchema,
  activeRunId: z.uuid().nullable(),
  lastRun: automationRunSchema.nullable(),
  runNowAllowed: z.boolean(),
  sideEffects: z.array(automationSideEffectSchema).max(4)
});
export type AutomationSummaryDto = z.infer<typeof automationSummarySchema>;

export const automationListSchema = pageSchema(automationSummarySchema);
export type AutomationListDto = z.infer<typeof automationListSchema>;

export const automationRunsQuerySchema = pageQuerySchema;
export type AutomationRunsQuery = z.infer<typeof automationRunsQuerySchema>;

export const automationRunsPageSchema = pageSchema(automationRunSchema);
export type AutomationRunsPageDto = z.infer<typeof automationRunsPageSchema>;

export const automationTransitionInputSchema = z.strictObject({
  revision: nonnegativeCountSchema
});
export type AutomationTransitionInput = z.infer<typeof automationTransitionInputSchema>;

export const automationMutationSchema = z.object({
  automation: automationSummarySchema,
  changed: z.boolean()
});
export type AutomationMutationDto = z.infer<typeof automationMutationSchema>;

export const runAutomationNowInputSchema = z.strictObject({});
export const runAutomationNowResponseSchema = z.object({ run: automationRunSchema, coalesced: z.boolean() });
export type RunAutomationNowResponseDto = z.infer<typeof runAutomationNowResponseSchema>;

// GET /api/v1/automations -> 200 AutomationListDto; owner-only, registered recurring tasks only.
// GET /api/v1/automations/:automationId -> 200 AutomationSummaryDto; owner-only.
// GET /api/v1/automations/:automationId/runs?cursor&limit -> 200 AutomationRunsPageDto; owner-only.
// POST /api/v1/automations/:automationId/pause|resume, Idempotency-Key, { revision } -> 200
// AutomationMutationDto. The revision check and audit write are atomic; pause blocks future claims only.
// POST /api/v1/automations/:automationId/run-now, Idempotency-Key, {} -> 202 RunAutomationNowResponseDto.
// It coalesces with an active run and is executed by the normal bounded D1 claim path; it never calls
// Telegram publication transport. Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403,
// CONFLICT 409 (stale revision, paused or unsafe run), NOT_FOUND 404, UNAVAILABLE 503.
