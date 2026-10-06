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
