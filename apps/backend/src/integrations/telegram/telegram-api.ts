import type { PostEntity } from '@alexeev/contracts';
import { Api, InputFile } from 'grammy';
import type { InlineKeyboardMarkup, InputMediaPhoto, InputMediaVideo } from '@grammyjs/types';

// The one call publishing needs, typed with the platform's AbortSignal. The text goes out as plain text with
// explicit entities and never with a parse_mode: nothing in a post can be read as markup.
export interface TelegramSendApi {
  sendMessage(
    chatId: string,
    text: string,
    other: TelegramSendFlags & { entities: PostEntity[]; link_preview_options?: { is_disabled: boolean } },
    signal: AbortSignal
  ): Promise<unknown>;
  sendPhoto(
    chatId: string,
    photo: InputFile,
    other: TelegramSendFlags & { caption: string; caption_entities: PostEntity[] },
    signal: AbortSignal
  ): Promise<unknown>;
  sendVideo(
    chatId: string,
    video: InputFile,
    other: TelegramSendFlags & { caption: string; caption_entities: PostEntity[] },
    signal: AbortSignal
  ): Promise<unknown>;
  sendAnimation(
    chatId: string,
    animation: InputFile,
    other: TelegramSendFlags & { caption: string; caption_entities: PostEntity[] },
    signal: AbortSignal
  ): Promise<unknown>;
  sendMediaGroup(
    chatId: string,
    media: (InputMediaPhoto<InputFile> | InputMediaVideo<InputFile>)[],
    other: TelegramSendFlags,
    signal: AbortSignal
  ): Promise<unknown>;
  sendPoll(chatId: string, poll: TelegramPollParams, signal: AbortSignal): Promise<unknown>;
  /** A rich message (Bot API 10.1): HTML, its uploads named by id, no parse_mode and no entities. */
  sendRichMessage(
    chatId: string,
    message: { html: string; media: { id: string; kind: 'photo' | 'video' | 'animation'; file: InputFile }[] },
    other: TelegramSendFlags,
    signal: AbortSignal
  ): Promise<unknown>;
}

// Per-post send options (disable_notification: no sound; protect_content: no forwarding or saving).
export interface TelegramSendFlags {
  disable_notification: boolean;
  protect_content: boolean;
}

// The Bot API sendPoll fields we use. A channel poll must be anonymous, so is_anonymous is always true.
export interface TelegramPollParams extends TelegramSendFlags {
  question: string;
  options: string[];
  type: 'regular' | 'quiz';
  allows_multiple_answers: boolean;
  correct_option_ids?: number[];
  explanation?: string;
}

// grammY's raw Api: no auto-retry plugin and no retry of its own, so a failed send is reported
// once and the publishing module decides what it means. Built per tick, never kept in module scope.
export function createTelegramApi(token: string): TelegramSendApi {
  const api = new Api(token);
  return {
    // grammY types `signal` with the abort-controller polyfill's AbortSignal; at runtime it is
    // handed straight to fetch, which takes the platform one.
    sendMessage: (chatId, text, other, signal) => api.sendMessage(chatId, text, other, signal as never),
    sendPhoto: (chatId, photo, other, signal) => api.sendPhoto(chatId, photo, other, signal as never),
    sendVideo: (chatId, video, other, signal) => api.sendVideo(chatId, video, other, signal as never),
    sendAnimation: (chatId, animation, other, signal) => api.sendAnimation(chatId, animation, other, signal as never),
    sendMediaGroup: (chatId, media, other, signal) => api.sendMediaGroup(chatId, media, other, signal as never),
    sendRichMessage: (chatId, { html, media }, other, signal) =>
      api.raw.sendRichMessage(
        {
          chat_id: chatId,
          rich_message: {
            html,
            ...(media.length === 0
              ? {}
              : { media: media.map(({ id, kind, file }) => ({ id, media: { type: kind, media: file } })) })
          },
          ...other
        },
        signal as never
      ),
    // The question and options go as plain strings (no parse_mode, no entities): nothing in them is read as markup.
    sendPoll: (chatId, { question, options, ...rest }, signal) =>
      api.sendPoll(
        chatId,
        question,
        options.map((text) => ({ text })),
        { is_anonymous: true, ...rest },
        signal as never
      )
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

export interface BotCommandDescription {
  command: string;
  description: string;
}

/** The updates the webhook asks for; `chat_member` (joins and leaves of the channel) is only sent when asked. */
export type TelegramUpdateKind = 'message' | 'callback_query' | 'chat_member';

// What registering the bot needs. Answers stay `unknown`: the caller parses what it relies on.
// `deleteMyCommands` takes a scope and a language because Telegram keeps one list per pair, and a
// list left by an older bot would shadow the one this bot sets.
export interface TelegramBotAdminApi {
  getMe(signal: AbortSignal): Promise<unknown>;
  getWebhookInfo(signal: AbortSignal): Promise<unknown>;
  setWebhook(
    input: { url: string; secretToken: string; allowedUpdates: TelegramUpdateKind[] },
    signal: AbortSignal
  ): Promise<unknown>;
  deleteMyCommands(
    input: { scope?: 'all_private_chats' | { chatId: number }; languageCode?: 'ru' },
    signal: AbortSignal
  ): Promise<unknown>;
  setChatCommands(chatId: number, commands: BotCommandDescription[], signal: AbortSignal): Promise<unknown>;
  /** The owner's menu button shows the command list (the studio opens from /start). */
  setChatMenuCommands(chatId: number, signal: AbortSignal): Promise<unknown>;
}

export function createTelegramBotAdminApi(token: string): TelegramBotAdminApi {
  const api = new Api(token);
  return {
    getMe: (signal) => api.getMe(signal as never),
    getWebhookInfo: (signal) => api.getWebhookInfo(signal as never),
    // Pending updates are dropped: an old backlog (for example from a previous bot) is not this bot's to answer.
    setWebhook: ({ url, secretToken, allowedUpdates }, signal) =>
      api.setWebhook(
        url,
        { secret_token: secretToken, drop_pending_updates: true, allowed_updates: allowedUpdates },
        signal as never
      ),
    deleteMyCommands: ({ scope, languageCode }, signal) =>
      api.deleteMyCommands(
        {
          ...(scope === undefined
            ? {}
            : {
                scope: typeof scope === 'string' ? { type: scope } : { type: 'chat' as const, chat_id: scope.chatId }
              }),
          ...(languageCode === undefined ? {} : { language_code: languageCode })
        },
        signal as never
      ),
    setChatCommands: (chatId, commands, signal) =>
      api.setMyCommands(commands, { scope: { type: 'chat', chat_id: chatId } }, signal as never),
    setChatMenuCommands: (chatId, signal) =>
      api.setChatMenuButton({ chat_id: chatId, menu_button: { type: 'commands' } }, signal as never)
  };
}

// One message to the owner's private chat with a single Mini App button. Answers stay `unknown`:
// the caller only needs to know whether Telegram accepted it.
export interface TelegramOwnerMessageApi {
  sendMessageWithWebAppButton(
    chatId: string,
    input: { html: string; button: { text: string; url: string } },
    signal: AbortSignal
  ): Promise<unknown>;
  /** The same notice with a ready inline keyboard (callback and web_app buttons). */
  sendMessageWithKeyboard(
    chatId: string,
    input: { html: string; markup: InlineKeyboardMarkup },
    signal: AbortSignal
  ): Promise<unknown>;
  /** A rich message (Bot API 10.1) with a ready inline keyboard: the analytics reports (owner, 23.10.2026). */
  sendRichMessageWithKeyboard(
    chatId: string,
    input: { html: string; markup: InlineKeyboardMarkup },
    signal: AbortSignal
  ): Promise<unknown>;
  sendMediaWithWebAppButton(
    chatId: string,
    input: {
      kind: 'photo' | 'video' | 'animation';
      fileName: string;
      body: ReadableStream<Uint8Array>;
      html: string;
      button: { text: string; url: string };
    },
    signal: AbortSignal
  ): Promise<unknown>;
}

export async function* readBody(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  let reachedEof = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        reachedEof = true;
        return;
      }
      yield value;
    }
  } finally {
    try {
      if (!reachedEof) {
        // grammY may stop consuming the upload after an error or abort; cancel R2's stream then,
        // but preserve normal EOF semantics and never mask the original iterator result.
        await reader.cancel();
      }
    } catch {
      // Cancellation is best-effort when the source has already errored or been cancelled.
    } finally {
      reader.releaseLock();
    }
  }
}

export function createTelegramOwnerMessageApi(token: string): TelegramOwnerMessageApi {
  const api = new Api(token);
  return {
    sendMessageWithWebAppButton: (chatId, { html, button }, signal) =>
      api.sendMessage(
        chatId,
        html,
        {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          reply_markup: { inline_keyboard: [[{ text: button.text, web_app: { url: button.url } }]] }
        },
        signal as never
      ),
    sendMessageWithKeyboard: (chatId, { html, markup }, signal) =>
      api.sendMessage(
        chatId,
        html,
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: markup },
        signal as never
      ),
    sendRichMessageWithKeyboard: (chatId, { html, markup }, signal) =>
      api.raw.sendRichMessage({ chat_id: chatId, rich_message: { html }, reply_markup: markup }, signal as never),
    sendMediaWithWebAppButton: (chatId, { kind, fileName, body, html, button }, signal) => {
      const file = new InputFile(readBody(body), fileName);
      const other = {
        caption: html,
        parse_mode: 'HTML' as const,
        reply_markup: { inline_keyboard: [[{ text: button.text, web_app: { url: button.url } }]] }
      };
      if (kind === 'photo') return api.sendPhoto(chatId, file, other, signal as never);
      if (kind === 'video') return api.sendVideo(chatId, file, other, signal as never);
      return api.sendAnimation(chatId, file, other, signal as never);
    }
  };
}

// A rich message (Bot API 10.1+): the content is Telegram's rich HTML; `uploads` are photos the HTML names as
// `tg://photo?id=<id>`, sent in the same multipart request. Used by the DEV samples only (owner, 23.10.2026).
export interface TelegramRichMessageApi {
  sendRichMessage(
    chatId: string,
    input: { html: string; uploads: { id: string; fileName: string; bytes: Uint8Array }[] },
    signal: AbortSignal
  ): Promise<unknown>;
  /** The same content the classic way (parse_mode HTML), to compare the two side by side. */
  sendClassicHtml(chatId: string, html: string, signal: AbortSignal): Promise<unknown>;
  /** Two photos side by side (an album), the caption under the first: the picture trial's before/after. */
  sendPhotoPair(
    chatId: string,
    input: { first: Uint8Array; second: Uint8Array; caption: string },
    signal: AbortSignal
  ): Promise<unknown>;
}

export function createTelegramRichMessageApi(token: string): TelegramRichMessageApi {
  const api = new Api(token);
  return {
    sendPhotoPair: (chatId, { first, second, caption }, signal) =>
      api.sendMediaGroup(
        chatId,
        [
          { type: 'photo', media: new InputFile(first, 'before.png'), caption },
          { type: 'photo', media: new InputFile(second, 'after.jpg') }
        ],
        {},
        signal as never
      ),
    sendRichMessage: (chatId, { html, uploads }, signal) =>
      api.raw.sendRichMessage(
        {
          chat_id: chatId,
          rich_message: {
            html,
            ...(uploads.length === 0
              ? {}
              : {
                  media: uploads.map(({ id, fileName, bytes }) => ({
                    id,
                    media: { type: 'photo' as const, media: new InputFile(bytes, fileName) }
                  }))
                })
          }
        },
        signal as never
      ),
    sendClassicHtml: (chatId, html, signal) =>
      api.sendMessage(
        chatId,
        html,
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
        signal as never
      )
  };
}

// Named invite links of a channel (the bot must be its admin with the right to invite users). Answers stay
// `unknown`: the caller parses what it relies on.
export interface TelegramInviteLinkApi {
  createChatInviteLink(chatId: string, name: string, signal: AbortSignal): Promise<unknown>;
  revokeChatInviteLink(chatId: string, inviteLink: string, signal: AbortSignal): Promise<unknown>;
}

export function createTelegramInviteLinkApi(token: string): TelegramInviteLinkApi {
  const api = new Api(token);
  return {
    createChatInviteLink: (chatId, name, signal) => api.createChatInviteLink(chatId, { name }, signal as never),
    revokeChatInviteLink: (chatId, inviteLink, signal) => api.revokeChatInviteLink(chatId, inviteLink, signal as never)
  };
}
