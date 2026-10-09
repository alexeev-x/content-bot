import { InputFile } from 'grammy';
import type { InputMediaPhoto, InputMediaVideo } from '@grammyjs/types';
import type { PostEntity } from '@alexeev/contracts';
import type { PublicationTransport } from '../application/ports';
import { SEND_TIMEOUT_MS } from '../domain/dispatch-policy';
import { classifySendResult, classifyTelegramError } from './classify-telegram-result';

// What the adapter needs to send: `integrations/telegram` provides it, tests script it.
export interface TelegramSender {
  sendMessage(
    chatId: string,
    text: string,
    other: { entities: PostEntity[]; link_preview_options: { is_disabled: boolean } },
    signal: AbortSignal
  ): Promise<unknown>;
  sendPhoto(
    chatId: string,
    photo: InputFile,
    other: { caption: string; caption_entities: PostEntity[] },
    signal: AbortSignal
  ): Promise<unknown>;
  sendVideo(
    chatId: string,
    video: InputFile,
    other: { caption: string; caption_entities: PostEntity[] },
    signal: AbortSignal
  ): Promise<unknown>;
  sendAnimation(
    chatId: string,
    animation: InputFile,
    other: { caption: string; caption_entities: PostEntity[] },
    signal: AbortSignal
  ): Promise<unknown>;
  sendMediaGroup(
    chatId: string,
    media: (InputMediaPhoto<InputFile> | InputMediaVideo<InputFile>)[],
    signal: AbortSignal
  ): Promise<unknown>;
}

// Never throws: every answer, error and timeout becomes a SendOutcome, so "unclear means unknown"
// is visible in the types (docs/BACKEND_ARCHITECTURE.md §4). The message is plain text plus the
// entities made by formatPublicationText, with no parse_mode; link previews are switched off
// explicitly so a pasted link never turns a curated post into a surprise card.
export function createTelegramPublicationTransport(
  sender: TelegramSender,
  timeoutMs: number = SEND_TIMEOUT_MS
): PublicationTransport {
  return {
    async send({ chatId, text, entities, media }) {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        if (media.length === 0) {
          const message = await sender.sendMessage(
            chatId,
            text,
            { entities, link_preview_options: { is_disabled: true } },
            signal
          );
          return classifySendResult(message);
        }
        if (media.length === 1) {
          const item = media[0];
          if (item === undefined) return { kind: 'unknown', reason: 'media_missing' };
          const file = new InputFile(streamChunks(item.body), item.fileName);
          const options = { caption: text, caption_entities: entities };
          const message =
            item.kind === 'photo'
              ? await sender.sendPhoto(chatId, file, options, signal)
              : item.kind === 'video'
                ? await sender.sendVideo(chatId, file, options, signal)
                : await sender.sendAnimation(chatId, file, options, signal);
          return classifySendResult(message);
        }
        if (media.length > 10 || media.some(({ kind }) => kind === 'animation')) {
          return { kind: 'rejected', code: 'CONTENT_INVALID' };
        }
        const group = media.map((item, index) => {
          const common = {
            media: new InputFile(streamChunks(item.body), item.fileName),
            ...(index === 0 ? { caption: text, caption_entities: entities } : {})
          };
          return item.kind === 'photo' ? { type: 'photo' as const, ...common } : { type: 'video' as const, ...common };
        });
        const messages = await sender.sendMediaGroup(chatId, group, signal);
        return classifySendGroupResult(messages, media.length);
      } catch (error) {
        // grammY reports an aborted request as a network error; the timeout is the more useful reason.
        if (signal.aborted) return { kind: 'unknown', reason: 'timeout' };
        return classifyTelegramError(error);
      }
    }
  };
}

async function* streamChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

function classifySendGroupResult(result: unknown, expectedCount: number): import('../application/ports').SendOutcome {
  if (!Array.isArray(result) || result.length !== expectedCount)
    return { kind: 'unknown', reason: 'ok_without_message_id' };
  const ids: string[] = [];
  for (const message of result) {
    if (typeof message !== 'object' || message === null || !('message_id' in message))
      return { kind: 'unknown', reason: 'ok_without_message_id' };
    const id = message.message_id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)
      return { kind: 'unknown', reason: 'ok_without_message_id' };
    ids.push(String(id));
  }
  return { kind: 'sent', externalMessageIds: ids };
}
