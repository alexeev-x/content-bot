import {
  automationIdSchema,
  automationListSchema,
  automationMutationSchema,
  automationRunsPageSchema,
  automationRunsQuerySchema,
  automationSummarySchema,
  automationTransitionInputSchema,
  runAutomationNowInputSchema,
  runAutomationNowResponseSchema
} from '@alexeev/contracts';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { completeIdempotencyStatement, type IdempotencyKeyRef } from '../platform/idempotency/d1-idempotency-store';
import { sha256Hex } from '../platform/security/sha256';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { limitBody, validated } from './validation';

const idParamsSchema = z.object({ automationId: z.string().min(1).max(64) });
const idempotencyKeySchema = z.object({ 'idempotency-key': z.string().trim().min(1).max(128) });

async function claimMutation(input: {
  db: D1Database;
  idempotency: AppBindings['Variables']['container']['idempotency'];
  actor: string;
  key: string;
  request: unknown;
  now: number;
}) {
  const requestHash = await sha256Hex(JSON.stringify(input.request));
  const claim = await input.idempotency.claim(input.actor, input.key, requestHash, input.now);
  if (claim.kind === 'reused')
    throw new AppError('CONFLICT', 'Idempotency key was already used for another request', {
      reason: 'IDEMPOTENCY_KEY_REUSED'
    });
  if (claim.kind === 'in_flight')
    throw new AppError('CONFLICT', 'This request is still in progress', { reason: 'IN_FLIGHT' });
  if (claim.kind === 'replay') {
    let body: unknown;
    try {
      body = JSON.parse(claim.responseBody) as unknown;
    } catch {
      throw new AppError('UNAVAILABLE', 'Stored idempotent response is invalid');
    }
    return { replay: true as const, status: claim.responseStatus, body };
  }
  const ref: IdempotencyKeyRef = {
    scope: input.actor,
    key: input.key,
    requestHash,
    claimedAt: input.now
  };
  return { replay: false as const, ref };
}

async function completeMutation(
  db: D1Database,
  ref: IdempotencyKeyRef,
  status: number,
  body: unknown,
  now: number
): Promise<void> {
  const result = await db.batch([completeIdempotencyStatement(db, ref, { status, body: JSON.stringify(body) }, now)]);
  if (result[0]?.meta.changes !== 1) throw new AppError('CONFLICT', 'Idempotency claim expired');
}

export const automationsRoutes = new Hono<AppBindings>()
  .get('/', validated('query', automationRunsQuerySchema), async (c) => {
    const container = c.get('container');
    if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
    const { cursor, limit } = c.req.valid('query');
    const all = await container.automations.list(container.clock.now());
    const start = cursor === undefined ? 0 : all.findIndex((item) => item.id === cursor) + 1;
    if (cursor !== undefined && start === 0) throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
    const items = all.slice(start, start + limit);
    const hasMore = start + items.length < all.length;
    return c.json(automationListSchema.parse({ items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null }));
  })
  .get('/:automationId', validated('param', idParamsSchema), async (c) => {
    const container = c.get('container');
    if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
    const automation = await container.automations.get(
      supportedAutomationId(c.req.valid('param').automationId),
      container.clock.now()
    );
    if (automation === null) throw new AppError('NOT_FOUND', 'Automation not found');
    return c.json(automationSummarySchema.parse(automation));
  })
  .get(
    '/:automationId/runs',
    validated('param', idParamsSchema),
    validated('query', automationRunsQuerySchema),
    async (c) => {
      const container = c.get('container');
      if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
      const result = await container.automations.listRuns({
        id: supportedAutomationId(c.req.valid('param').automationId),
        ...c.req.valid('query')
      });
      return c.json(automationRunsPageSchema.parse(result));
    }
  )
  .post(
    '/:automationId/pause',
    limitBody(4096),
    validated('param', idParamsSchema),
    validated('header', idempotencyKeySchema),
    validated('json', automationTransitionInputSchema),
    (c) => handleTransition(c, false)
  )
  .post(
    '/:automationId/resume',
    limitBody(4096),
    validated('param', idParamsSchema),
    validated('header', idempotencyKeySchema),
    validated('json', automationTransitionInputSchema),
    (c) => handleTransition(c, true)
  )
  .post(
    '/:automationId/run-now',
    limitBody(4096),
    validated('param', idParamsSchema),
    validated('header', idempotencyKeySchema),
    validated('json', runAutomationNowInputSchema),
    async (c) => {
      const container = c.get('container');
      const db = c.env.DB;
      if (db === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
      const automationId = supportedAutomationId(c.req.valid('param').automationId);
      const now = container.clock.now();
      const claim = await claimMutation({
        db,
        idempotency: container.idempotency,
        actor: c.get('actor').telegramId,
        key: c.req.valid('header')['idempotency-key'],
        request: { automationId, action: 'run-now' },
        now
      });
      if (claim.replay) return c.json(runAutomationNowResponseSchema.parse(claim.body), claim.status as 202);
      try {
        const result = await container.automations.enqueueManual({
          id: automationId,
          actor: c.get('actor').telegramId,
          now,
          newId: container.newId
        });
        const body = runAutomationNowResponseSchema.parse(result);
        await completeMutation(db, claim.ref, 202, body, now);
        return c.json(body, 202);
      } catch (error) {
        await container.idempotency.release(claim.ref);
        throw error;
      }
    }
  );

async function handleTransition(c: Context<AppBindings>, enabled: boolean): Promise<Response> {
  const container = c.get('container');
  const db = c.env.DB;
  if (db === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
  const pathId = c.req.param('automationId');
  if (pathId === undefined) throw new AppError('NOT_FOUND', 'Automation not found');
  const automationId = supportedAutomationId(pathId);
  const input = automationTransitionInputSchema.parse(await c.req.json());
  const headers = idempotencyKeySchema.parse({ 'idempotency-key': c.req.header('idempotency-key') });
  const now = container.clock.now();
  const claim = await claimMutation({
    db,
    idempotency: container.idempotency,
    actor: c.get('actor').telegramId,
    key: headers['idempotency-key'],
    request: { automationId, action: enabled ? 'resume' : 'pause', ...input },
    now
  });
  if (claim.replay) return c.json(automationMutationSchema.parse(claim.body), claim.status as 200);
  try {
    const result = await container.automations.transition({
      id: automationId,
      enabled,
      revision: input.revision,
      actor: c.get('actor').telegramId,
      now
    });
    const body = automationMutationSchema.parse(result);
    await completeMutation(db, claim.ref, 200, body, now);
    return c.json(body, 200);
  } catch (error) {
    await container.idempotency.release(claim.ref);
    throw error;
  }
}

function supportedAutomationId(value: string): z.infer<typeof automationIdSchema> {
  const parsed = automationIdSchema.safeParse(value);
  if (!parsed.success) throw new AppError('NOT_FOUND', 'Automation not found');
  return parsed.data;
}
