import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MediaLibraryItemDto } from '@alexeev/contracts';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { useCropSession } from '../../../shared/lib/use-crop-session';
import { videoCropErrorMessage, VideoCropError } from '../../../shared/lib/video-crop';
import { deriveMedia, getMediaContent, type DeriveMode } from '../api/media-api';
import { mediaKeys } from '../api/media-queries';

type Croppable = MediaLibraryItemDto & { kind: 'photo' | 'video' };
const isCroppable = (item: MediaLibraryItemDto): item is Croppable => item.kind === 'photo' || item.kind === 'video';

function errorMessage(error: unknown): string {
  if (error instanceof VideoCropError) return videoCropErrorMessage(error);
  if (error instanceof ApiError) {
    if (error.status === 409) return 'Файл изменился. Обновите библиотеку и повторите попытку.';
    if (error.status === 404) return 'Файл больше недоступен. Обновите библиотеку.';
    if (error.status === 413) return 'Кадр слишком велик для загрузки. Уменьшите область кадрирования.';
    if (error.status === 400) return 'Не удалось обработать кадрирование. Измените область и повторите попытку.';
    if (error.status === 503) return 'Сервис временно недоступен. Повторите попытку позже.';
    return `Не удалось сохранить копию.${error.requestId ? ` Запрос ${error.requestId}.` : ''}`;
  }
  return 'Не удалось сохранить копию. Оригинал не изменён.';
}

/** Crops a library photo or video into a NEW library item; `replace` also swaps it into the drafts that held the original. */
export function useLibraryCrop(onSaved: (item: MediaLibraryItemDto, mode: DeriveMode) => void) {
  const queryClient = useQueryClient();
  const session = useCropSession<Croppable>({
    load: (item, signal) => getMediaContent(item.id, signal),
    describeError: errorMessage
  });
  // One key per mode: a retry of the same save replays, a switch of mode is a different request.
  const [keys, setKeys] = useState(() => ({ new: crypto.randomUUID(), replace: crypto.randomUUID() }));
  const save = useMutation({
    retry: false,
    mutationFn: async ({ item, mode }: { item: Croppable; mode: DeriveMode }) => {
      const blob = await session.render();
      const extension = blob.type === 'video/mp4' ? '.mp4' : blob.type === 'image/webp' ? '.webp' : '.jpg';
      return deriveMedia(item.id, blob, item.fileName.replace(/\.[^.]+$/, '') + extension, item.kind, keys[mode], mode);
    },
    onSuccess: (created, { mode }) => {
      void queryClient.invalidateQueries({ queryKey: mediaKeys.lists() });
      if (mode === 'replace') void queryClient.invalidateQueries({ queryKey: ['posts'] });
      session.close();
      onSaved(created, mode);
    },
    onError: (error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      session.setError(errorMessage(error));
    }
  });

  return {
    ...session,
    busy: save.isPending,
    open(item: MediaLibraryItemDto) {
      if (!isCroppable(item)) return;
      setKeys({ new: crypto.randomUUID(), replace: crypto.randomUUID() });
      session.open(item);
    },
    save(mode: DeriveMode) {
      if (session.source && !save.isPending) {
        session.setError('');
        save.mutate({ item: session.source, mode });
      }
    }
  };
}
