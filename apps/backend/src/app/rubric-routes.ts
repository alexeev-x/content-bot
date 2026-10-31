import {
  type RubricForecastDto,
  rubricCalendarQuerySchema,
  rubricKeyParamsSchema,
  rubricSlotParamsSchema,
  skipRubricSlotInputSchema,
  updateRubricInputSchema,
  updateRubricSchedulerInputSchema
} from '@alexeev/contracts';
import { Hono } from 'hono';
import { readForecast } from '../modules/rubric-scheduler';
import { getOwnerOperationsSettings, saveOwnerOperationsSettings } from '../modules/settings';
import { AppError } from '../shared/app-error';
import type { Container } from './container';
import type { AppBindings } from './env';
import { rateLimit } from './rate-limit';
import { rubricCapabilities, rubricDescriptors } from './rubric-catalog';
import type { LabSwitches } from './rubric-scheduler/locks';
import { readCalendar, readRubricList, readSchedulerStatus, readSlotDetail } from './rubric-scheduler/read-models';
import { channelPosts } from './rubric-scheduler/channel-posts';
import { skipSlot, updateRubric, updateScheduler } from './rubric-scheduler/owner-actions';
import { type SchedulerEnv, schedulerMode } from './rubric-scheduler/runtime';
import { readRehearsal, readRubricHistory } from './rubric-scheduler/read-history';
import { limitBody, validated } from './validation';

// «Рубрики» (rubric scheduler): its state and switch, its slots, every rubric and the 35-day forecast. Thin handlers:
// the reads are app/rubric-scheduler/read-models.ts, the owner's changes app/rubric-scheduler/owner-actions.ts.

const READS_PER_MINUTE = 60;
const MINUTE_MS = 60_000;
const MAX_BODY_BYTES = 1024;
const CALENDAR_SPAN_DAYS = 42;

const iso = (ms: number) => new Date(ms).toISOString();

/** DEV's «Фоновые задачи»: the master switch and the «Рубрики» job; production has none (the Cron passes no lab there either). */
const labSwitches =
  (container: Container, requestId: string): LabSwitches =>
  async () => {
    const { background } = await getOwnerOperationsSettings({
      repo: container.settings,
      logger: container.logger,
      requestId
    });
    return { master: background.enabled, job: background.jobs.rubricScheduler };
  };

/** The status, with «Старт»'s first slot taken from the forecast while no slot exists yet. */
async function readStatus(container: Container, env: SchedulerEnv, requestId: string) {
  const status = await readSchedulerStatus(container, labSwitches(container, requestId));
  if (status.firstSlot !== null || status.mode === 'forecast_only') return status;
  const first = (await computeForecast(container, env)).days.flatMap((day) => day.slots)[0];
  return first === undefined ? status : { ...status, firstSlot: { rubricKey: first.rubricKey, at: first.at } };
}

async function computeForecast(container: Container, env: SchedulerEnv): Promise<RubricForecastDto> {
  const now = container.clock.now();
  const forecast = await readForecast({
    now,
    sources: {
      rubrics: rubricDescriptors,
      capabilities: rubricCapabilities(env),
      latestPatchAt: () => container.latestPatchAt(),
      // The channel as the tick sees it: the news counts, the owner's posts only keep the gap.
      channelPosts: async (since) => {
        const id = (await container.rubricSchedulerSettings.read()).destinationId;
        const destination = id === null ? null : await container.destinations.findById(id);
        return destination === null ? [] : channelPosts(container, destination, new Set(), now, since);
      }
    }
  });
  return {
    from: forecast.from,
    until: forecast.until,
    computedAt: iso(forecast.computedAt),
    days: forecast.days.map((day) => ({
      date: day.date,
      slots: day.slots.map((slot) => ({
        rubricKey: slot.rubric as RubricForecastDto['days'][number]['slots'][number]['rubricKey'],
        at: iso(slot.at),
        hasPicture: slot.hasPicture,
        hasPoll: slot.hasPoll,
        reason: slot.reason
      }))
    })),
    unavailable: forecast.ineligible.map((each) => ({
      rubricKey: each.rubric as RubricForecastDto['unavailable'][number]['rubricKey'],
      missing: each.missing
    }))
  };
}

export const rubricRoutes = new Hono<AppBindings>()
  .use(rateLimit({ name: 'rubrics:read', limit: READS_PER_MINUTE, windowMs: MINUTE_MS }))
  .get('/status', async (c) => {
    const container = c.get('container');
    return c.json(await readStatus(container, c.env, c.get('requestId')));
  })
  .put('/scheduler', limitBody(MAX_BODY_BYTES), validated('json', updateRubricSchedulerInputSchema), async (c) => {
    const container = c.get('container');
    await updateScheduler(container, c.req.valid('json'));
    return c.json(await readStatus(container, c.env, c.get('requestId')));
  })
  // «Включить всё нужное на DEV»: the lab master switch and the «Рубрики» job. The rehearsal mode is DEV's alone.
  .post('/dev-enable', async (c) => {
    const container = c.get('container');
    if (schedulerMode(container.schedulerEnv) !== 'rehearsal')
      throw new AppError('NOT_FOUND', 'Not found', { reason: 'NOT_HERE' });
    const requestId = c.get('requestId');
    const deps = { repo: container.settings, logger: container.logger, requestId };
    const current = await getOwnerOperationsSettings(deps);
    if (!current.background.enabled || !current.background.jobs.rubricScheduler)
      await saveOwnerOperationsSettings(
        { ...deps, now: container.clock.now() },
        {
          actor: c.get('actor').telegramId,
          input: {
            revision: current.revision,
            timezone: current.timezone,
            notifications: current.notifications,
            background: { enabled: true, jobs: { ...current.background.jobs, rubricScheduler: true } }
          }
        }
      );
    return c.json(await readStatus(container, c.env, requestId));
  })
  .get('/calendar', validated('query', rubricCalendarQuerySchema), async (c) => {
    const { from, to } = c.req.valid('query');
    const span = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (span < 0 || span > CALENDAR_SPAN_DAYS)
      throw new AppError('VALIDATION_ERROR', 'The calendar spans at most 42 days', { reason: 'SPAN' });
    return c.json(await readCalendar(c.get('container'), from, to));
  })
  .get('/forecast', async (c) => {
    const body = await computeForecast(c.get('container'), c.env);
    c.header('Cache-Control', 'private, max-age=300');
    return c.json(body);
  })
  .get('/slots/:id', validated('param', rubricSlotParamsSchema), async (c) => {
    const detail = await readSlotDetail(c.get('container'), c.req.valid('param').id);
    if (detail === null) throw new AppError('NOT_FOUND', 'Slot not found', { reason: 'SLOT_NOT_FOUND' });
    return c.json(detail);
  })
  .post(
    '/slots/:id/skip',
    limitBody(MAX_BODY_BYTES),
    validated('param', rubricSlotParamsSchema),
    validated('json', skipRubricSlotInputSchema),
    async (c) => {
      const container = c.get('container');
      await skipSlot(container, c.req.valid('param').id);
      const detail = await readSlotDetail(container, c.req.valid('param').id);
      return c.json(detail);
    }
  )
  .get('/rehearsal', async (c) => {
    try {
      return c.json(await readRehearsal(c.get('container')));
    } catch (error) {
      if (error instanceof Error && /no such table/i.test(error.message))
        throw new AppError('UNAVAILABLE', 'The rehearsal journal is missing', { reason: 'MIGRATION_PENDING' });
      throw error;
    }
  })
  .get('/:key/slots', validated('param', rubricKeyParamsSchema), async (c) =>
    c.json(await readRubricHistory(c.get('container'), c.req.valid('param').key))
  )
  .get('/', async (c) => c.json({ items: await readRubricList(c.get('container')) }))
  .patch(
    '/:key',
    limitBody(MAX_BODY_BYTES),
    validated('param', rubricKeyParamsSchema),
    validated('json', updateRubricInputSchema),
    async (c) => {
      const container = c.get('container');
      const { key } = c.req.valid('param');
      await updateRubric(container, key, c.req.valid('json'));
      const item = (await readRubricList(container)).find((each) => each.key === key);
      if (item === undefined) throw new AppError('NOT_FOUND', 'Rubric not found', { reason: 'RUBRIC_NOT_FOUND' });
      return c.json(item);
    }
  );
