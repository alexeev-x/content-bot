/** Shortest clip the trim UI allows (a shorter media is allowed to be trimmed to its own length). */
export const MIN_CLIP_SECONDS = 1;
export const TRIM_STEP = 0.1;
export const FILMSTRIP_FRAMES = 10;

export type TrimRange = { start: number; end: number };

const tenths = (value: number) => Math.round(value * 10) / 10;

/**
 * Keeps a range inside [0, duration] with at least the minimum length. `moved` is the handle the user is
 * dragging: the other one stays put unless the media is too short to hold the minimum.
 */
export function clampTrimRange(range: TrimRange, duration: number, moved: 'start' | 'end'): TrimRange {
  const safeDuration = Math.max(0, duration);
  const minLength = Math.min(MIN_CLIP_SECONDS, safeDuration);
  if (moved === 'start') {
    const end = Math.min(safeDuration, Math.max(range.end, minLength));
    const start = Math.min(Math.max(0, range.start), end - minLength);
    return { start: tenths(Math.max(0, start)), end: tenths(end) };
  }
  const start = Math.max(0, Math.min(range.start, safeDuration - minLength));
  const end = Math.max(start + minLength, Math.min(safeDuration, range.end));
  return { start: tenths(start), end: tenths(Math.min(end, safeDuration)) };
}

/** Moves one handle by `delta` seconds and clamps (keyboard Shift+arrows, 1 s). */
export function nudgeTrim(range: TrimRange, duration: number, handle: 'start' | 'end', delta: number): TrimRange {
  return clampTrimRange({ ...range, [handle]: range[handle] + delta }, duration, handle);
}

/** Time of each filmstrip frame: the middle of equal slices, so the first and last frames are not black fades. */
export function filmstripTimes(duration: number, count = FILMSTRIP_FRAMES): number[] {
  if (duration <= 0 || count <= 0) return [];
  return Array.from({ length: count }, (_, index) => ((index + 0.5) / count) * duration);
}

/** `m:ss.s` */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const whole = Math.floor(safe / 60);
  const rest = safe - whole * 60;
  return `${whole}:${rest.toFixed(1).padStart(4, '0')}`;
}

/** Thumbnails of evenly spaced frames as small JPEG data URLs; stops early when aborted. */
export async function extractFilmstrip(blob: Blob, duration: number, signal: AbortSignal): Promise<string[]> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  const canvas = document.createElement('canvas');
  const frames: string[] = [];
  try {
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('filmstrip-load'));
    });
    const ratio = video.videoWidth > 0 && video.videoHeight > 0 ? video.videoWidth / video.videoHeight : 16 / 9;
    canvas.height = 96;
    canvas.width = Math.max(1, Math.round(96 * ratio));
    const context = canvas.getContext('2d');
    if (!context) return frames;
    for (const time of filmstripTimes(duration)) {
      if (signal.aborted) break;
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error('filmstrip-seek'));
        video.currentTime = time;
      });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL('image/jpeg', 0.6));
    }
    return frames;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
