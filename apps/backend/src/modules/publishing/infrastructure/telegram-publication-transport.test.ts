import type { PostEntity } from '@alexeev/contracts';
import type { InputMediaPhoto, InputMediaVideo } from '@grammyjs/types';
import { GrammyError, HttpError, type InputFile } from 'grammy';
import { describe, expect, it } from 'vitest';
import { createTelegramPublicationTransport, type TelegramSender } from './telegram-publication-transport';

function senderOf(step: (signal: AbortSignal) => Promise<unknown>): TelegramSender & { requests: unknown[][] } {
  const requests: unknown[][] = [];
  return {
    requests,
    sendMessage(chatId, text, other, signal) {
      requests.push([chatId, text, other]);
      return step(signal);
    },
    sendPhoto(chatId, photo: InputFile, other, signal) {
      requests.push(['photo', chatId, photo, other]);
      return step(signal);
    },
    sendVideo(chatId, video: InputFile, other, signal) {
      requests.push(['video', chatId, video, other]);
      return step(signal);
    },
    sendAnimation(chatId, animation: InputFile, other, signal) {
      requests.push(['animation', chatId, animation, other]);
      return step(signal);
    },
    sendMediaGroup(chatId, media: (InputMediaPhoto<InputFile> | InputMediaVideo<InputFile>)[], signal) {
      requests.push(['group', chatId, media]);
      return step(signal);
    }
  };
}

const apiError = (code: number, description: string, parameters: Record<string, number> = {}) =>
  new GrammyError(description, { ok: false, error_code: code, description, parameters }, 'sendMessage', {
    chat_id: '1'
  });

describe('the Telegram transport adapter', () => {
  it('sends plain text with entities and link previews disabled', async () => {
    const sender = senderOf(() => Promise.resolve({ message_id: 12 }));
    const entities: PostEntity[] = [
      { type: 'bold', offset: 0, length: 1 },
      { type: 'text_link', offset: 2, length: 3, url: 'https://example.com/a' }
    ];
    const outcome = await createTelegramPublicationTransport(sender).send({
      chatId: '-100',
      text: 'x <b>',
      entities,
      media: []
    });
    expect(outcome).toEqual({ kind: 'sent', externalMessageIds: ['12'] });
    expect(sender.requests).toEqual([['-100', 'x <b>', { entities, link_preview_options: { is_disabled: true } }]]);
  });

  it('sends a mixed album exactly once and retains every returned message id', async () => {
    const sender = senderOf(() => Promise.resolve([{ message_id: 20 }, { message_id: 21 }]));
    const media = [
      { kind: 'photo' as const, fileName: 'a.jpg', contentType: 'image/jpeg', body: new ReadableStream<Uint8Array>() },
      { kind: 'video' as const, fileName: 'b.mp4', contentType: 'video/mp4', body: new ReadableStream<Uint8Array>() }
    ];
    const result = await createTelegramPublicationTransport(sender).send({
      chatId: '-100',
      text: 'caption',
      entities: [],
      media
    });
    expect(result).toEqual({ kind: 'sent', externalMessageIds: ['20', '21'] });
    expect(sender.requests).toHaveLength(1);
    expect(sender.requests[0]?.[0]).toBe('group');
  });

  it('hands the sender a timeout signal and classifies the aborted request as unknown', async () => {
    let received: AbortSignal | undefined;
    const sender = senderOf(
      (signal) =>
        new Promise((_resolve, reject) => {
          received = signal;
          signal.addEventListener('abort', () => reject(new HttpError('Network request failed', signal.reason)));
        })
    );
    const outcome = await createTelegramPublicationTransport(sender, 10).send({
      chatId: '1',
      text: 't',
      entities: [],
      media: []
    });
    expect(received).toBeInstanceOf(AbortSignal);
    expect(outcome).toEqual({ kind: 'unknown', reason: 'timeout' });
  });

  it.each([
    [apiError(429, 'Too Many Requests', { retry_after: 9 }), { kind: 'rate_limited', retryAfterSec: 9 }],
    [apiError(403, 'Forbidden: bot was blocked'), { kind: 'rejected', code: 'DESTINATION_UNAVAILABLE' }],
    [apiError(502, 'Bad Gateway'), { kind: 'unknown', reason: 'telegram_http_502' }],
    [new HttpError('down', new Error('x')), { kind: 'unknown', reason: 'network_error' }]
  ])('maps API errors to their safe outcome', async (error, expected) => {
    const sender = senderOf(() => Promise.reject(error));
    await expect(
      createTelegramPublicationTransport(sender).send({ chatId: '1', text: 't', entities: [], media: [] })
    ).resolves.toEqual(expected);
  });

  it('treats a successful response without message id as unknown', async () => {
    const sender = senderOf(() => Promise.resolve({ chat: { id: 1 } }));
    await expect(
      createTelegramPublicationTransport(sender).send({ chatId: '1', text: 't', entities: [], media: [] })
    ).resolves.toEqual({ kind: 'unknown', reason: 'ok_without_message_id' });
  });
});
