import type { UserFromGetMe } from 'grammy/types';
import { z } from 'zod';

/**
 * Ответ getMe. Держим его в переменной окружения, чтобы grammY не спрашивал его у Telegram
 * на каждом холодном старте: лишний round-trip и трата лимита subrequests.
 * Получить: curl https://api.telegram.org/bot<TOKEN>/getMe
 *
 * Схему Telegram не переписываем — она меняется с версиями Bot API. Проверяем опознавательные
 * поля, тип берём из grammY.
 */
const botInfoSchema = z.custom<UserFromGetMe>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as UserFromGetMe).id === 'number' &&
    typeof (value as UserFromGetMe).username === 'string' &&
    (value as UserFromGetMe).is_bot === true,
);

const tryParseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

/**
 * Конфигурация воркера: секреты приходят строками из Workers Secrets, проверяем форму
 * до первого использования. Лежит во входе, а не в общих схемах: потребитель один.
 */
export const configSchema = z.object({
  BOT_TOKEN: z.string().min(1),
  OWNER_TELEGRAM_ID: z.coerce.number().int().positive(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(32),
  /** Необязателен до первого запроса к редактору. */
  OPENAI_API_KEY: z.string().min(1).optional(),
  /** Необязательна: без неё grammY один раз за изолят сходит в getMe сам. */
  BOT_INFO: z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (!raw) return undefined;

      // JSON.parse бросает мимо safeParse: zod исключения из transform не перехватывает,
      // и кривая переменная роняла бы обработчик вместо понятного «секреты настроены неверно».
      const parsed = botInfoSchema.safeParse(tryParseJson(raw));

      if (!parsed.success) {
        ctx.addIssue({ code: 'custom', message: 'BOT_INFO не похож на ответ getMe' });
        return undefined;
      }

      return parsed.data;
    }),
});

export type Config = z.infer<typeof configSchema>;
