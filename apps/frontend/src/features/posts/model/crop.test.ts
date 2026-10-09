import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampCropFrame, cropRegion, defaultCropModel, exportCrop, renderCrop } from './crop';

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
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback, type) {
      callback(new Blob([new Uint8Array(512_000)], { type }));
    });
    const image = { naturalWidth: 4032, naturalHeight: 3024 } as HTMLImageElement;
    const output = await exportCrop(image, defaultCropModel());
    expect(['image/jpeg', 'image/webp']).toContain(output.type);
    expect(output.size).toBeLessThanOrEqual(10_000_000);
  });
});
