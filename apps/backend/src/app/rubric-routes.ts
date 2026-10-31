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
import { listRecentPublications } from '../modules/publishing';
import { type ChannelPost, readForecast } from '../modules/rubric-scheduler';
import { getOwnerOperationsSettings } from '../modules/settings';
import { AppError } from '../shared/app-error';
import type { Container } from './container';
import type { AppBindings } from './env';
import { rateLimit } from './rate-limit';
import { rubricCapabilities, rubricDescriptors } from './rubric-catalog';
import { readCalendar, readRubricList, readSchedulerStatus, readSlotDetail } from './rubric-scheduler/read-models';
import { skipSlot, updateRubric, updateScheduler } from './rubric-scheduler/owner-actions';
import { limitBody, validated } from './validation';

// «Рубрики» (rubric scheduler): its state and switch, its slots, every rubric and the 35-day forecast. Thin handlers:
// the reads are app/rubric-scheduler/read-models.ts, the owner's changes app/rubric-scheduler/owner-actions.ts.

const READS_PER_MINUTE = 60;
const MINUTE_MS = 60_000;
const MAX_BODY_BYTES = 1024;
const CALENDAR_SPAN_DAYS = 42;
const LIVE: readonly string[] = ['scheduled', 'queued', 'preparing', 'sending', 'retry_wait', 'sent', 'unknown'];

const iso = (ms: number) => new Date(ms).toISOString();

/** DEV's «Фоновые задачи» switch for the rehearsal; production has none (the Cron passes no lab there either). */
async function rehearsalSwitch(container: Container, requestId: string): Promise<boolean> {
  const { background } = await getOwnerOperationsSettings({
    repo: container.settings,
    logger: container.logger,
    requestId
  });
  return background.enabled && background.jobs.rubricScheduler;
}

export const rubricRoutes = new Hono<AppBindings>()
  .use(rateLimit({ name: 'rubrics:read', limit: READS_PER_MINUTE, windowMs: MINUTE_MS }))
  .get('/status', async (c) => {
    const container = c.get('container');
    return c.json(await readSchedulerStatus(container, () => rehearsalSwitch(container, c.get('requestId'))));
  })
  .put('/scheduler', limitBody(MAX_BODY_BYTES), validated('json', updateRubricSchedulerInputSchema), async (c) => {
    const container = c.get('container');
    await updateScheduler(container, c.req.valid('json'));
    return c.json(await readSchedulerStatus(container, () => rehearsalSwitch(container, c.get('requestId'))));
  })
  .get('/calendar', validated('query', rubricCalendarQuerySchema), async (c) => {
    const { from, to } = c.req.valid('query');
    const span = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (span < 0 || span > CALENDAR_SPAN_DAYS)
      throw new AppError('VALIDATION_ERROR', 'The calendar spans at most 42 days', { reason: 'SPAN' });
    return c.json(await readCalendar(c.get('container'), from, to));
  })
  .get('/forecast', async (c) => {
    const container = c.get('container');
    const now = container.clock.now();
    const forecast = await readForecast({
      now,
      sources: {
        rubrics: rubricDescriptors,
        capabilities: rubricCapabilities(c.env),
        latestPatchAt: () => container.latestPatchAt(),
        // Every publication counts, news and ours: the daily caps and the gaps are over the whole channel.
        channelPosts: async (since) =>
          (await listRecentPublications({ repo: container.publicationOutcomes, now }, since))
            .filter((row) => LIVE.includes(row.status))
            .map((row): ChannelPost => ({
              at: row.at,
              weight: row.hasMedia ? 'V' : 'L',
              rubric: null,
              interactive: row.postKind === 'poll',
              family: null
            }))
      }
    });
    const body: RubricForecastDto = {
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
