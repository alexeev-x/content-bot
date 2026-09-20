import { z } from 'zod';
import type { IconColor } from 'src/const/sections';
import { createHttpClient } from 'src/lib/api';
import { AppError, isAppError } from 'src/lib/errors';
import { logger } from 'src/lib/logger';
import { executeOperation } from './operations';

const envelope = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), result: z.unknown() }),
  z.object({
    ok: z.literal(false),
    error_code: z.number().int(),
    parameters: z.object({ retry_after: z.number().nonnegative() }).optional(),
  }),
]);
const topicSchema = z.object({ message_thread_id: z.number().int().positive(), name: z.string() });
const messageSchema = z.object({ message_id: z.number().int() });
const updatedSchema = z.literal(true);

export type SendMessage = { chatId: number; text: string; threadId?: number; operationKey?: string };
export type CreateTopic = { chatId: number; name: string; iconColor?: IconColor; operationKey: string };
export type EditTopic = { chatId: number; threadId: number; name: string; operationKey: string };
export type Topic = { threadId: number; name: string };

/** Общий транспорт и журнал Bot API. scope — стабильный ключ сценария, а не HTTP-запроса. */
export const createTelegramApi = (
  token: string,
  { d1, scope, signal }: { d1: D1Database; scope: string; signal?: AbortSignal },
) => {
  const http = createHttpClient(`https://api.telegram.org/bot${token}`, { signal });
  let sequence = 0;
  const call = async (
    method: string,
    payload: Record<string, unknown>,
    schema: z.ZodType,
    key?: string,
  ): Promise<unknown> => {
    // Истёкший бюджет до резервирования не создаёт неопределённой операции.
    if (signal?.aborted) throw new AppError('operation_busy', 'Processing deadline reached', { retryable: true });
    return executeOperation(d1, key ?? `${scope}:${sequence++}:${method}`, method, payload, async () => {
      let response: unknown;
      try {
        response = await http.post(method, payload);
      } catch (error) {
        logger.warn('telegram operation result unavailable', {
          method,
          code: isAppError(error) ? error.code : 'internal',
        });
        throw error;
      }
      const parsed = envelope.safeParse(response);
      if (!parsed.success) {
        logger.warn('telegram response envelope is invalid', { method });
        throw new AppError('outcome_unknown', 'Invalid Telegram response');
      }
      if (!parsed.data.ok) {
        const code = parsed.data.error_code;
        if (code >= 500) {
          logger.warn('telegram operation result unavailable', { method, code });
          throw new AppError('outcome_unknown', 'Telegram result is unavailable');
        }
        throw new AppError('upstream_failed', 'Telegram rejected the operation', {
          retryable: code === 429,
          retryAfterMs: (parsed.data.parameters?.retry_after ?? 1) * 1000,
        });
      }
      const result = schema.safeParse(parsed.data.result);
      if (!result.success) {
        logger.warn('telegram response result is invalid', { method });
        throw new AppError('outcome_unknown', 'Invalid Telegram result');
      }
      return result.data;
    });
  };
  return {
    sendMessage: async ({ chatId, text, threadId, operationKey }: SendMessage): Promise<void> => {
      await call('sendMessage', { chat_id: chatId, text, message_thread_id: threadId }, messageSchema, operationKey);
    },
    createTopic: async ({ chatId, name, iconColor, operationKey }: CreateTopic): Promise<Topic> => {
      const topic = topicSchema.parse(
        await call('createForumTopic', { chat_id: chatId, name, icon_color: iconColor }, topicSchema, operationKey),
      );
      return { threadId: topic.message_thread_id, name: topic.name };
    },
    editTopic: async ({ chatId, threadId, name, operationKey }: EditTopic): Promise<void> => {
      await call('editForumTopic', { chat_id: chatId, message_thread_id: threadId, name }, updatedSchema, operationKey);
    },
  };
};
export type TelegramApi = ReturnType<typeof createTelegramApi>;
