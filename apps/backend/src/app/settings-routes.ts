import { updateOwnerOperationsSettingsInputSchema, updateAppearanceInputSchema } from '@alexeev/contracts';
import { Hono } from 'hono';
import {
  getAppearance,
  getOwnerOperationsSettings,
  saveAppearance,
  saveOwnerOperationsSettings
} from '../modules/settings';
import type { AppBindings } from './env';
import { limitBody, validated } from './validation';

const MAX_BODY_BYTES = 8 * 1024;

// Issues raised by updateAppearanceInputSchema's superRefine; the client branches on `details.reason`.
const APPEARANCE_REASONS = ['DUPLICATE_PRESET_ID', 'UNKNOWN_CUSTOM_PRESET'] as const;

export const settingsRoutes = new Hono<AppBindings>()
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
