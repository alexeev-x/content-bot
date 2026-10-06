import type { BotSetting } from '@alexeev/contracts';
import { Bot, type Context, InlineKeyboard, type NextFunction } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { z } from 'zod';
import type { TelegramBotAdminApi } from '../../integrations/telegram/telegram-api';
import { parseOwnerTelegramId } from '../../modules/identity';
import type { AppEnv } from '../env';
import { configureOwnerChat } from './owner-chat';
import type { TelegramCaller } from './telegram-call';

// Identity fields are required; capability flags only describe the bot and default to false,
// so an older or trimmed getMe copy still works.
const flag = z.boolean().default(false);
const botInfoSchema = z.looseObject({
  id: z.number().int().positive(),
  is_bot: z.literal(true),
  first_name: z.string(),
  username: z.string(),
  can_join_groups: flag,
  can_read_all_group_messages: flag,
  supports_inline_queries: flag,
  can_connect_to_business: flag,
  has_main_web_app: flag,
  has_topics_enabled: flag,
  allows_users_to_create_topics: flag,
  can_manage_bots: flag,
  supports_join_request_queries: flag
});

export interface BotConfig {
  token: string;
  webhookSecret: string;
  botInfo: UserFromGetMe;
  ownerId: number;
}

// What Telegram accepts as `secret_token`; any other value could never reach the webhook header.
const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

export interface BotSetup {
  /** The complete config, or null while any setting is missing or malformed. */
  config: BotConfig | null;
  /** Names of the settings that are missing or malformed (never their values). */
  missing: BotSetting[];
  /** From BOT_INFO when that one is valid, even if another setting is missing. */
  botUsername: string | null;
}

export function inspectBotSetup(env: AppEnv): BotSetup {
  const ownerId = parseOwnerTelegramId(env.OWNER_TELEGRAM_ID);
  // A token that is only whitespace (a pasted secret with a stray newline) is no token.
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET;

  let botInfo: BotConfig['botInfo'] | null = null;
  if (env.BOT_INFO) {
    try {
      const parsed = botInfoSchema.safeParse(JSON.parse(env.BOT_INFO));
      if (parsed.success) botInfo = parsed.data;
    } catch {
      // Not JSON: reported as a missing BOT_INFO below.
    }
  }

  const missing: BotSetting[] = [];
  if (!token) missing.push('TELEGRAM_BOT_TOKEN');
  if (!webhookSecret || !WEBHOOK_SECRET_PATTERN.test(webhookSecret)) missing.push('TELEGRAM_WEBHOOK_SECRET');
  if (botInfo === null) missing.push('BOT_INFO');
  if (ownerId === null) missing.push('OWNER_TELEGRAM_ID');

  const config =
    token && webhookSecret && WEBHOOK_SECRET_PATTERN.test(webhookSecret) && botInfo !== null && ownerId !== null
      ? { token, webhookSecret, botInfo, ownerId }
      : null;
  return { config, missing, botUsername: botInfo?.username ?? null };
}

// Returns null while any required setting is missing or malformed: the webhook then answers 503.
export function readBotConfig(env: AppEnv): BotConfig | null {
  return inspectBotSetup(env).config;
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
}

// Built per request: no user or update state lives in module scope.
export function createBot(config: BotConfig, runtime: BotRuntime): Bot {
  const bot = new Bot(config.token, { botInfo: config.botInfo });
  bot.use(ownerOnly(config.ownerId));
  bot.command('start', async (ctx) => {
    await ctx.reply('Студия на связи. Откройте её кнопкой ниже.', {
      reply_markup: new InlineKeyboard().webApp('Открыть студию', `${runtime.appOrigin}/`)
    });
    // Best effort: the reply above is what the owner needs. A failure is already logged by the
    // caller with a stable code and must not turn the update into a webhook error.
    try {
      await configureOwnerChat(
        { api: runtime.adminApi, call: runtime.call },
        { ownerId: config.ownerId, appOrigin: runtime.appOrigin }
      );
    } catch {
      // Logged inside `call`.
    }
  });
  return bot;
}
