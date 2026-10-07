import { connectBotInputSchema } from '@alexeev/contracts';
import { type Context, Hono } from 'hono';
import { appOriginOf } from './bot/app-origin';
import { type BotConnectionDeps, connectBot, getBotStatus } from './bot/bot-connection';
import { createTelegramCaller } from './bot/telegram-call';
import type { AppBindings } from './env';
import { rateLimit } from './rate-limit';
import { limitBody, validated } from './validation';

const MAX_BODY_BYTES = 1024;
// Connecting is ten Telegram requests, a status check one; both are pressed by hand.
const CONNECT_LIMIT = 10;
const STATUS_LIMIT = 60;
const WINDOW_MS = 10 * 60 * 1000;

function connectionDeps(c: Context<AppBindings>): BotConnectionDeps {
  const container = c.get('container');
  return {
    env: c.env,
    appOrigin: appOriginOf(c.req.url),
    // Resolved lazily: without a token the status is answered without building a Telegram client.
    api: () => container.botAdminApi,
    call: createTelegramCaller({ logger: container.logger, requestId: c.get('requestId') }),
    identity: container.botIdentity,
    clock: container.clock,
    logger: container.logger,
    requestId: c.get('requestId')
  };
}

export const botRoutes = new Hono<AppBindings>()
  .get('/status', rateLimit({ name: 'bot-status', limit: STATUS_LIMIT, windowMs: WINDOW_MS }), async (c) =>
    c.json(await getBotStatus(connectionDeps(c)))
  )
  .post(
    '/connect',
    rateLimit({ name: 'bot-connect', limit: CONNECT_LIMIT, windowMs: WINDOW_MS }),
    limitBody(MAX_BODY_BYTES),
    validated('json', connectBotInputSchema),
    async (c) => c.json(await connectBot(connectionDeps(c)))
  );
