import type { InlineKeyboardMarkup } from 'grammy/types';
import type { TelegramOwnerMessageApi } from '../../src/integrations/telegram/telegram-api';

export interface SentOwnerMessage {
  chatId: string;
  html: string;
  button: { text: string; url: string };
  /** Set when the notice went out with a ready keyboard; `button` is then its web_app button, if any. */
  markup?: InlineKeyboardMarkup;
}

export interface SentOwnerMediaMessage extends SentOwnerMessage {
  kind: 'photo' | 'video' | 'animation';
  fileName: string;
  body: ReadableStream<Uint8Array>;
}

export interface FakeOwnerMessenger extends TelegramOwnerMessageApi {
  sent: SentOwnerMessage[];
  sentMedia: SentOwnerMediaMessage[];
  /** The rich messages (the analytics reports, owner 23.10.2026). */
  sentRich: { chatId: string; html: string; markup: InlineKeyboardMarkup }[];
}

// Records what would reach the owner's chat; `fail` makes Telegram refuse every send.
export function fakeOwnerMessenger(
  options: { fail?: () => unknown; hang?: boolean; rejectRich?: () => unknown } = {}
): FakeOwnerMessenger {
  const sent: SentOwnerMessage[] = [];
  const sentMedia: SentOwnerMediaMessage[] = [];
  const sentRich: FakeOwnerMessenger['sentRich'] = [];
  return {
    sent,
    sentMedia,
    sentRich,
    sendRichMessageWithKeyboard(chatId, { html, markup }, signal) {
      if (options.rejectRich !== undefined) return Promise.reject(options.rejectRich());
      sentRich.push({ chatId, html, markup });
      if (options.hang === true) {
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      return options.fail === undefined ? Promise.resolve(true) : Promise.reject(options.fail());
    },
    sendMessageWithWebAppButton(chatId, { html, button }, signal) {
      sent.push({ chatId, html, button });
      if (options.hang === true) {
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      return options.fail === undefined ? Promise.resolve(true) : Promise.reject(options.fail());
    },
    sendMessageWithKeyboard(chatId, { html, markup }, signal) {
      const web = markup.inline_keyboard.flat().find((button) => 'web_app' in button);
      sent.push({
        chatId,
        html,
        markup,
        button: web !== undefined && 'web_app' in web ? { text: web.text, url: web.web_app.url } : { text: '', url: '' }
      });
      if (options.hang === true) {
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      return options.fail === undefined ? Promise.resolve(true) : Promise.reject(options.fail());
    },
    sendMediaWithWebAppButton(chatId, { kind, fileName, body, html, button }, signal) {
      sentMedia.push({ chatId, kind, fileName, body, html, button });
      if (options.hang === true) {
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      return options.fail === undefined ? Promise.resolve(true) : Promise.reject(options.fail());
    }
  };
}
