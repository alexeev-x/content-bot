import {
  addDotaWatchlistInputSchema,
  type DotaWatchDto,
  type DotaWatchKey,
  dotaUpdateParamsSchema,
  listDotaIntelligenceQuerySchema
} from '@alexeev/contracts';
import type { WatchCheckRow } from '../modules/game-files';
import { Hono } from 'hono';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { validated } from './validation';
import { limitBody } from './validation';
import { z } from 'zod';

const watchIdParamsSchema = z.object({ watchId: z.uuid() });
/** Both watches run every Dota run (5 minutes): a success older than this means the runs stopped. */
const WATCH_STALE_MS = 30 * 60_000;

function watchDto(key: DotaWatchKey, check: WatchCheckRow | undefined, now: number): DotaWatchDto {
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
  if (check === undefined)
    return { key, lastAttemptAt: null, lastSuccessAt: null, health: 'unverified', lastError: null };
  const failed = check.errorCode !== null;
  return {
    key,
    lastAttemptAt: iso(check.lastAttemptAt),
    lastSuccessAt: iso(check.lastSuccessAt),
    health: failed
      ? 'degraded'
      : check.lastSuccessAt === null || now - check.lastSuccessAt > WATCH_STALE_MS
        ? 'stale'
        : 'healthy',
    lastError:
      check.errorCode === null
        ? null
        : {
            code: check.errorCode,
            httpStatus: null,
            detail: '',
            at: new Date(check.lastAttemptAt).toISOString(),
            consecutiveFailures: Math.max(1, check.consecutiveFailures),
            lastSuccessAt: iso(check.lastSuccessAt)
          }
  };
}
const idempotencyKeySchema = z.object({ 'idempotency-key': z.string().trim().min(1).max(128) });

export const dotaRoutes = new Hono<AppBindings>()
  .get('/', validated('query', listDotaIntelligenceQuerySchema), async (c) => {
    const container = c.get('container');
    if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
    const now = container.clock.now();
    const [intelligence, checks] = await Promise.all([
      container.dotaRepository.listIntelligence({ ...c.req.valid('query'), now }),
      container.watchChecks.list()
    ]);
    // The game-files watch exists only with its token; Steam's needs none.
    const keys: DotaWatchKey[] = container.gameFilesRepo === null ? ['steam_apps'] : ['game_files', 'steam_apps'];
    const watches: DotaWatchDto[] = keys.map((key) =>
      watchDto(
        key,
        checks.find((check) => check.key === key),
        now
      )
    );
    return c.json({ ...intelligence, watches });
  })
  .get('/updates/:sourceKey/:externalId', validated('param', dotaUpdateParamsSchema), async (c) => {
    const container = c.get('container');
    if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
    const detail = await container.dotaRepository.getUpdateDetail(c.req.valid('param'));
    if (detail === null) throw new AppError('NOT_FOUND', 'Dota update not found');
    return c.json(detail);
  })
  .get('/watchlists', validated('query', z.strictObject({})), async (c) => {
    const container = c.get('container');
    if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
    return c.json(await container.dotaWatchlists.list());
  })
  .post(
    '/watchlists',
    limitBody(4096),
    validated('header', idempotencyKeySchema),
    validated('json', addDotaWatchlistInputSchema),
    async (c) => {
      const container = c.get('container');
      if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
      const result = await container.dotaWatchlists.add({
        actor: c.get('actor').telegramId,
        key: c.req.valid('header')['idempotency-key'],
        rawInput: c.req.valid('json'),
        now: container.clock.now(),
        newId: container.newId,
        idempotency: container.idempotency
      });
      return c.json(result.body, result.status);
    }
  )
  .delete('/watchlists/:watchId', validated('param', watchIdParamsSchema), async (c) => {
    const container = c.get('container');
    if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
    await container.dotaWatchlists.remove(c.req.valid('param').watchId, container.clock.now());
    return c.body(null, 204);
  });
