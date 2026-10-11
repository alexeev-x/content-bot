import type { TelegramOwnerMessageApi } from '../../src/integrations/telegram/telegram-api';

export interface SentOwnerMessage {
  chatId: string;
  html: string;
  button: { text: string; url: string };
}

export interface SentOwnerMediaMessage extends SentOwnerMessage {
  kind: 'photo' | 'video' | 'animation';
  fileName: string;
  body: ReadableStream<Uint8Array>;
}

export interface FakeOwnerMessenger extends TelegramOwnerMessageApi {
  sent: SentOwnerMessage[];
  sentMedia: SentOwnerMediaMessage[];
}

// Records what would reach the owner's chat; `fail` makes Telegram refuse every send.
export function fakeOwnerMessenger(options: { fail?: () => unknown; hang?: boolean } = {}): FakeOwnerMessenger {
  const sent: SentOwnerMessage[] = [];
  const sentMedia: SentOwnerMediaMessage[] = [];
  return {
    sent,
    sentMedia,
    sendMessageWithWebAppButton(chatId, { html, button }, signal) {
      sent.push({ chatId, html, button });
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
