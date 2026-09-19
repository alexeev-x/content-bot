import type { IconColor } from 'src/const/sections';
import { createHttpClient } from 'src/lib/api';
import { AppError } from 'src/lib/errors';

/**
 * Транспорт Bot API. Знает про методы Telegram и ничего — про команды, рубрики и тексты ответов:
 * им занимается modules/telegram. Любой модуль может писать в Telegram через этот клиент,
 * в том числе из очереди и cron, где никакого grammY-контекста нет.
 *
 * Наружу отдаём свои camelCase-типы: сырой контракт Telegram за пределы core не уходит.
 */
type TelegramResponse<T> = { ok: true; result: T } | { ok: false; description?: string };

export type SendMessage = {
  chatId: number;
  text: string;
  threadId?: number;
};

export type CreateTopic = {
  chatId: number;
  name: string;
  iconColor?: IconColor;
};

export type Topic = {
  threadId: number;
  name: string;
};

export const createTelegramApi = (token: string) => {
  const http = createHttpClient(`https://api.telegram.org/bot${token}`);

  const call = async <T>(method: string, payload: Record<string, unknown>): Promise<T> => {
    const response = await http.post<TelegramResponse<T>>(method, payload);

    // Ошибку самого Telegram (400, 403) повторять бессмысленно — она детерминирована.
    if (!response.ok) {
      throw new AppError('upstream_failed', `Telegram rejected ${method}: ${response.description ?? 'unknown'}`);
    }

    return response.result;
  };

  return {
    sendMessage: async ({ chatId, text, threadId }: SendMessage): Promise<void> => {
      await call<unknown>('sendMessage', { chat_id: chatId, text, message_thread_id: threadId });
    },

    createTopic: async ({ chatId, name, iconColor }: CreateTopic): Promise<Topic> => {
      const topic = await call<{ message_thread_id?: number; name?: string }>('createForumTopic', {
        chat_id: chatId,
        name,
        icon_color: iconColor,
      });

      // Без проверки мусор из ответа доедет до вставки в базу и упадёт невнятной ошибкой SQL.
      if (typeof topic.message_thread_id !== 'number') {
        throw new AppError('upstream_failed', 'Telegram вернул тему без message_thread_id');
      }

      return { threadId: topic.message_thread_id, name: topic.name ?? name };
    },
  };
};

export type TelegramApi = ReturnType<typeof createTelegramApi>;
