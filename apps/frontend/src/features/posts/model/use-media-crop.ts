import type { PostMediaDto } from '@alexeev/contracts';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { cropPostMedia, getPostMediaContent, reorderPostMedia } from '../api/post-media-api';
import { cropFrameForRatio, defaultCropModel, exportCrop, renderCrop, type CropModel, type CropRatio } from './crop';
import { cropErrorMessage, friendlyError } from './media-errors';
import type { MediaState } from './use-media-state';

/** The crop dialog: loads the original, keeps the crop model and saves the result as a new attachment. */
export function useMediaCrop(state: MediaState) {
  const { postId, disabled, busy, setEntries, setBusy, beginWrite, endWrite, queryClient, revisionRef, mediaRef } =
    state;
  const [media, setMedia] = useState<PostMediaDto | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [cropBusy, setCropBusy] = useState(false);
  const [model, setModel] = useState<CropModel>(defaultCropModel);
  const [cover, setCover] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const previewCanvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!media) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void getPostMediaContent(media.sourceMediaId ?? media.id, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        const probe = new Image();
        probe.onload = () => setNaturalSize({ width: probe.naturalWidth, height: probe.naturalHeight });
        probe.src = objectUrl;
        setUrl(objectUrl);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(cropErrorMessage(caught));
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [media]);

  useEffect(() => {
    if (!url || !previewCanvas.current) return;
    const image = new Image();
    let active = true;
    image.src = url;
    void image
      .decode()
      .then(() => {
        const canvas = previewCanvas.current;
        if (!active || !canvas) return;
        renderCrop(image, model, canvas, 560);
      })
      .catch(() => {
        if (active) setError('Не удалось подготовить предпросмотр кадрирования.');
      });
    return () => {
      active = false;
    };
  }, [model, url]);

  const aspectFor = (rotation: number) =>
    naturalSize
      ? rotation % 180 === 0
        ? naturalSize.width / naturalSize.height
        : naturalSize.height / naturalSize.width
      : 4 / 3;

  function open(item: PostMediaDto) {
    setModel(defaultCropModel());
    setCover(item.position === 0);
    setNaturalSize(item.width && item.height ? { width: item.width, height: item.height } : null);
    setUrl(null);
    setError('');
    setMedia(item);
  }

  function close() {
    setMedia(null);
  }

  function reset() {
    setModel(defaultCropModel());
  }

  function rotate(delta: -90 | 90) {
    const rotation = ((model.rotation + delta + 360) % 360) as CropModel['rotation'];
    setModel((current) => ({ ...current, rotation, frame: cropFrameForRatio(current.ratio, aspectFor(rotation)) }));
  }

  function setRatio(ratio: CropRatio) {
    setModel((current) => ({ ...current, ratio, frame: cropFrameForRatio(ratio, aspectFor(current.rotation)) }));
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
    if (!media || !url || !postId || busy || disabled) return;
    if (!beginWrite()) return;
    setCropBusy(true);
    setBusy(true);
    setError('');
    try {
      const source = new Image();
      source.src = url;
      await source.decode();
      const blob = await exportCrop(source, model);
      const extension = blob.type === 'image/webp' ? '.webp' : '.jpg';
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
      setMedia(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) state.onRevisionConflict?.();
      setError(cropErrorMessage(caught));
    } finally {
      setCropBusy(false);
      setBusy(false);
      endWrite();
    }
  }

  return {
    media,
    url,
    error,
    cropBusy,
    model,
    setModel,
    cover,
    naturalSize,
    previewCanvas,
    open,
    close,
    reset,
    rotate,
    setRatio,
    setAsCover,
    apply
  };
}

export type MediaCrop = ReturnType<typeof useMediaCrop>;
