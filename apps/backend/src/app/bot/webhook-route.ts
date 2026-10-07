import { webhookCallback } from 'grammy';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createPost } from '../../modules/content';
import { timingSafeEqualStrings } from '../../platform/security/timing-safe-equal';
import { AppError } from '../../shared/app-error';
import type { AppBindings } from '../env';
import { appOriginOf } from './app-origin';
import { createBot, loadBotSetup } from './create-bot';
import { createOwnerReports } from './owner-reports';
import { createTelegramCaller } from './telegram-call';

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
            requestId: c.get('requestId')
          }
        },
        413
      )
  }),
  async (c) => {
    // Authenticate first: without a configured secret there is no valid one, so an anonymous
    // caller gets 401 either way and cannot learn whether the bot is set up.
    const expectedSecret = c.env.TELEGRAM_WEBHOOK_SECRET ?? '';
    const provided = c.req.header(SECRET_HEADER) ?? '';
    if (expectedSecret === '' || !timingSafeEqualStrings(provided, expectedSecret)) {
      throw new AppError('UNAUTHORIZED', 'Invalid webhook secret');
    }

    // The identity is a BOT_INFO override or the row connect stored: one lookup, never a getMe per update.
    const container = c.get('container');
    const { config } = await loadBotSetup(c.env, container.botIdentity, {
      logger: container.logger,
      requestId: c.get('requestId')
    });
    if (!config) throw new AppError('UNAVAILABLE', 'Telegram bot is not configured');

    const appOrigin = appOriginOf(c.req.url);
    // Built when a command asks, so an update that needs no report never reaches for the stores.
    const reports = () =>
      createOwnerReports({
        clock: container.clock,
        appOrigin,
        publications: container.publications,
        incidents: container.dispatchJobs,
        posts: container.postRevisions,
        cron: container.systemState,
        publishing: container.publishing
      });
    const bot = createBot(config, {
      appOrigin,
      clock: container.clock,
      updates: { claim: (updateId, now) => container.webhookUpdates.claim(updateId, now) },
      reports: {
        today: () => reports().today(),
        next: () => reports().next(),
        status: () => reports().status()
      },
      createDraft: async (input, idempotencyKey) =>
        createPost(
          {
            repo: container.posts,
            idempotency: container.idempotency,
            now: container.clock.now(),
            newId: container.newId
          },
          { actor: String(config.ownerId), idempotencyKey, input }
        ),
      rememberAppOrigin: (origin) => container.systemState.rememberAppOrigin(origin, container.clock.now()),
      adminApi: container.botAdminApi,
      call: createTelegramCaller({ logger: container.logger, requestId: c.get('requestId') }),
      waitUntil: (work) => c.executionCtx.waitUntil(work),
      onError: (error) => {
        container.logger.error({
          component: 'bot',
          operation: 'handle_update',
          requestId: c.get('requestId'),
          errorCode: error instanceof Error ? error.name : 'unknown'
        });
      }
    });
    return webhookCallback(bot, 'cloudflare-mod', { secretToken: config.webhookSecret })(c.req.raw);
  }
);
