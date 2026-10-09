/* oxlint-disable react/refs, react/exhaustive-effect-dependencies, react/capitalized-calls, jsx-a11y/prefer-tag-over-role, jsx-a11y/no-autofocus, jsx-a11y/no-noninteractive-element-interactions, unicorn/prefer-add-event-listener, eslint/no-shadow -- dev-only prototype: mock timers, live regions and a full-screen crop layer */
// Crop math of the post-editor prototype. The on-screen frame, the live preview and the saved file all go through
// `renderCrop`, so the result equals what the frame showed.
import { fitFrame, type CropFrame } from '../../shared/ui';

export type RatioId = 'original' | '1:1' | '4:5' | '16:9';
export type Rotation = 0 | 90 | 180 | 270;
export type CropModel = { ratio: RatioId; zoom: number; rotation: Rotation; frame: CropFrame };

export const RATIO_VALUE: Record<RatioId, number | undefined> = {
  original: undefined,
  '1:1': 1,
  '4:5': 4 / 5,
  '16:9': 16 / 9
};
export const FULL_FRAME: CropFrame = { x: 0, y: 0, w: 1, h: 1 };
/** The starting frame: centred, 73 % of the canvas, so all four handles are visible. */
export const INSET = 0.73;
export const INSET_FRAME: CropFrame = { x: (1 - INSET) / 2, y: (1 - INSET) / 2, w: INSET, h: INSET };
export const MIN_SIDE_PX = 320;
export const MAX_OUTPUT_SIDE = 2048;
export const MAX_OUTPUT_BYTES = 10_000_000;
/** Zoom track: 50–200 %, the default 100 % sits at a third of it. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;

export const defaultModel = (): CropModel => ({ ratio: 'original', zoom: 1, rotation: 0, frame: INSET_FRAME });
export const isDefault = (m: CropModel): boolean =>
  m.ratio === 'original' &&
  m.zoom === 1 &&
  m.rotation === 0 &&
  Math.abs(m.frame.x - INSET_FRAME.x) < 1e-6 &&
  Math.abs(m.frame.y - INSET_FRAME.y) < 1e-6 &&
  Math.abs(m.frame.w - INSET) < 1e-6 &&
  Math.abs(m.frame.h - INSET) < 1e-6;

/** The part of the stage the image covers: all of it, or a centred box when zoomed out below 100 %. */
export const imageBounds = (zoom: number): { lo: number; hi: number } =>
  zoom >= 1 ? { lo: 0, hi: 1 } : { lo: (1 - zoom) / 2, hi: (1 + zoom) / 2 };

/** Keeps the frame on the image: shrinks it (same shape) if the image got smaller, then shifts it inside. */
export function clampFrame(frame: CropFrame, zoom: number): CropFrame {
  const { lo, hi } = imageBounds(zoom);
  const room = hi - lo;
  const k = Math.min(1, room / frame.w, room / frame.h);
  const w = frame.w * k;
  const h = frame.h * k;
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  return {
    x: Math.min(Math.max(cx - w / 2, lo), hi - w),
    y: Math.min(Math.max(cy - h / 2, lo), hi - h),
    w,
    h
  };
}

/** Width / height of the image as the stage shows it (swapped on a quarter turn). */
export const stageAspect = (natural: { w: number; h: number }, rotation: Rotation): number =>
  rotation % 180 === 0 ? natural.w / natural.h : natural.h / natural.w;

/** Frame for a ratio at the given stage shape: the largest centred one; «Оригинал» is the whole image. */
export function frameForRatio(ratio: RatioId, aspect: number): CropFrame {
  const value = RATIO_VALUE[ratio];
  return value === undefined ? INSET_FRAME : fitFrame(value, { width: aspect, height: 1 });
}

type Region = { sx: number; sy: number; sw: number; sh: number; rw: number; rh: number };

/** The kept part in pixels of the rotated source image. */
export function cropRegion(natural: { w: number; h: number }, m: CropModel): Region {
  const odd = m.rotation % 180 !== 0;
  const rw = odd ? natural.h : natural.w;
  const rh = odd ? natural.w : natural.h;
  const at = (f: number) => 0.5 + (f - 0.5) / m.zoom;
  return {
    sx: at(m.frame.x) * rw,
    sy: at(m.frame.y) * rh,
    sw: (m.frame.w / m.zoom) * rw,
    sh: (m.frame.h / m.zoom) * rh,
    rw,
    rh
  };
}

/** Shorter output side at source resolution; below `MIN_SIDE_PX` the photo is too small to publish. */
export const outputShortSide = (natural: { w: number; h: number }, m: CropModel): number => {
  const r = cropRegion(natural, m);
  return Math.min(r.sw, r.sh);
};

/** Largest zoom that keeps the shorter output side at the minimum (never below 1). */
export function maxZoom(natural: { w: number; h: number }, m: CropModel): number {
  const at1 = outputShortSide(natural, { ...m, zoom: 1 });
  return Math.min(ZOOM_MAX, Math.max(1, at1 / MIN_SIDE_PX));
}

/** Draws the crop to a canvas, downscaled so the longer side is at most `maxSide` (never upscaled). */
export function renderCrop(
  img: HTMLImageElement,
  natural: { w: number; h: number },
  m: CropModel,
  maxSide: number,
  canvas: HTMLCanvasElement
): void {
  const r = cropRegion(natural, m);
  const k = Math.min(1, maxSide / Math.max(r.sw, r.sh));
  canvas.width = Math.max(1, Math.round(r.sw * k));
  canvas.height = Math.max(1, Math.round(r.sh * k));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingQuality = 'high';
  ctx.save();
  ctx.scale(canvas.width / r.sw, canvas.height / r.sh);
  ctx.translate(-r.sx, -r.sy);
  ctx.translate(r.rw / 2, r.rh / 2);
  ctx.rotate((m.rotation * Math.PI) / 180);
  ctx.drawImage(img, -natural.w / 2, -natural.h / 2);
  ctx.restore();
}

export type CropResult = { url: string; bytes: number; width: number; height: number };

/** JPEG ≤ 10 MB: quality steps down, then the size, until it fits. Resolves with an object URL (revoked by the owner). */
export async function exportCrop(
  img: HTMLImageElement,
  natural: { w: number; h: number },
  m: CropModel
): Promise<CropResult> {
  const canvas = document.createElement('canvas');
  let side = MAX_OUTPUT_SIDE;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    renderCrop(img, natural, m, side, canvas);
    for (const quality of [0.9, 0.8, 0.7]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_OUTPUT_BYTES) {
        return { url: URL.createObjectURL(blob), bytes: blob.size, width: canvas.width, height: canvas.height };
      }
    }
    side = Math.round(side * 0.75);
  }
  throw new Error('crop-too-large');
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image-load'));
    img.src = src;
  });
}
