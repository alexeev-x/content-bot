import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MediaLibraryItemDto } from '@alexeev/contracts';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { useCropSession } from '../../../shared/lib/use-crop-session';
import { videoCropErrorMessage, VideoCropError } from '../../../shared/lib/video-crop';
import { deriveMedia, getMediaContent } from '../api/media-api';
import { mediaKeys } from '../api/media-queries';

type Croppable = MediaLibraryItemDto & { kind: 'photo' | 'video' };
const isCroppable = (item: MediaLibraryItemDto): item is Croppable => item.kind === 'photo' || item.kind === 'video';

function errorMessage(error: unknown): string {
  if (error instanceof VideoCropError) return videoCropErrorMessage(error);
  if (error instanceof ApiError) {
    if (error.status === 404) return 'Файл больше недоступен. Обновите библиотеку.';
    if (error.status === 413) return 'Кадр слишком велик для загрузки. Уменьшите область кадрирования.';
    if (error.status === 400) return 'Не удалось обработать кадрирование. Измените область и повторите попытку.';
    if (error.status === 503) return 'Сервис временно недоступен. Повторите попытку позже.';
    return `Не удалось сохранить копию.${error.requestId ? ` Запрос ${error.requestId}.` : ''}`;
  }
  return 'Не удалось сохранить копию. Оригинал не изменён.';
}

/** Crops a library photo or video into a NEW library item; the original is never changed. */
export function useLibraryCrop(onSaved: (item: MediaLibraryItemDto) => void) {
  const queryClient = useQueryClient();
  const session = useCropSession<Croppable>({
    load: (item, signal) => getMediaContent(item.id, signal),
    describeError: errorMessage
  });
  const [attempt, setAttempt] = useState(() => ({ key: crypto.randomUUID() }));
  const save = useMutation({
    retry: false,
    mutationFn: async (item: Croppable) => {
      const blob = await session.render();
      const extension = blob.type === 'video/mp4' ? '.mp4' : blob.type === 'image/webp' ? '.webp' : '.jpg';
      return deriveMedia(item.id, blob, item.fileName.replace(/\.[^.]+$/, '') + extension, item.kind, attempt.key);
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: mediaKeys.lists() });
      session.close();
      onSaved(created);
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
      setAttempt({ key: crypto.randomUUID() });
      session.open(item);
    },
    save() {
      if (session.source && !save.isPending) {
        session.setError('');
        save.mutate(session.source);
      }
    }
  };
}
