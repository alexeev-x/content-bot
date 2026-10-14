import type { PostMediaDto } from '@alexeev/contracts';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { useCropSession } from '../../../shared/lib/use-crop-session';
import { videoCropErrorMessage, VideoCropError } from '../../../shared/lib/video-crop';
import { cropPostMedia, getPostMediaContent, reorderPostMedia } from '../api/post-media-api';
import { cropErrorMessage, friendlyError } from './media-errors';
import type { MediaState } from './use-media-state';

const isCroppable = (media: PostMediaDto): media is PostMediaDto & { kind: 'photo' | 'video' } =>
  media.kind === 'photo' || media.kind === 'video';

/** The crop dialog: loads the original, keeps the crop model and saves the result as a new attachment. */
export function useMediaCrop(state: MediaState) {
  const { postId, disabled, busy, setEntries, setBusy, beginWrite, endWrite, queryClient, revisionRef, mediaRef } =
    state;
  const [cropBusy, setCropBusy] = useState(false);
  const [cover, setCover] = useState(false);
  const session = useCropSession<PostMediaDto & { kind: 'photo' | 'video' }>({
    load: (item, signal) => getPostMediaContent(item.sourceMediaId ?? item.id, signal),
    describeError: cropErrorMessage
  });
  const { error, setError, source: media } = session;

  function open(item: PostMediaDto) {
    if (!isCroppable(item)) return;
    setCover(item.position === 0);
    session.open(item);
  }

  function close() {
    session.close();
  }

  async function setAsCover(isSelected: boolean) {
    if (!isSelected) {
      setCover(false);
      return;
    }
    if (!media || media.position === 0) {
      setCover(true);
      return;
    }
    if (!postId || disabled || busy) return;
    const ordered = [...mediaRef.current].sort((left, right) => left.position - right.position);
    const selected = ordered.find((item) => item.id === media.id);
    if (!selected || !beginWrite()) return;
    setCover(true);
    setBusy(true);
    try {
      const next = [selected, ...ordered.filter((item) => item.id !== selected.id)];
      const result = await reorderPostMedia(
        postId,
        revisionRef.current,
        next.map((item) => item.id)
      );
      const updated = next.map((item, position) => ({ ...item, position }));
      setEntries((current) => [
        ...updated.map((item) => ({ key: item.id, media: item, status: 'uploaded' as const })),
        ...current.filter((item) => !item.media)
      ]);
      state.applyServerMedia(result.revision, updated);
    } catch (caught) {
      setCover(false);
      if (caught instanceof ApiError && caught.status === 409) state.onRevisionConflict?.();
      setError(`Не удалось сделать фото первым в посте. ${friendlyError(caught)}`);
    } finally {
      setBusy(false);
      endWrite();
    }
  }

  async function apply() {
    if (!media || !session.url || !postId || busy || disabled) return;
    if (!beginWrite()) return;
    setCropBusy(true);
    setBusy(true);
    setError('');
    try {
      const blob = await session.render();
      const extension = blob.type === 'video/mp4' ? '.mp4' : blob.type === 'image/webp' ? '.webp' : '.jpg';
      const result = await cropPostMedia(
        postId,
        media.id,
        revisionRef.current,
        blob,
        media.fileName.replace(/\.[^.]+$/, extension),
        crypto.randomUUID()
      );
      void queryClient.invalidateQueries({ queryKey: ['post-media', 'library'] });
      const next = mediaRef.current.map((item) => (item.id === media.id ? result.media : item));
      state.applyServerMedia(result.revision, next);
      setEntries((current) =>
        current.map((entry) =>
          entry.media?.id === media.id ? { key: result.media.id, media: result.media, status: 'uploaded' } : entry
        )
      );
      close();
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 409) state.onRevisionConflict?.();
      setError(caught instanceof VideoCropError ? videoCropErrorMessage(caught) : cropErrorMessage(caught));
    } finally {
      setCropBusy(false);
      setBusy(false);
      endWrite();
    }
  }

  return {
    media,
    url: session.url,
    error,
    cropBusy,
    model: session.model,
    setModel: session.setModel,
    cover,
    naturalSize: session.naturalSize,
    previewCanvas: session.previewCanvas,
    trim: session.trim,
    progress: session.progress,
    cancelProcessing: session.cancelProcessing,
    open,
    close,
    reset: session.reset,
    rotate: session.rotate,
    setRatio: session.setRatio,
    setAsCover,
    apply
  };
}

export type MediaCrop = ReturnType<typeof useMediaCrop>;
