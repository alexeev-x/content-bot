import { useBlocker } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ANIMATION_MEDIA_MAX_BYTES, PHOTO_MEDIA_MAX_BYTES, VIDEO_MEDIA_MAX_BYTES } from '@alexeev/contracts';
import { ApiError } from '../../../shared/api/http-client';
import { uploadLibraryMedia } from '../api/media-api';
import { mediaKeys } from '../api/media-queries';

export const UPLOAD_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.mp4,image/jpeg,image/png,image/webp,image/gif,video/mp4';
const MAX_CONCURRENT = 2;
const UNSUPPORTED = 'Такой формат не поддерживается: только JPG, PNG, WebP, GIF, MP4';
const TYPE_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4'
};

export type UploadEntry = {
  key: string;
  file: File;
  idempotencyKey: string;
  status: 'queued' | 'uploading' | 'failed' | 'done';
  progress: number;
  error?: string;
  /** A client-side rejection can't succeed on retry. */
  retryable: boolean;
};

function limitFor(type: string): number {
  if (type === 'image/gif') return ANIMATION_MEDIA_MAX_BYTES;
  return type === 'video/mp4' ? VIDEO_MEDIA_MAX_BYTES : PHOTO_MEDIA_MAX_BYTES;
}

const tooBig = (limit: number) => `Файл больше ${Math.round(limit / 1_000_000)} МБ`;

/** The content type the server accepts, or undefined when the extension or the declared type does not match. */
function acceptedType(file: File): string | undefined {
  const expected = TYPE_BY_EXTENSION[file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''];
  return expected && (!file.type || file.type === expected) ? expected : undefined;
}

function uploadError(error: unknown, file: File): string {
  if (error instanceof ApiError) {
    if (error.status === 413) return tooBig(limitFor(acceptedType(file) ?? file.type));
    if (error.status === 415 || error.status === 400) return UNSUPPORTED;
    if (error.status === 401) return 'Сессия завершилась. Войдите снова и повторите загрузку.';
    if (error.status === 429) return 'Слишком много запросов. Подождите немного и повторите.';
  }
  return 'Не удалось загрузить файл. Проверьте соединение и повторите.';
}

/** A pasted screenshot is always «image.png»; a timestamp keeps pasted files apart. */
export function pastedFiles(files: File[]): File[] {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return files
    .filter((file) => file.type.startsWith('image/'))
    .map((file, index) => {
      if (file.name && !/^image\.(png|jpe?g)$/i.test(file.name)) return file;
      const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
      return new File([file], `Вставка ${stamp}${index ? `-${index + 1}` : ''}.${extension}`, { type: file.type });
    });
}

/** Library uploads: at most two at once, one Idempotency-Key per file across retries, nothing shown as done before the server says so. */
export function useLibraryUpload() {
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const activeRef = useRef(false);
  const alive = useRef(true);

  const patch = useCallback((key: string, change: Partial<UploadEntry>) => {
    setEntries((current) => current.map((entry) => (entry.key === key ? { ...entry, ...change } : entry)));
  }, []);

  const add = useCallback((files: File[]) => {
    setEntries((current) => [
      ...files.map((file): UploadEntry => {
        const type = acceptedType(file);
        const base = { key: crypto.randomUUID(), file, idempotencyKey: crypto.randomUUID(), progress: 0 };
        if (!type) return { ...base, status: 'failed', error: UNSUPPORTED, retryable: false };
        if (file.size > limitFor(type))
          return { ...base, status: 'failed', error: tooBig(limitFor(type)), retryable: false };
        return { ...base, status: 'queued', retryable: true };
      }),
      ...current
    ]);
  }, []);

  const retry = useCallback((key: string) => patch(key, { status: 'queued', progress: 0 }), [patch]);

  const remove = useCallback((key: string) => {
    controllers.current.get(key)?.abort();
    controllers.current.delete(key);
    setEntries((current) => current.filter((entry) => entry.key !== key));
  }, []);

  // Starts queued files while fewer than two run. Newest first, matching their order on screen.
  useEffect(() => {
    const running = entries.filter((entry) => entry.status === 'uploading').length;
    const next = entries.filter((entry) => entry.status === 'queued').slice(0, MAX_CONCURRENT - running);
    for (const entry of next) {
      const controller = new AbortController();
      controllers.current.set(entry.key, controller);
      // A start queue is external work scheduling: marking the file started is the synchronisation.
      // oxlint-disable-next-line react/set-state-in-effect
      patch(entry.key, { status: 'uploading', progress: 0 });
      uploadLibraryMedia(
        entry.file,
        entry.idempotencyKey,
        (percent) => patch(entry.key, { progress: percent }),
        controller.signal
      )
        .then(async () => {
          if (controller.signal.aborted) return;
          patch(entry.key, { status: 'done', progress: 100 });
          // The tile stays until the refetched list holds the real item, so the grid does not jump.
          await queryClient.invalidateQueries({ queryKey: mediaKeys.lists() });
          if (alive.current) setEntries((current) => current.filter((candidate) => candidate.key !== entry.key));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          patch(entry.key, { status: 'failed', error: uploadError(error, entry.file), retryable: true });
        })
        .finally(() => controllers.current.delete(entry.key));
    }
  }, [entries, patch, queryClient]);

  const busy = entries.some((entry) => entry.status === 'queued' || entry.status === 'uploading');
  useEffect(() => {
    activeRef.current = busy;
  }, [busy]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // oxlint-disable-next-line react/refs
      for (const controller of controllers.current.values()) controller.abort();
    };
  }, []);

  const blocker = useBlocker({
    shouldBlockFn: () => activeRef.current,
    enableBeforeUnload: () => activeRef.current,
    withResolver: true
  });

  return { entries, add, retry, remove, blocker };
}
