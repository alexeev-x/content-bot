import { GrammyError, HttpError } from 'grammy';
import { describe, expect, it } from 'vitest';
import { createTelegramPublicationTransport, type TelegramSender } from './telegram-publication-transport';

function senderOf(step: (signal: AbortSignal) => Promise<unknown>): TelegramSender & { requests: unknown[][] } {
  const requests: unknown[][] = [];
  return {
    requests,
    sendMessage(chatId, text, other, signal) {
      requests.push([chatId, text, other]);
      return step(signal);
    }
  };
}

const apiError = (code: number, description: string, parameters: Record<string, number> = {}) =>
  new GrammyError(description, { ok: false, error_code: code, description, parameters }, 'sendMessage', {
    chat_id: '1'
  });

describe('the Telegram transport adapter', () => {
  it('sends HTML with link previews explicitly disabled and returns the message id', async () => {
    const sender = senderOf(() => Promise.resolve({ message_id: 12 }));

    const outcome = await createTelegramPublicationTransport(sender).send({ chatId: '-100', text: '<b>x</b>' });

    expect(outcome).toEqual({ kind: 'sent', externalMessageId: '12' });
    expect(sender.requests).toEqual([
      ['-100', '<b>x</b>', { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }]
    ]);
  });

  it('hands the sender a signal that aborts at the timeout, and reports the timeout as unknown', async () => {
    let received: AbortSignal | undefined;
    const sender = senderOf(
      (signal) =>
        new Promise((_resolve, reject) => {
          received = signal;
          // grammY surfaces an aborted request as a network error.
          signal.addEventListener('abort', () => reject(new HttpError('Network request failed', signal.reason)));
        })
    );

    const outcome = await createTelegramPublicationTransport(sender, 10).send({ chatId: '1', text: 't' });

    expect(received).toBeInstanceOf(AbortSignal);
    expect(outcome).toEqual({ kind: 'unknown', reason: 'timeout' });
  });

  it.each([
    [apiError(429, 'Too Many Requests', { retry_after: 9 }), { kind: 'rate_limited', retryAfterSec: 9 }],
    [apiError(403, 'Forbidden: bot was blocked'), { kind: 'rejected', code: 'DESTINATION_UNAVAILABLE' }],
    [apiError(502, 'Bad Gateway'), { kind: 'unknown', reason: 'telegram_http_502' }],
    [new HttpError('down', new Error('x')), { kind: 'unknown', reason: 'network_error' }]
  ])('maps %# to its outcome and never throws', async (error, expected) => {
    const sender = senderOf(() => Promise.reject(error));

    await expect(createTelegramPublicationTransport(sender).send({ chatId: '1', text: 't' })).resolves.toEqual(
      expected
    );
  });

  it('an ok answer without a message id is unknown, not sent', async () => {
    const sender = senderOf(() => Promise.resolve({ chat: { id: 1 } }));

    await expect(createTelegramPublicationTransport(sender).send({ chatId: '1', text: 't' })).resolves.toEqual({
      kind: 'unknown',
      reason: 'ok_without_message_id'
    });
  });
});
