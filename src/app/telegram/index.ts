import { webhookCallback } from 'grammy';
import { configSchema } from 'src/app/config';
import { telegramAuth } from 'src/app/middleware/telegram-auth';
import type { Sections } from 'src/core/sections';
import type { TelegramApi } from 'src/core/telegram';
import { AppError } from 'src/lib/errors';
import { createRouter } from 'src/lib/router';
import type { BotCommand } from 'src/types/bot';
import type { Env } from 'src/types/env';
import { createBot } from './bot';

/** Зависимости строятся на каждый запрос: биндинги живут в env конкретного вызова. */
export type TelegramDeps = {
  telegram: TelegramApi;
  sections: Sections;
  commands: BotCommand[];
};

const readConfig = (env: Env) => {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) throw new AppError('not_configured', 'Secrets are missing or malformed');
  return parsed.data;
};

export const createTelegramRouter = (buildDeps: (env: Env) => TelegramDeps) =>
  createRouter().post('/webhook', telegramAuth, async (c) => {
    const bot = await createBot({ config: readConfig(c.env), d1: c.env.DB, ...buildDeps(c.env) });

    // Дефолт grammY в 10 секунд слишком жёсткий для холодного старта, а Telegram считает
    // доставку неудачной примерно через минуту — держимся ниже этого порога.
    return webhookCallback(bot, 'hono', { timeoutMilliseconds: 50_000 })(c);
  });
