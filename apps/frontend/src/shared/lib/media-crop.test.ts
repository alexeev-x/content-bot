import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clampCropFrame,
  cropFrameForRatio,
  cropRegion,
  defaultCropModel,
  exportCrop,
  renderCrop,
  videoCropRect
} from './media-crop';

afterEach(() => vi.restoreAllMocks());

describe('post crop geometry and output', () => {
  it('uses the same frame region for the canvas preview and exported photo', () => {
    const model = defaultCropModel();
    const natural = { width: 4032, height: 3024 };
    const region = cropRegion(natural, model);
    expect(region).toMatchObject({ sx: 544.32, sy: 408.24, sw: 2943.36, sh: 2207.52 });

    const context = {
      imageSmoothingQuality: 'low',
      save: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn()
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const canvas = document.createElement('canvas');
    const image = { naturalWidth: natural.width, naturalHeight: natural.height } as HTMLImageElement;
    renderCrop(image, model, canvas, 2048);
    expect(canvas.width).toBe(2048);
    expect(canvas.height).toBeLessThanOrEqual(2048);
    expect(context.drawImage).toHaveBeenCalledWith(image, -2016, -1512);
    expect(context.translate).toHaveBeenCalledWith(-region.sx, -region.sy);
  });

  it('keeps the crop frame within the zoomed photo bounds so preview and output cannot include empty pixels', () => {
    const frame = clampCropFrame({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, 0.5);
    expect(frame).toMatchObject({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  });

  it('renders a square crop as a square canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      imageSmoothingQuality: 'low',
      save: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn()
    } as unknown as CanvasRenderingContext2D);
    const model = {
      ...defaultCropModel(),
      ratio: '1:1' as const,
      frame: cropFrameForRatio('1:1', 4 / 3)
    };
    const canvas = document.createElement('canvas');
    const image = { naturalWidth: 1200, naturalHeight: 900 } as HTMLImageElement;

    renderCrop(image, model, canvas, 560);

    expect(canvas.width).toBe(canvas.height);
  });

  it('exports a real-size photo as a capped JPEG or WebP blob under the photo contract limit', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      imageSmoothingQuality: 'low',
      save: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn()
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback,
      type
    ) {
      callback(new Blob([new Uint8Array(512_000)], { type }));
    });
    const image = { naturalWidth: 4032, naturalHeight: 3024 } as HTMLImageElement;
    const output = await exportCrop(image, defaultCropModel());
    expect(['image/jpeg', 'image/webp']).toContain(output.type);
    expect(output.size).toBeLessThanOrEqual(10_000_000);
  });

  it('reduces the output dimensions when JPEG and WebP quality cannot fit the photo limit', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      imageSmoothingQuality: 'low',
      save: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn()
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback,
      type
    ) {
      callback(new Blob([new Uint8Array(this.width > 1536 ? 10_000_001 : 512_000)], { type }));
    });
    const image = { naturalWidth: 4032, naturalHeight: 3024 } as HTMLImageElement;
    const output = await exportCrop(image, defaultCropModel());
    expect(output.size).toBe(512_000);
    expect(output.type).toBe('image/jpeg');
  });

  it('does not accept a browser PNG fallback as a JPEG or WebP crop', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      imageSmoothingQuality: 'low',
      save: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn()
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback) {
      callback(new Blob([new Uint8Array(128)], { type: 'image/png' }));
    });
    const image = { naturalWidth: 4032, naturalHeight: 3024 } as HTMLImageElement;
    await expect(exportCrop(image, defaultCropModel())).rejects.toThrow('crop-too-large');
  });
});

describe('video crop rectangle', () => {
  it('rounds the frame to even pixels inside the picture', () => {
    expect(videoCropRect({ width: 1920, height: 1080 }, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 })).toEqual({
      left: 480,
      top: 270,
      width: 960,
      height: 540
    });
    const odd = videoCropRect({ width: 1001, height: 777 }, { x: 0.333, y: 0.111, w: 0.4, h: 0.31 });
    expect([odd.left, odd.top, odd.width, odd.height].every((value) => value % 2 === 0)).toBe(true);
    expect(odd.left + odd.width).toBeLessThanOrEqual(1001);
    expect(odd.top + odd.height).toBeLessThanOrEqual(777);
  });

  it('keeps a tiny frame at least 2 px and a full frame the whole even picture', () => {
    expect(videoCropRect({ width: 640, height: 360 }, { x: 0, y: 0, w: 0.001, h: 0.001 })).toMatchObject({
      width: 2,
      height: 2
    });
    expect(videoCropRect({ width: 641, height: 361 }, { x: 0, y: 0, w: 1, h: 1 })).toEqual({
      left: 0,
      top: 0,
      width: 640,
      height: 360
    });
  });

  it('offers a 9:16 preset', () => {
    expect(cropFrameForRatio('9:16', 16 / 9).w).toBeLessThan(cropFrameForRatio('1:1', 16 / 9).w);
  });
});
