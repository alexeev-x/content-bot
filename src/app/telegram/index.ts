import { BotError, webhookCallback } from 'grammy';
import { z } from 'zod';
import { configSchema } from 'src/app/config';
import { telegramAuth } from 'src/app/middleware/telegram-auth';
import type { Sections } from 'src/core/sections';
import type { TelegramApi } from 'src/core/telegram';
import { AppError } from 'src/lib/errors';
import { createRouter } from 'src/lib/router';
import type { BotCallbackHandler, BotCommand, BotTextHandler } from 'src/types/bot';
import type { Env } from 'src/types/env';
import { createBot } from './bot';

/** Зависимости строятся на каждый запрос: биндинги живут в env конкретного вызова. */
export type TelegramDeps = {
  telegram: TelegramApi;
  sections: Sections;
  commands: BotCommand[];
  textHandlers: BotTextHandler[];
  callbackHandlers: BotCallbackHandler[];
};

const readConfig = (env: Env) => {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) throw new AppError('not_configured', 'Secrets are missing or malformed');
  return parsed.data;
};

const updateEnvelope = z.object({ update_id: z.number().int().nonnegative() });

export const createTelegramRouter = (buildDeps: (env: Env, updateId: number, signal: AbortSignal) => TelegramDeps) =>
  createRouter().post('/webhook', telegramAuth, async (c) => {
    const parsed = updateEnvelope.safeParse(
      await c.req.raw
        .clone()
        .json()
        .catch(() => null),
    );
    if (!parsed.success) throw new AppError('bad_request', 'Invalid Telegram update');
    const bot = await createBot({
      config: readConfig(c.env),
      d1: c.env.DB,
      ...buildDeps(c.env, parsed.data.update_id, AbortSignal.timeout(45_000)),
    });

    // Дефолт grammY в 10 секунд слишком жёсткий для холодного старта, а Telegram считает
    // доставку неудачной примерно через минуту — держимся ниже этого порога.
    try {
      return await webhookCallback(bot, 'hono', { timeoutMilliseconds: 50_000 })(c);
    } catch (error) {
      // В webhook-режиме grammY оборачивает ошибку, bot.catch относится к long polling.
      if (error instanceof BotError) throw error.error;
      throw error;
    }
  });
