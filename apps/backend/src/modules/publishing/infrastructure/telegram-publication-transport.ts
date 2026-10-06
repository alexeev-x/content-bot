import type { PublicationTransport } from '../application/ports';
import { SEND_TIMEOUT_MS } from '../domain/dispatch-policy';
import { classifySendResult, classifyTelegramError } from './classify-telegram-result';

// What the adapter needs to send: `integrations/telegram` provides it, tests script it.
export interface TelegramSender {
  sendMessage(
    chatId: string,
    text: string,
    other: { parse_mode: 'HTML'; link_preview_options: { is_disabled: boolean } },
    signal: AbortSignal
  ): Promise<unknown>;
}

// Never throws: every answer, error and timeout becomes a SendOutcome, so "unclear means unknown"
// is visible in the types (docs/BACKEND_ARCHITECTURE.md §4). The text is HTML made by
// formatPublicationText; link previews are switched off explicitly so a pasted link never turns
// a curated post into a surprise card.
export function createTelegramPublicationTransport(
  sender: TelegramSender,
  timeoutMs: number = SEND_TIMEOUT_MS
): PublicationTransport {
  return {
    async send({ chatId, text }) {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const message = await sender.sendMessage(
          chatId,
          text,
          { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
          signal
        );
        return classifySendResult(message);
      } catch (error) {
        // grammY reports an aborted request as a network error; the timeout is the more useful reason.
        if (signal.aborted) return { kind: 'unknown', reason: 'timeout' };
        return classifyTelegramError(error);
      }
    }
  };
}
