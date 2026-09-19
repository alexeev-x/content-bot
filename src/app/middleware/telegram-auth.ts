import { createMiddleware } from 'hono/factory';
import { AppError } from 'src/lib/errors';
import type { AppEnv } from 'src/types/env';

const SECRET_HEADER = 'X-Telegram-Bot-Api-Secret-Token';

/** Сравнение за постоянное время: длина утечь может, содержимое — нет. */
const secretsMatch = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/**
 * Пускает дальше только Telegram: секрет задаётся при setWebhook и приходит заголовком.
 * Без настроенного секрета webhook отвечает 503 и ничего не обрабатывает.
 */
export const telegramAuth = createMiddleware<AppEnv>(async (c, next) => {
  const expected = c.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) throw new AppError('not_configured', 'Webhook secret is not configured');

  const received = c.req.header(SECRET_HEADER);
  if (!received || !secretsMatch(received, expected)) {
    throw new AppError('unauthorized', 'Invalid webhook secret');
  }

  await next();
});
