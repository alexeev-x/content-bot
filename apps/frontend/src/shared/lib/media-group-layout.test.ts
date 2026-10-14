import { describe, expect, it } from 'vitest';
import { clampSingleMediaRatio, layoutMediaGroup, type MediaSize } from './media-group-layout';

const L: MediaSize = { width: 1600, height: 900 };
const P: MediaSize = { width: 900, height: 1600 };
const S: MediaSize = { width: 1000, height: 1000 };
const W: MediaSize = { width: 3000, height: 800 };
const T: MediaSize = { width: 800, height: 3000 };

const CASES: [string, MediaSize[]][] = [
  ['2 landscape', [L, L]],
  ['2 portrait', [P, P]],
  ['2 square', [S, S]],
  ['2 mixed', [L, P]],
  ['2 very wide', [W, W]],
  ['3 portrait first', [P, L, L]],
  ['3 landscape first', [L, P, S]],
  ['3 very tall', [T, T, T]],
  ['4 landscape first', [L, P, P, S]],
  ['4 portrait first', [P, L, L, L]],
  ['4 square', [S, S, S, S]],
  ['5 mixed', [L, P, S, W, T]],
  ['6 landscape', [L, L, L, L, L, L]],
  ['7 portrait', [P, P, P, P, P, P, P]],
  ['10 mixed', [L, P, S, W, T, L, P, S, W, T]]
];

describe('layoutMediaGroup', () => {
  it.each(CASES)('%s: one rect per item, no overlap, within maxWidth', (_name, sizes) => {
    const maxWidth = 420;
    const rects = layoutMediaGroup(sizes, maxWidth, 100, 2);
    expect(rects).toHaveLength(sizes.length);
    for (const r of rects) {
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(maxWidth);
    }
    expect(Math.min(...rects.map((r) => r.x))).toBe(0);
    // Like Telegram, tall albums may come out narrower than maxWidth, never wider.
    expect(Math.max(...rects.map((r) => r.x + r.width))).toBeGreaterThan(maxWidth / 3);
    for (const [i, a] of rects.entries()) {
      for (const b of rects.slice(i + 1)) {
        const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('returns nothing for no items and the natural-ratio box for one (tdesktop layoutOne)', () => {
    expect(layoutMediaGroup([], 420, 100, 2)).toEqual([]);
    expect(layoutMediaGroup([T], 420, 100, 2)[0]).toEqual({ x: 0, y: 0, width: 420, height: 1575 });
    expect(clampSingleMediaRatio(3000, 800)).toBe(2.4);
  });
});
