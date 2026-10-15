import { GrammyError } from 'grammy';
import type { TelegramOwnerMessageApi } from '../../integrations/telegram/telegram-api';
import type { CatalogSection } from '../notifications/message-catalog';

const SEND_TIMEOUT_MS = 5_000;
/** Telegram slows a burst to one chat with 429 + retry_after; a longer wait than this is not waited out. */
const MAX_RETRY_AFTER_SEC = 30;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Sends the message catalog in order: a heading per section, then its messages. A preview is harmless to
// repeat, so each 429 is waited out and that message retried once; any other failure stops the run and is reported with
// the number already sent.
export async function sendMessageCatalog(deps: {
  messenger: TelegramOwnerMessageApi;
  chatId: string;
  intro: string;
  /** The intro and the section headings carry a button to the studio (Telegram needs no empty keyboards). */
  studioUrl: string;
  sections: readonly CatalogSection[];
  sleep?: (ms: number) => Promise<unknown>;
}): Promise<{ sent: number; error: unknown }> {
  const sleep = deps.sleep ?? wait;
  const studio = { inline_keyboard: [[{ text: 'Открыть студию', web_app: { url: deps.studioUrl } }]] };
  const queue = [
    { html: deps.intro, markup: studio },
    ...deps.sections.flatMap((section) => [{ html: `<b>${section.heading}</b>`, markup: studio }, ...section.messages])
  ];
  let sent = 0;
  for (const message of queue) {
    const send = () =>
      deps.messenger.sendMessageWithKeyboard(
        deps.chatId,
        { html: message.html, markup: message.markup },
        AbortSignal.timeout(SEND_TIMEOUT_MS)
      );
    try {
      try {
        await send();
      } catch (error) {
        const retryAfter = error instanceof GrammyError ? error.parameters.retry_after : undefined;
        if (retryAfter === undefined || retryAfter > MAX_RETRY_AFTER_SEC) throw error;
        await sleep(retryAfter * 1000);
        await send();
      }
    } catch (error) {
      return { sent, error };
    }
    sent += 1;
  }
  return { sent, error: null };
}
