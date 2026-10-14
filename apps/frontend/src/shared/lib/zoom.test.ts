import { describe, expect, it } from 'vitest';
import { clampPan, FIT, MAX_SCALE, zoomAt } from './zoom';

const content = { width: 800, height: 600 };
const viewport = { width: 1000, height: 700 };

describe('picture zoom', () => {
  it('keeps a picture that fits centred', () => {
    expect(clampPan({ scale: 1, x: 120, y: -40 }, content, viewport)).toEqual(FIT);
  });

  it('limits panning so the picture never leaves the viewport', () => {
    const view = clampPan({ scale: 2, x: 9999, y: -9999 }, content, viewport);
    expect(view).toEqual({ scale: 2, x: 300, y: -250 });
  });

  it('keeps the point under the cursor fixed while zooming', () => {
    const focus = { x: 100, y: 50 };
    const view = zoomAt(FIT, 2, focus, content, viewport);
    expect(view).toEqual({ scale: 2, x: -100, y: -50 });
    const far = zoomAt({ scale: 2, x: 200, y: 100 }, 4, focus, content, viewport);
    expect(far).toEqual({ scale: 4, x: 300, y: 150 });
  });

  it('clamps the scale', () => {
    expect(zoomAt(FIT, 100, { x: 0, y: 0 }, content, viewport).scale).toBe(MAX_SCALE);
    expect(zoomAt({ scale: 2, x: 0, y: 0 }, 0.1, { x: 0, y: 0 }, content, viewport)).toEqual(FIT);
  });
});
