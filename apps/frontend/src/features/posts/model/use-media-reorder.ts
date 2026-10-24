import type { PostMediaDto } from '@alexeev/contracts';
import { useState, type KeyboardEvent } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { reorderPostMedia } from '../api/post-media-api';
import type { Entry } from './media-entry';
import { friendlyError } from './media-errors';
import type { MediaState } from './use-media-state';

/** Drag-and-drop and keyboard (Space, arrows, Escape) reordering of server-confirmed attachments. */
export function useMediaReorder(state: MediaState) {
  const { postId, disabled, busy, entries, setEntries, setBusy, setNotice, beginWrite, endWrite, revisionRef } = state;
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [keyboardDraggedKey, setKeyboardDraggedKey] = useState<string | null>(null);
  const [keyboardTargetKey, setKeyboardTargetKey] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  async function moveBefore(dragged: Entry, target: Entry) {
    if (
      !postId ||
      disabled ||
      busy ||
      dragged.status !== 'uploaded' ||
      target.status !== 'uploaded' ||
      !dragged.media ||
      !target.media
    )
      return;
    const uploaded = entries.filter((item): item is Entry & { media: PostMediaDto } => item.media !== undefined);
    const next = uploaded.filter((item) => item.key !== dragged.key);
    const draggedMedia = dragged.media;
    const targetIndex = next.findIndex((item) => item.key === target.key);
    if (targetIndex < 0 || dragged.key === target.key) return;
    next.splice(targetIndex, 0, dragged as Entry & { media: PostMediaDto });
    if (!beginWrite()) return;
    setBusy(true);
    try {
      const result = await reorderPostMedia(
        postId,
        revisionRef.current,
        next.map((item) => item.media.id)
      );
      const ordered = next.map((item, position) => ({ ...item.media, position }));
      setEntries((current) => [
        ...ordered.map((item) => ({ key: item.id, media: item, status: 'uploaded' as const })),
        ...current.filter((item) => !item.media)
      ]);
      state.applyServerMedia(result.revision, ordered);
      setAnnouncement(
        `Файл ${draggedMedia.fileName} перемещён на позицию ${ordered.findIndex((item) => item.id === draggedMedia.id) + 1}`
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) state.onRevisionConflict?.();
      setNotice(friendlyError(error));
    } finally {
      setBusy(false);
      endWrite();
      setDraggedKey(null);
    }
  }

  function handleReorderPress(entry: Entry) {
    if (!postId || disabled || busy || entry.status !== 'uploaded' || !entry.media) return;
    if (!keyboardDraggedKey) {
      setKeyboardDraggedKey(entry.key);
      setKeyboardTargetKey(entry.key);
      setAnnouncement(`Файл ${entry.media.fileName} выбран для перестановки. Используйте стрелки`);
      return;
    }
    const source = entries.find((item) => item.key === keyboardDraggedKey);
    const target = entries.find((item) => item.key === (keyboardTargetKey ?? entry.key));
    if (source && target) void moveBefore(source, target);
    setKeyboardDraggedKey(null);
    setKeyboardTargetKey(null);
  }

  function handleReorderKeyDown(event: KeyboardEvent<HTMLElement>, entry: Entry) {
    if (!postId || disabled || busy || entry.status !== 'uploaded' || !entry.media) return;
    if (event.key === 'Escape' && keyboardDraggedKey) {
      event.preventDefault();
      setKeyboardDraggedKey(null);
      setKeyboardTargetKey(null);
      setAnnouncement('Перестановка отменена');
      return;
    }
    if (keyboardDraggedKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const uploaded = entries.filter((item) => item.media);
      const index = uploaded.findIndex((item) => item.key === (keyboardTargetKey ?? keyboardDraggedKey));
      const nextIndex = index + (event.key === 'ArrowUp' ? -1 : 1);
      const target = uploaded[nextIndex];
      if (target) {
        setKeyboardTargetKey(target.key);
        setAnnouncement(`Целевая позиция ${nextIndex + 1}: ${target.media?.fileName ?? ''}`);
      }
    }
  }

  return {
    announcement,
    draggedKey,
    keyboardTargetKey,
    startDrag: (key: string) => setDraggedKey(key),
    endDrag: () => setDraggedKey(null),
    moveBefore,
    handleReorderPress,
    handleReorderKeyDown
  };
}

export type MediaReorder = ReturnType<typeof useMediaReorder>;
