import { Bot, type Context, type NextFunction } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { z } from 'zod';
import type { AppEnv } from '../env';

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
  supports_join_request_queries: flag,
});

export interface BotConfig {
  token: string;
  webhookSecret: string;
  botInfo: UserFromGetMe;
  ownerId: number;
}

// Returns null while any required setting is missing or malformed: the webhook then answers 503.
export function readBotConfig(env: AppEnv): BotConfig | null {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: webhookSecret, BOT_INFO: botInfoRaw } = env;
  if (!token || !webhookSecret || !botInfoRaw || !/^[1-9]\d{0,14}$/.test(env.OWNER_TELEGRAM_ID)) return null;

  let botInfoJson: unknown;
  try {
    botInfoJson = JSON.parse(botInfoRaw);
  } catch {
    return null;
  }
  const botInfo = botInfoSchema.safeParse(botInfoJson);
  if (!botInfo.success) return null;

  return { token, webhookSecret, botInfo: botInfo.data, ownerId: Number(env.OWNER_TELEGRAM_ID) };
}

// The bot is personal: updates from anyone but the owner are dropped without an answer.
export function ownerOnly(ownerId: number) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    if (ctx.from?.id === ownerId) await next();
  };
}

// Built per request: no user or update state lives in module scope.
export function createBot(config: BotConfig): Bot {
  const bot = new Bot(config.token, { botInfo: config.botInfo });
  bot.use(ownerOnly(config.ownerId));
  bot.command('start', (ctx) => ctx.reply('Бот на связи'));
  return bot;
}
