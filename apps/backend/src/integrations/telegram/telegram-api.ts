import { Api } from 'grammy';

// The one call publishing needs, typed with the platform's AbortSignal.
export interface TelegramSendApi {
  sendMessage(
    chatId: string,
    text: string,
    other: { parse_mode: 'HTML'; link_preview_options: { is_disabled: boolean } },
    signal: AbortSignal
  ): Promise<unknown>;
}

// grammY's raw Api: no auto-retry plugin and no retry of its own, so a failed send is reported
// once and the publishing module decides what it means. Built per tick, never kept in module scope.
export function createTelegramApi(token: string): TelegramSendApi {
  const api = new Api(token);
  return {
    // grammY types `signal` with the abort-controller polyfill's AbortSignal; at runtime it is
    // handed straight to fetch, which takes the platform one.
    sendMessage: (chatId, text, other, signal) => api.sendMessage(chatId, text, other, signal as never)
  };
}

// The three read calls a destination check needs. Answers stay `unknown`: the publishing module
// parses what it relies on, so a changed Bot API shape fails closed instead of being trusted.
export interface TelegramChatReadApi {
  getChat(chatId: string, signal: AbortSignal): Promise<unknown>;
  getMe(signal: AbortSignal): Promise<unknown>;
  getChatMember(chatId: string, userId: number, signal: AbortSignal): Promise<unknown>;
}

export function createTelegramChatReadApi(token: string): TelegramChatReadApi {
  const api = new Api(token);
  return {
    getChat: (chatId, signal) => api.getChat(chatId, signal as never),
    getMe: (signal) => api.getMe(signal as never),
    getChatMember: (chatId, userId, signal) => api.getChatMember(chatId, userId, signal as never)
  };
}
