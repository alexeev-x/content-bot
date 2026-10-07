import type { TelegramOwnerMessageApi } from '../../src/integrations/telegram/telegram-api';

export interface SentOwnerMessage {
  chatId: string;
  html: string;
  button: { text: string; url: string };
}

export interface FakeOwnerMessenger extends TelegramOwnerMessageApi {
  sent: SentOwnerMessage[];
}

// Records what would reach the owner's chat; `fail` makes Telegram refuse every send.
export function fakeOwnerMessenger(options: { fail?: () => unknown; hang?: boolean } = {}): FakeOwnerMessenger {
  const sent: SentOwnerMessage[] = [];
  return {
    sent,
    sendMessageWithWebAppButton(chatId, { html, button }, signal) {
      sent.push({ chatId, html, button });
      if (options.hang === true) {
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      return options.fail === undefined ? Promise.resolve(true) : Promise.reject(options.fail());
    }
  };
}
