import { VIDEO_MEDIA_MAX_BYTES } from '@alexeev/contracts';

export const VIDEO_UNSUPPORTED_MESSAGE = 'Ваш браузер не умеет обрабатывать видео — откройте в Chrome или Safari 17+';

export type VideoCropFailure = 'unsupported' | 'too-large' | 'failed';
export class VideoCropError extends Error {
  constructor(readonly reason: VideoCropFailure) {
    super(`video-crop-${reason}`);
  }
}

export function videoCropErrorMessage(error: unknown): string {
  if (error instanceof VideoCropError) {
    if (error.reason === 'unsupported') return VIDEO_UNSUPPORTED_MESSAGE;
    if (error.reason === 'too-large')
      return 'Ролик получился больше 50 МБ даже после сжатия. Обрежьте его по времени или выберите меньшую область.';
  }
  return 'Не удалось обработать видео. Исходный файл не изменён.';
}

export type VideoInfo = { width: number; height: number; duration: number };
export type VideoCropOptions = {
  rect: { left: number; top: number; width: number; height: number };
  /** Seconds; omitted sides keep the clip's own start or end. */
  trim?: { start: number; end: number };
  signal: AbortSignal;
  /** 0–1 across all attempts. */
  onProgress: (fraction: number) => void;
};

// Mediabunny drives WebCodecs, so without a video encoder and decoder nothing can be processed.
export function videoCropSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined';
}

// Each retry re-encodes at a lower quality until the file fits the Telegram upload limit.
const QUALITY_STEPS = ['high', 'medium', 'low'] as const;

// The library (~hundreds of KB) is imported here and nowhere else, so it never reaches the first screen.
const loadMediabunny = () => import('mediabunny');

export async function probeVideo(blob: Blob): Promise<VideoInfo> {
  if (!videoCropSupported()) throw new VideoCropError('unsupported');
  const { Input, BlobSource, ALL_FORMATS } = await loadMediabunny();
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new VideoCropError('failed');
    const [width, height, duration] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      input.computeDuration()
    ]);
    return { width, height, duration };
  } catch (error) {
    throw error instanceof VideoCropError ? error : new VideoCropError('failed');
  } finally {
    input.dispose();
  }
}

/** Crops (and optionally trims) a video into an H.264/AAC MP4 no larger than VIDEO_MEDIA_MAX_BYTES. */
export async function cropVideo(source: Blob, options: VideoCropOptions): Promise<Blob> {
  if (!videoCropSupported()) throw new VideoCropError('unsupported');
  const { Input, Output, BlobSource, ALL_FORMATS, Mp4OutputFormat, BufferTarget, Conversion, Quality } =
    await loadMediabunny();
  for (const [attempt, level] of QUALITY_STEPS.entries()) {
    if (options.signal.aborted) throw new DOMException('Video crop cancelled', 'AbortError');
    const input = new Input({ source: new BlobSource(source), formats: ALL_FORMATS });
    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    let conversion: Awaited<ReturnType<typeof Conversion.init>> | undefined;
    const abort = () => void conversion?.cancel();
    try {
      conversion = await Conversion.init({
        input,
        output,
        video: { crop: options.rect, codec: 'avc', quality: new Quality(level) },
        ...(options.trim ? { trim: options.trim } : {})
      });
      // A dropped track would silently lose the sound or the picture, so any discard is a failure.
      if (!conversion.isValid || conversion.discardedTracks.some(({ reason }) => reason !== 'discarded_by_user'))
        throw new VideoCropError('unsupported');
      conversion.onProgress = (fraction) => options.onProgress((attempt + fraction) / QUALITY_STEPS.length);
      options.signal.addEventListener('abort', abort, { once: true });
      if (options.signal.aborted) abort();
      await conversion.execute();
    } catch (error) {
      if (options.signal.aborted) throw new DOMException('Video crop cancelled', 'AbortError');
      throw error instanceof VideoCropError ? error : new VideoCropError('failed');
    } finally {
      options.signal.removeEventListener('abort', abort);
      input.dispose();
    }
    const buffer = output.target.buffer;
    if (!buffer) throw new VideoCropError('failed');
    if (buffer.byteLength <= VIDEO_MEDIA_MAX_BYTES) {
      options.onProgress(1);
      return new Blob([buffer], { type: 'video/mp4' });
    }
  }
  throw new VideoCropError('too-large');
}
