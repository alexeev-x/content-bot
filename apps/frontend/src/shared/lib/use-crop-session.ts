import { useEffect, useRef, useState } from 'react';
import {
  cropFrameForRatio,
  defaultCropModel,
  exportCrop,
  renderCrop,
  videoCropRect,
  type CropModel,
  type CropRatio
} from './media-crop';
import { createMediaThumbnail } from './media-thumbnail';
import { cropVideo, probeVideo, VIDEO_UNSUPPORTED_MESSAGE, VideoCropError } from './video-crop';

export type CropSource = { kind: 'photo' | 'video'; width: number | null; height: number | null };

/**
 * What every crop dialog needs, photo or video: the original bytes, the picture the frame is dragged over (the
 * photo itself or a video poster), its natural size and the crop model. Saving is up to the caller.
 */
export function useCropSession<T extends CropSource>(options: {
  load: (source: T, signal: AbortSignal) => Promise<Blob>;
  describeError: (error: unknown) => string;
}) {
  const [source, setSource] = useState<T | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [trim, setTrim] = useState<{ start: number; end: number } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const processing = useRef<AbortController | null>(null);
  const [model, setModel] = useState<CropModel>(defaultCropModel);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const { load, describeError } = options;
  const loadRef = useRef({ load, describeError });
  useEffect(() => {
    loadRef.current = { load, describeError };
  });

  useEffect(() => {
    if (!source) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    const show = (nextUrl: string) => {
      objectUrl = nextUrl;
      setUrl(nextUrl);
    };
    void loadRef.current
      .load(source, controller.signal)
      .then(async (loaded) => {
        if (controller.signal.aborted) return;
        if (source.kind === 'video') {
          const info = await probeVideo(loaded);
          const poster = await createMediaThumbnail(loaded, 'video', controller.signal);
          if (controller.signal.aborted) return;
          setNaturalSize({ width: info.width, height: info.height });
          setDuration(info.duration);
          setTrim({ start: 0, end: info.duration });
          show(URL.createObjectURL(poster));
        } else {
          const photoUrl = URL.createObjectURL(loaded);
          const probe = new Image();
          probe.onload = () => setNaturalSize({ width: probe.naturalWidth, height: probe.naturalHeight });
          probe.src = photoUrl;
          show(photoUrl);
        }
        setBlob(loaded);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof VideoCropError && caught.reason === 'unsupported'
            ? VIDEO_UNSUPPORTED_MESSAGE
            : loadRef.current.describeError(caught)
        );
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  useEffect(() => {
    if (source?.kind !== 'photo' || !url || !previewCanvas.current) return;
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
  }, [model, source?.kind, url]);

  const aspectFor = (rotation: number) =>
    naturalSize
      ? rotation % 180 === 0
        ? naturalSize.width / naturalSize.height
        : naturalSize.height / naturalSize.width
      : 4 / 3;

  return {
    source,
    blob,
    url,
    duration,
    error,
    setError,
    model,
    setModel,
    naturalSize,
    previewCanvas,
    open(next: T) {
      setModel(defaultCropModel());
      setNaturalSize(next.width && next.height ? { width: next.width, height: next.height } : null);
      setBlob(null);
      setUrl(null);
      setDuration(null);
      setTrim(null);
      setError('');
      setSource(next);
    },
    close() {
      processing.current?.abort();
      setSource(null);
    },
    trim:
      duration !== null && trim !== null
        ? { duration, ...trim, onChange: (start: number, end: number) => setTrim({ start, end }) }
        : undefined,
    progress,
    cancelProcessing() {
      processing.current?.abort();
    },
    /** The cropped file: a JPEG/WebP photo, or an MP4 video (throws AbortError when cancelled). */
    async render(): Promise<Blob> {
      if (!source || !url || !naturalSize) throw new Error('crop-not-ready');
      if (source.kind === 'photo') {
        const image = new Image();
        image.src = url;
        await image.decode();
        return exportCrop(image, model);
      }
      if (!blob) throw new Error('crop-not-ready');
      const controller = new AbortController();
      processing.current = controller;
      setProgress(0);
      const trimmed = trim !== null && duration !== null && (trim.start > 0.05 || trim.end < duration - 0.05);
      try {
        return await cropVideo(blob, {
          rect: videoCropRect(naturalSize, model.frame),
          ...(trimmed ? { trim } : {}),
          signal: controller.signal,
          onProgress: setProgress
        });
      } finally {
        processing.current = null;
        setProgress(null);
      }
    },
    reset() {
      setModel(defaultCropModel());
    },
    rotate(delta: -90 | 90) {
      const rotation = ((model.rotation + delta + 360) % 360) as CropModel['rotation'];
      setModel((current) => ({ ...current, rotation, frame: cropFrameForRatio(current.ratio, aspectFor(rotation)) }));
    },
    setRatio(ratio: CropRatio) {
      setModel((current) => ({ ...current, ratio, frame: cropFrameForRatio(ratio, aspectFor(current.rotation)) }));
    }
  };
}
