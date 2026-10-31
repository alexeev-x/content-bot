import {
  type AutopublishActivityDto,
  type OwnerOperationsSettingsDto,
  updateOwnerOperationsSettingsInputSchema,
  updateAppearanceInputSchema
} from '@alexeev/contracts';
import { Hono } from 'hono';
import {
  getAppearance,
  getOwnerOperationsSettings,
  saveAppearance,
  saveOwnerOperationsSettings
} from '../modules/settings';
import type { AppBindings } from './env';
import { limitBody, validated } from './validation';
import { AUTOPUBLISH_ACTOR } from './workflows/autopublish-source-event';
import { z } from 'zod';
import type { Container } from './container';
import { schedulerMode } from './rubric-scheduler/runtime';

const MAX_BODY_BYTES = 8 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

// Issues raised by updateAppearanceInputSchema's superRefine; the client branches on `details.reason`.
const APPEARANCE_REASONS = ['DUPLICATE_PRESET_ID', 'UNKNOWN_CUSTOM_PRESET'] as const;

type NewsBlockers = AutopublishActivityDto['blockers'];

// What keeps Valve's news from going out by itself now. The «Источники» job is gated only on DEV (production's Cron
// has no lab), where DEV is the rehearsal mode.
async function newsBlockers(container: Container, settings: OwnerOperationsSettingsDto): Promise<NewsBlockers> {
  const blockers: NewsBlockers = [];
  const { autopublish, background } = settings;
  if (!autopublish.enabled) blockers.push({ code: 'NEWS_OFF', fix: 'ENABLE_NEWS' });
  if (autopublish.destinationId === null) blockers.push({ code: 'NEWS_NO_DESTINATION', fix: 'PICK_CHANNEL' });
  else {
    const destination = await container.destinations.findById(autopublish.destinationId);
    if (destination === null || !destination.enabled)
      blockers.push({ code: 'NEWS_CHANNEL_DISABLED', fix: 'PICK_CHANNEL' });
  }
  if (schedulerMode(container.schedulerEnv) === 'rehearsal') {
    if (!background.enabled) blockers.push({ code: 'NEWS_SOURCES_JOB_OFF', fix: 'ENABLE_LAB_MASTER' });
    else if (!background.jobs.sources) blockers.push({ code: 'NEWS_SOURCES_JOB_OFF', fix: 'ENABLE_SOURCES_JOB' });
  }
  return blockers;
}

export const settingsRoutes = new Hono<AppBindings>()
  // What the automatic publishing did in the last 24 hours (owner, 24.10.2026); read-only.
  .get('/autopublish/activity', validated('query', z.strictObject({})), async (c) => {
    const container = c.get('container');
    const now = container.clock.now();
    const [settings, usedToday, items] = await Promise.all([
      getOwnerOperationsSettings({ repo: container.settings, logger: container.logger, requestId: c.get('requestId') }),
      container.publications.countCreatedBy(AUTOPUBLISH_ACTOR, now - DAY_MS),
      container.autopublishLog.list(now)
    ]);
    const body: AutopublishActivityDto = {
      enabled: settings.autopublish.enabled,
      dailyLimit: settings.autopublish.dailyLimit,
      usedToday,
      blockers: await newsBlockers(container, settings),
      items
    };
    return c.json(body);
  })
  .get('/operations', async (c) => {
    const container = c.get('container');
    return c.json(
      await getOwnerOperationsSettings({
        repo: container.settings,
        logger: container.logger,
        requestId: c.get('requestId')
      })
    );
  })
  .put(
    '/operations',
    limitBody(MAX_BODY_BYTES),
    validated('json', updateOwnerOperationsSettingsInputSchema),
    async (c) => {
      const container = c.get('container');
      return c.json(
        await saveOwnerOperationsSettings(
          {
            repo: container.settings,
            logger: container.logger,
            requestId: c.get('requestId'),
            now: container.clock.now()
          },
          { actor: c.get('actor').telegramId, input: c.req.valid('json') }
        )
      );
    }
  )
  .get('/appearance', async (c) => {
    const container = c.get('container');
    return c.json(
      await getAppearance({ repo: container.settings, logger: container.logger, requestId: c.get('requestId') })
    );
  })
  .put(
    '/appearance',
    limitBody(MAX_BODY_BYTES),
    validated('json', updateAppearanceInputSchema, { reasons: APPEARANCE_REASONS }),
    async (c) => {
      const container = c.get('container');
      const appearance = await saveAppearance(
        {
          repo: container.settings,
          logger: container.logger,
          requestId: c.get('requestId'),
          now: container.clock.now()
        },
        { actor: c.get('actor').telegramId, input: c.req.valid('json') }
      );
      return c.json(appearance);
    }
  );
