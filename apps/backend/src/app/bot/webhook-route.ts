import { webhookCallback } from 'grammy';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { timingSafeEqualStrings } from '../../platform/security/timing-safe-equal';
import { AppError } from '../../shared/app-error';
import type { AppBindings } from '../env';
import { createBot, readBotConfig } from './create-bot';

const MAX_UPDATE_BYTES = 256 * 1024;
const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

// Mounted at /webhooks: the only route without a session. Authenticity is the secret header.
export const telegramWebhook = new Hono<AppBindings>().post(
  '/telegram',
  bodyLimit({
    maxSize: MAX_UPDATE_BYTES,
    onError: (c) =>
      c.json(
        {
          error: {
            code: 'VALIDATION_ERROR' as const,
            message: 'Request body is too large',
            requestId: c.get('requestId'),
          },
        },
        413,
      ),
  }),
  async (c) => {
    // Authenticate first: without a configured secret there is no valid one, so an anonymous
    // caller gets 401 either way and cannot learn whether the bot is set up.
    const expectedSecret = c.env.TELEGRAM_WEBHOOK_SECRET ?? '';
    const provided = c.req.header(SECRET_HEADER) ?? '';
    if (expectedSecret === '' || !timingSafeEqualStrings(provided, expectedSecret)) {
      throw new AppError('UNAUTHORIZED', 'Invalid webhook secret');
    }

    const config = readBotConfig(c.env);
    if (!config) throw new AppError('UNAVAILABLE', 'Telegram bot is not configured');

    const bot = createBot(config);
    bot.catch((error) => {
      c.get('container').logger.error({
        component: 'bot',
        operation: 'handle_update',
        requestId: c.get('requestId'),
        errorCode: error.error instanceof Error ? error.error.name : 'unknown',
      });
    });
    return webhookCallback(bot, 'cloudflare-mod', { secretToken: config.webhookSecret })(c.req.raw);
  },
);
