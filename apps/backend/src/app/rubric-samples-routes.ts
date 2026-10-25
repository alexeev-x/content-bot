import { sendRubricSampleInputSchema, sendRubricSampleResponseSchema } from '@alexeev/contracts';
import { Hono } from 'hono';
import { type BrowserBinding, createBrowserPictureRenderer } from '../integrations/browser-render/browser-render';
import { createTelegramApi } from '../integrations/telegram/telegram-api';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { rateLimit } from './rate-limit';
import { validated } from './validation';
import { sendRubricSample } from './workflows/rubric-samples';

// Each press is up to five data calls (GitHub, Valve, Steam), one browser screenshot (of 10 free minutes a day) and two messages.
const SAMPLES_LIMIT = 40;
const SAMPLES_WINDOW_MS = 10 * 60 * 1000;

const isBrowserBinding = (value: unknown): value is BrowserBinding =>
  typeof value === 'object' && value !== null && typeof (value as { quickAction?: unknown }).quickAction === 'function';

export const rubricSamplesRoutes = new Hono<AppBindings>()
  // DEV only (owner, 25.10.2026): a rubric's post from live data, to the owner's chat with the bot.
  .post(
    '/',
    rateLimit({ name: 'rubric-samples', limit: SAMPLES_LIMIT, windowMs: SAMPLES_WINDOW_MS }),
    validated('json', sendRubricSampleInputSchema),
    async (c) => {
      if (c.env.RUBRIC_SAMPLES !== 'true') {
        throw new AppError('FORBIDDEN', 'Rubric samples are off here', { reason: 'RUBRIC_SAMPLES_OFF' });
      }
      const container = c.get('container');
      const token = container.botToken;
      const ownerChatId = container.ownerChatId;
      if (token === null || ownerChatId === null) {
        throw new AppError('UNAVAILABLE', 'The bot or the owner chat is not configured', {
          reason: 'BOT_NOT_CONFIGURED'
        });
      }
      const browser: unknown = c.env.BROWSER;
      const { rubric } = c.req.valid('json');
      const result = await sendRubricSample(
        {
          gameFilesRepo: container.gameFilesRepo,
          // A token pasted with its quotes is the same token.
          stratzToken: c.env.STRATZ_TOKEN?.trim().replace(/^["']+|["']+$/g, '') || null,
          renderer: isBrowserBinding(browser) ? createBrowserPictureRenderer(browser) : null,
          telegram: createTelegramApi(token),
          ownerChatId,
          random: container.random,
          now: container.clock.now(),
          logger: container.logger,
          requestId: c.get('requestId')
        },
        rubric
      );
      return c.json(sendRubricSampleResponseSchema.parse({ rubric, ...result }));
    }
  );
