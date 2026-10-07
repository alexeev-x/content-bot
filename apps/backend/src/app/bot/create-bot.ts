import type { BotSetting } from '@alexeev/contracts';
import { Bot, type Context, InlineKeyboard, type NextFunction } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { Logger } from '../../platform/logging/logger';
import type { TelegramBotAdminApi } from '../../integrations/telegram/telegram-api';
import { parseOwnerTelegramId } from '../../modules/identity';
import type { AppEnv } from '../env';
import { parseEnvBotInfo } from './bot-info';
import type { BotIdentityStore } from './bot-identity-store';
import { configureOwnerChat } from './owner-chat';
import type { TelegramCaller } from './telegram-call';

export interface BotSettings {
  token: string;
  webhookSecret: string;
  ownerId: number;
}

export interface BotConfig extends BotSettings {
  botInfo: UserFromGetMe;
}

// What Telegram accepts as `secret_token`; any other value could never reach the webhook header.
const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

export interface BotSetup {
  /** The settings that come from the Worker environment, or null while any is missing or malformed. */
  settings: BotSettings | null;
  /** `settings` plus the bot identity; null while either is incomplete: the webhook then answers 503. */
  config: BotConfig | null;
  /** Names of the settings that are missing or malformed (never their values). A bot identity that was
   * never stored is not listed: connecting stores it. Only a malformed BOT_INFO override is. */
  missing: BotSetting[];
  /** From the BOT_INFO override or the stored identity, even if another setting is missing. */
  botUsername: string | null;
}

// A bot token is `<bot id>:<secret>`, so the id says which bot the token belongs to.
function tokenBotId(token: string): number | null {
  const match = /^(\d+):/.exec(token);
  return match?.[1] === undefined ? null : Number(match[1]);
}

// Pure: `stored` is the identity saved by connect (see `loadBotSetup`). A valid BOT_INFO override wins;
// a stored identity of another bot (the token was replaced since) is not used.
export function inspectBotSetup(env: AppEnv, stored: UserFromGetMe | null): BotSetup {
  const ownerId = parseOwnerTelegramId(env.OWNER_TELEGRAM_ID);
  // A token that is only whitespace (a pasted secret with a stray newline) is no token.
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET;

  const override = parseEnvBotInfo(env.BOT_INFO);
  const tokenId = token ? tokenBotId(token) : null;
  // A token without a readable bot id cannot vouch for a stored identity, so none is used.
  const usableStored = stored !== null && tokenId !== null && stored.id === tokenId ? stored : null;
  const botInfo = override.state === 'valid' ? override.info : usableStored;

  const missing: BotSetting[] = [];
  if (!token) missing.push('TELEGRAM_BOT_TOKEN');
  if (!webhookSecret || !WEBHOOK_SECRET_PATTERN.test(webhookSecret)) missing.push('TELEGRAM_WEBHOOK_SECRET');
  if (override.state === 'malformed') missing.push('BOT_INFO');
  if (ownerId === null) missing.push('OWNER_TELEGRAM_ID');

  const settings =
    missing.length === 0 && token && webhookSecret && ownerId !== null ? { token, webhookSecret, ownerId } : null;
  return {
    settings,
    config: settings !== null && botInfo !== null ? { ...settings, botInfo } : null,
    missing,
    botUsername: botInfo?.username ?? null
  };
}

// Reads the stored identity only when no BOT_INFO override is set: one primary-key lookup, never `getMe`.
export async function loadBotSetup(
  env: AppEnv,
  store: BotIdentityStore,
  log: { logger: Logger; requestId?: string }
): Promise<BotSetup> {
  const stored = parseEnvBotInfo(env.BOT_INFO).state === 'absent' ? await store.load() : null;
  const tokenId = tokenBotId(env.TELEGRAM_BOT_TOKEN?.trim() ?? '');
  if (stored !== null && tokenId !== null && stored.id !== tokenId) {
    // Ids only identify bots, they are no secret, but the log carries the code alone.
    log.logger.warn({
      component: 'bot',
      operation: 'bot_identity.load',
      requestId: log.requestId,
      errorCode: 'BOT_IDENTITY_MISMATCH'
    });
  }
  return inspectBotSetup(env, stored);
}

// The bot is personal: updates from anyone but the owner are dropped without an answer.
export function ownerOnly(ownerId: number) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    if (ctx.from?.id === ownerId) await next();
  };
}

export interface BotRuntime {
  /** This Worker's public origin: where the studio button points. */
  appOrigin: string;
  /** Used by /start to refresh the owner's commands and menu button. */
  adminApi: TelegramBotAdminApi;
  call: TelegramCaller;
  /** Keeps work alive after the webhook answered (the request's `ctx.waitUntil`). */
  waitUntil: (work: Promise<unknown>) => void;
  /** Records a failed update (stable code only); the webhook still answers 200. */
  onError: (error: unknown) => void;
}

// Every Bot API call of the reply path gives up after this long, so the whole handler stays well
// under the webhook's 10 s deadline (grammY's own default is 500 s).
const REPLY_TIMEOUT_SECONDS = 4;

// Built per request: no user or update state lives in module scope.
export function createBot(config: BotConfig, runtime: BotRuntime): Bot {
  const bot = new Bot(config.token, {
    botInfo: config.botInfo,
    client: { timeoutSeconds: REPLY_TIMEOUT_SECONDS }
  });
  // First, so it sees every failure. `bot.catch` is not used by webhooks: `handleUpdate` rethrows,
  // the webhook would answer 500 and Telegram would redeliver an update whose reply may already be
  // out. A /start the owner did not get is simply sent again by the owner.
  bot.use(async (_ctx, next) => {
    try {
      await next();
    } catch (error) {
      runtime.onError(error);
    }
  });
  bot.use(ownerOnly(config.ownerId));
  bot.command('start', async (ctx) => {
    await ctx.reply('Студия на связи. Откройте её кнопкой ниже.', {
      reply_markup: new InlineKeyboard().webApp('Открыть студию', `${runtime.appOrigin}/`)
    });
    // Best effort and off the webhook's path: the reply above is what the owner needs. Awaiting two
    // more Telegram calls here could outlast the webhook deadline, answer 500 after the reply was
    // sent, and make Telegram redeliver the update (a second reply). A failure is already logged by
    // `call` with a stable code, so it is only kept from becoming an unhandled rejection.
    runtime.waitUntil(
      configureOwnerChat(
        { api: runtime.adminApi, call: runtime.call },
        { ownerId: config.ownerId, appOrigin: runtime.appOrigin }
      ).catch(() => undefined)
    );
  });
  return bot;
}
