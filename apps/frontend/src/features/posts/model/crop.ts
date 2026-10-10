import { PHOTO_MEDIA_MAX_BYTES } from '@alexeev/contracts';
import { fitFrame, type CropFrame } from '../../../shared/ui';

export type CropRatio = 'original' | '1:1' | '4:5' | '16:9';
export type CropModel = { ratio: CropRatio; zoom: number; rotation: 0 | 90 | 180 | 270; frame: CropFrame };
export const CROP_RATIOS: Record<CropRatio, number | undefined> = {
  original: undefined,
  '1:1': 1,
  '4:5': 4 / 5,
  '16:9': 16 / 9
};
export const INSET = 0.73;
export const INSET_FRAME: CropFrame = { x: (1 - INSET) / 2, y: (1 - INSET) / 2, w: INSET, h: INSET };
export const defaultCropModel = (): CropModel => ({ ratio: 'original', zoom: 1, rotation: 0, frame: INSET_FRAME });

export function clampCropFrame(frame: CropFrame, zoom: number): CropFrame {
  const lo = zoom >= 1 ? 0 : (1 - zoom) / 2;
  const hi = zoom >= 1 ? 1 : (1 + zoom) / 2;
  const room = hi - lo;
  const scale = Math.min(1, room / frame.w, room / frame.h);
  const width = frame.w * scale;
  const height = frame.h * scale;
  const centerX = frame.x + frame.w / 2;
  const centerY = frame.y + frame.h / 2;
  return {
    x: Math.min(Math.max(centerX - width / 2, lo), hi - width),
    y: Math.min(Math.max(centerY - height / 2, lo), hi - height),
    w: width,
    h: height
  };
}

export function cropFrameForRatio(ratio: CropRatio, aspect: number): CropFrame {
  const value = CROP_RATIOS[ratio];
  return value === undefined ? INSET_FRAME : fitFrame(value, { width: aspect, height: 1 });
}

export function cropRegion(natural: { width: number; height: number }, model: CropModel) {
  const rotated = model.rotation % 180 !== 0;
  const width = rotated ? natural.height : natural.width;
  const height = rotated ? natural.width : natural.height;
  const at = (fraction: number) => 0.5 + (fraction - 0.5) / model.zoom;
  return {
    sx: at(model.frame.x) * width,
    sy: at(model.frame.y) * height,
    sw: (model.frame.w / model.zoom) * width,
    sh: (model.frame.h / model.zoom) * height,
    width,
    height
  };
}

export function renderCrop(
  image: HTMLImageElement,
  model: CropModel,
  canvas: HTMLCanvasElement,
  maxSide: number
): void {
  const region = cropRegion({ width: image.naturalWidth, height: image.naturalHeight }, model);
  const scale = Math.min(1, maxSide / Math.max(region.sw, region.sh));
  canvas.width = Math.max(1, Math.round(region.sw * scale));
  canvas.height = Math.max(1, Math.round(region.sh * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('crop-canvas-unavailable');
  context.imageSmoothingQuality = 'high';
  context.save();
  context.scale(canvas.width / region.sw, canvas.height / region.sh);
  context.translate(-region.sx, -region.sy);
  context.translate(region.width / 2, region.height / 2);
  context.rotate((model.rotation * Math.PI) / 180);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();
}

export async function exportCrop(image: HTMLImageElement, model: CropModel): Promise<Blob> {
  const canvas = document.createElement('canvas');
  for (let maxSide = 2048; maxSide >= 512; maxSide = Math.round(maxSide * 0.75)) {
    renderCrop(image, model, canvas, maxSide);
    for (const type of ['image/jpeg', 'image/webp']) {
      for (const quality of [0.9, 0.8, 0.7, 0.6]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
        if (blob?.type === type && blob.size <= PHOTO_MEDIA_MAX_BYTES) return blob;
      }
    }
  }
  throw new Error('crop-too-large');
}
