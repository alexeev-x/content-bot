import type { RubricForecastDto, RubricSchedulerStatusDto } from '@alexeev/contracts';
import { Hono } from 'hono';
import { latestPatchPublishedAt } from '../modules/dota';
import { listRecentPublications } from '../modules/publishing';
import { readForecast, type ChannelPost } from '../modules/rubric-scheduler';
import type { AppBindings } from './env';
import { rateLimit } from './rate-limit';
import { rubricCapabilities, rubricDescriptors } from './rubric-catalog';

// «Рубрики» (rubric scheduler stage 3): the scheduler's state, read-only, and its 35-day forecast. Until stage 4 adds
// its tables the scheduler only forecasts; the status says so instead of pretending to run.

const READS_PER_MINUTE = 60;
const MINUTE_MS = 60_000;
const LIVE: readonly string[] = ['scheduled', 'queued', 'preparing', 'sending', 'retry_wait', 'sent', 'unknown'];

const iso = (ms: number) => new Date(ms).toISOString();

export const rubricRoutes = new Hono<AppBindings>()
  .use(rateLimit({ name: 'rubrics:read', limit: READS_PER_MINUTE, windowMs: MINUTE_MS }))
  .get('/status', (c) => {
    const container = c.get('container');
    const capabilities = rubricCapabilities(c.env);
    const body: RubricSchedulerStatusDto = {
      mode: 'forecast_only',
      enabled: false,
      effective: 'unavailable',
      locks: [{ code: 'NOT_BUILT' }],
      capabilities: {
        browser: capabilities.has('browser'),
        openai: capabilities.has('ai_text'),
        stratz: capabilities.has('stratz'),
        statsDb: capabilities.has('stats_db')
      },
      updatedAt: iso(container.clock.now())
    };
    return c.json(body);
  })
  .get('/forecast', async (c) => {
    const container = c.get('container');
    const now = container.clock.now();
    const forecast = await readForecast({
      now,
      sources: {
        rubrics: rubricDescriptors,
        capabilities: rubricCapabilities(c.env),
        latestPatchAt: () => latestPatchPublishedAt(c.env.DB),
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
  });
