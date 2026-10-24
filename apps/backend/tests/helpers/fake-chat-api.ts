import { GrammyError, HttpError } from 'grammy';
import type { TelegramChatReadApi } from '../../src/integrations/telegram/telegram-api';

export const BOT_ID = 777000;

export type Step = unknown | (() => never);

export interface FakeChatApi extends TelegramChatReadApi {
  calls: string[];
}

export function apiError(code: number, description: string, parameters: Record<string, number> = {}): GrammyError {
  return new GrammyError(description, { ok: false, error_code: code, description, parameters }, 'getChat', {
    chat_id: '1'
  });
}

export const networkError = (): HttpError => new HttpError('Network request failed', new Error('boom'));

function answer(step: unknown): Promise<unknown> {
  try {
    return Promise.resolve(typeof step === 'function' ? (step as () => unknown)() : step);
  } catch (error) {
    return Promise.reject(error);
  }
}

// Each method answers with its scripted value, or throws when the script is a function.
export function fakeChatApi(script: {
  chat: unknown | (() => unknown);
  me?: unknown | (() => unknown);
  member?: unknown | (() => unknown);
}): FakeChatApi {
  const calls: string[] = [];
  return {
    calls,
    getChat(chatId) {
      calls.push(`getChat ${chatId}`);
      return answer(script.chat);
    },
    getMe() {
      calls.push('getMe');
      return answer(script.me ?? { id: BOT_ID, is_bot: true, username: 'content_bot' });
    },
    getChatMember(chatId, userId) {
      calls.push(`getChatMember ${chatId} ${userId}`);
      return answer(script.member ?? { status: 'administrator', can_post_messages: true });
    }
  };
}

export const channelChat = (over: Record<string, unknown> = {}) => ({
  id: -1001234567890,
  type: 'channel',
  title: 'Dev news',
  username: 'dev_news',
  ...over
});
