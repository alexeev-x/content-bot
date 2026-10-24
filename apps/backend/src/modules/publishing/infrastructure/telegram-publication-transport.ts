import { InputFile } from 'grammy';
import type { InputMediaPhoto, InputMediaVideo } from '@grammyjs/types';
import { type PostEntity, type PostPoll, richMediaId, richMediaPositions } from '@alexeev/contracts';
import type { PublicationTransport } from '../application/ports';
import { sendTimeoutMs } from '../domain/dispatch-policy';
import { classifySendResult, classifyTelegramError } from './classify-telegram-result';

// What the adapter needs to send: `integrations/telegram` provides it, tests script it.
export interface TelegramSender {
  sendMessage(
    chatId: string,
    text: string,
    other: SendFlags & { entities: PostEntity[]; link_preview_options?: { is_disabled: boolean } },
    signal: AbortSignal
  ): Promise<unknown>;
  sendPhoto(
    chatId: string,
    photo: InputFile,
    other: SendFlags & { caption: string; caption_entities: PostEntity[] },
    signal: AbortSignal
  ): Promise<unknown>;
  sendVideo(
    chatId: string,
    video: InputFile,
    other: SendFlags & { caption: string; caption_entities: PostEntity[] },
    signal: AbortSignal
  ): Promise<unknown>;
  sendAnimation(
    chatId: string,
    animation: InputFile,
    other: SendFlags & { caption: string; caption_entities: PostEntity[] },
    signal: AbortSignal
  ): Promise<unknown>;
  sendMediaGroup(
    chatId: string,
    media: (InputMediaPhoto<InputFile> | InputMediaVideo<InputFile>)[],
    other: SendFlags,
    signal: AbortSignal
  ): Promise<unknown>;
  /** A rich message (Bot API 10.1); `media` are the uploads its HTML names as `tg://photo?id=…`. */
  sendRichMessage(
    chatId: string,
    message: { html: string; media: { id: string; kind: 'photo' | 'video' | 'animation'; file: InputFile }[] },
    other: SendFlags,
    signal: AbortSignal
  ): Promise<unknown>;
  sendPoll(
    chatId: string,
    poll: SendFlags & {
      question: string;
      options: string[];
      type: 'regular' | 'quiz';
      allows_multiple_answers: boolean;
      correct_option_ids?: number[];
      explanation?: string;
    },
    signal: AbortSignal
  ): Promise<unknown>;
}

interface SendFlags {
  disable_notification: boolean;
  protect_content: boolean;
}

// Never throws: every answer, error and timeout becomes a SendOutcome, so "unclear means unknown"
// is visible in the types (docs/BACKEND_ARCHITECTURE.md §4). The message is plain text plus the
// entities made by formatPublicationText, with no parse_mode. The link preview is switched off only when the post
// says so (a text message without media; a caption or a poll has none). A poll is always anonymous: channels
// accept no other kind. The call's bound grows with the files it uploads (the same bound the dispatcher's lease
// check used); `timeoutMs` fixes it for tests.
export function createTelegramPublicationTransport(sender: TelegramSender, timeoutMs?: number): PublicationTransport {
  return {
    async send({ chatId, text, entities, media, options, poll, richHtml }) {
      const mediaBytes = media.reduce((total, item) => total + item.sizeBytes, 0);
      const signal = AbortSignal.timeout(timeoutMs ?? sendTimeoutMs(mediaBytes));
      const flags: SendFlags = { disable_notification: options.silent, protect_content: options.protectContent };
      try {
        if (poll !== null) {
          return classifySendResult(await sender.sendPoll(chatId, pollParams(poll, flags), signal));
        }
        if (richHtml !== null) {
          // Only the media the HTML names are uploaded, each under its position's id (contracts post-rich.ts).
          const uploads = richMediaPositions(richHtml).flatMap((position) => {
            const item = media[position];
            return item === undefined
              ? []
              : [
                  {
                    id: richMediaId(position),
                    kind: item.kind,
                    file: new InputFile(streamChunks(item.body), item.fileName)
                  }
                ];
          });
          return classifySendResult(
            await sender.sendRichMessage(chatId, { html: richHtml, media: uploads }, flags, signal)
          );
        }
        if (media.length === 0) {
          const message = await sender.sendMessage(
            chatId,
            text,
            { entities, ...flags, ...(options.linkPreview ? {} : { link_preview_options: { is_disabled: true } }) },
            signal
          );
          return classifySendResult(message);
        }
        if (media.length === 1) {
          const item = media[0];
          if (item === undefined) return { kind: 'unknown', reason: 'media_missing' };
          const file = new InputFile(streamChunks(item.body), item.fileName);
          const captionOptions = { caption: text, caption_entities: entities, ...flags };
          const message =
            item.kind === 'photo'
              ? await sender.sendPhoto(chatId, file, captionOptions, signal)
              : item.kind === 'video'
                ? await sender.sendVideo(chatId, file, captionOptions, signal)
                : await sender.sendAnimation(chatId, file, captionOptions, signal);
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
        const messages = await sender.sendMediaGroup(chatId, group, flags, signal);
        return classifySendGroupResult(messages, media.length);
      } catch (error) {
        // grammY reports an aborted request as a network error; the timeout is the more useful reason.
        if (signal.aborted) return { kind: 'unknown', reason: 'timeout' };
        return classifyTelegramError(error);
      }
    }
  };
}

function pollParams(poll: PostPoll, flags: SendFlags): Parameters<TelegramSender['sendPoll']>[1] {
  return {
    question: poll.question.trim(),
    options: poll.options.map((option) => option.trim()),
    type: poll.quiz === null ? 'regular' : 'quiz',
    allows_multiple_answers: poll.allowsMultipleAnswers,
    ...(poll.quiz === null ? {} : { correct_option_ids: [poll.quiz.correctOptionIndex] }),
    ...(poll.quiz === null || poll.quiz.explanation.trim() === '' ? {} : { explanation: poll.quiz.explanation.trim() }),
    ...flags
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
