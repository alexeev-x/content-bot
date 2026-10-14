import {
  ANIMATION_MEDIA_MAX_BYTES,
  PHOTO_MEDIA_MAX_BYTES,
  POST_MEDIA_MAX_ITEMS,
  VIDEO_MEDIA_MAX_BYTES
} from '@alexeev/contracts';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { AppError } from '../../shared/app-error';
import type { TelegramCaller } from './telegram-call';

/** What `getFile` can serve a bot: a larger file is refused by Telegram itself. */
const BOT_API_DOWNLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const DOWNLOAD_TIMEOUT_MS = 20_000;
// A stale revision means the owner edited the draft meanwhile; the next try reads the new one.
const ATTACH_ATTEMPTS = 4;

export type BotMediaKind = 'photo' | 'video' | 'animation';

export interface BotMediaFile {
  fileId: string;
  uniqueId: string;
  kind: BotMediaKind;
  fileName: string | null;
  mimeType: string | null;
  /** From the message; absent when Telegram did not say. */
  size: number | null;
}

export function mediaLimit(kind: BotMediaKind): number {
  const own =
    kind === 'photo' ? PHOTO_MEDIA_MAX_BYTES : kind === 'video' ? VIDEO_MEDIA_MAX_BYTES : ANIMATION_MEDIA_MAX_BYTES;
  return Math.min(own, BOT_API_DOWNLOAD_MAX_BYTES);
}

const fileInfoSchema = z.object({ file_path: z.string().optional(), file_size: z.number().optional() });

export interface TelegramFileSource {
  /**
   * Fetches a file once, or says it is over `maxBytes`. The bytes are kept so a stale revision can retry the
   * attach without downloading again (at most 20 MB, one file at a time). Throws `AppError` when Telegram fails.
   */
  fetch(
    file: BotMediaFile,
    maxBytes: number,
    timeoutMs: number
  ): Promise<{ status: 'ok'; bytes: Uint8Array } | { status: 'too_large' }>;
}

async function readBounded(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

// `getFile` goes through the shared caller (deadline, stable log codes); the download has its own deadline.
// The token is part of the download URL, so it is never logged and the URL is never put in an error.
export function createTelegramFileSource(deps: {
  token: string;
  call: TelegramCaller;
  getFile: (fileId: string, signal: AbortSignal) => Promise<unknown>;
}): TelegramFileSource {
  return {
    async fetch(file, maxBytes, timeoutMs) {
      // `timeoutMs` is the whole fetch (getFile and download), so a run cannot outlast its budget.
      const startedAt = Date.now();
      const info = await deps.call.read(
        'get_file',
        (signal) => deps.getFile(file.fileId, AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])),
        fileInfoSchema
      );
      if (info.file_size !== undefined && info.file_size > maxBytes) return { status: 'too_large' };
      if (info.file_path === undefined) throw new AppError('UNAVAILABLE', 'Telegram returned no file path');
      try {
        const response = await fetch(`https://api.telegram.org/file/bot${deps.token}/${info.file_path}`, {
          signal: AbortSignal.timeout(Math.max(1_000, timeoutMs - (Date.now() - startedAt)))
        });
        if (!response.ok || response.body === null) {
          await response.body?.cancel().catch(() => undefined);
          throw new Error('download failed');
        }
        const bytes = await readBounded(response.body, maxBytes);
        return bytes === null ? { status: 'too_large' } : { status: 'ok', bytes };
      } catch {
        throw new AppError('UNAVAILABLE', 'Telegram file download failed');
      }
    }
  };
}

function extensionOf(kind: BotMediaKind, contentType: string): string {
  if (kind === 'photo') return 'jpg';
  return contentType === 'image/gif' ? 'gif' : 'mp4';
}

export type ImportOutcome = 'attached' | 'too_large' | 'failed';

export interface ImportMediaDeps {
  source: TelegramFileSource;
  /** Revision of the draft and how many files it holds; null when the post is gone. */
  postState: (postId: string) => Promise<{ revision: number; mediaCount: number } | null>;
  upload: (command: {
    postId: string;
    revision: number;
    fileName: string;
    contentType: string;
    contentLength: number;
    body: ReadableStream<Uint8Array>;
    idempotencyKey: string;
  }) => Promise<unknown>;
}

// Downloads one Telegram file once and attaches it to the draft through the same use case as the HTTP
// upload, so size, signature and dimension checks are the upload's. Only the revision race is retried, and
// it retries the attach alone. A Telegram or storage outage throws `AppError('UNAVAILABLE')`: the worker retries later.
export async function importMedia(
  deps: ImportMediaDeps,
  postId: string,
  file: BotMediaFile,
  idempotencyKey: string,
  timeoutMs: number
): Promise<ImportOutcome> {
  const maxBytes = mediaLimit(file.kind);
  if (file.size !== null && file.size > maxBytes) return 'too_large';
  const contentType = file.kind === 'photo' ? 'image/jpeg' : (file.mimeType ?? 'video/mp4');
  const fileName = (file.fileName ?? `telegram-${file.uniqueId}.${extensionOf(file.kind, contentType)}`).slice(0, 255);

  const fetched = await deps.source.fetch(file, maxBytes, timeoutMs);
  if (fetched.status === 'too_large') return 'too_large';

  for (let attempt = 0; attempt < ATTACH_ATTEMPTS; attempt += 1) {
    const state = await deps.postState(postId);
    if (state === null || state.mediaCount >= POST_MEDIA_MAX_ITEMS) return 'failed';
    try {
      await deps.upload({
        postId,
        revision: state.revision,
        fileName,
        contentType,
        contentLength: fetched.bytes.byteLength,
        // The one buffer is the stream's only chunk: no second copy of up to 20 MB.
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(fetched.bytes);
            controller.close();
          }
        }),
        idempotencyKey
      });
      return 'attached';
    } catch (error) {
      if (error instanceof HTTPException && error.status === 413) return 'too_large';
      if (error instanceof HTTPException && error.status < 500) return 'failed';
      if (!(error instanceof AppError)) throw error;
      if (error.code === 'CONFLICT' && error.details?.reason === 'STALE_REVISION') continue;
      if (error.code === 'VALIDATION_ERROR' || error.code === 'NOT_FOUND' || error.code === 'CONFLICT') return 'failed';
      throw error;
    }
  }
  return 'failed';
}
