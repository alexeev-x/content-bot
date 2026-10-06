import { describe, expect, it } from 'vitest';
import {
  composite,
  contrastRatio,
  deriveAccent,
  measureAccent,
  oklchToRgb,
  parseHex,
  rgbToOklch,
  statusHueWarning,
  toHex,
  NON_TEXT_CONTRAST,
  TEXT_CONTRAST,
  type ColorTheme
} from './index';

describe('srgb', () => {
  it('parses #rrggbb only', () => {
    expect(parseHex('#1D4ED8')).toEqual({ r: 29, g: 78, b: 216 });
    expect(parseHex('#fff')).toBeNull();
    expect(parseHex('1d4ed8')).toBeNull();
    expect(parseHex('#1d4ed8ff')).toBeNull();
    expect(parseHex('#gggggg')).toBeNull();
  });

  it('matches known WCAG contrast values', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 5);
    expect(contrastRatio({ r: 255, g: 255, b: 255 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    // #767676 on white is the textbook 4.54:1
    expect(contrastRatio(parseHex('#767676')!, parseHex('#ffffff')!)).toBeCloseTo(4.54, 2);
  });

  it('composites translucent colours', () => {
    expect(composite({ r: 255, g: 0, b: 0, a: 0.5 }, { r: 0, g: 0, b: 0 })).toEqual({ r: 127.5, g: 0, b: 0 });
  });
});

describe('oklch', () => {
  it.each(['#000000', '#ffffff', '#1d4ed8', '#e58a4e', '#ffff00', '#ff0000', '#808080'])('round-trips %s', (hex) => {
    expect(toHex(oklchToRgb(rgbToOklch(parseHex(hex)!)))).toBe(hex);
  });

  it('puts known hues where expected', () => {
    expect(rgbToOklch(parseHex('#ff0000')!).h).toBeCloseTo(29.2, 0);
    expect(rgbToOklch(parseHex('#0000ff')!).h).toBeCloseTo(264, 0);
    expect(rgbToOklch(parseHex('#808080')!).c).toBeLessThan(0.001);
  });

  it('keeps out-of-gamut colours inside sRGB by lowering chroma', () => {
    const rgb = oklchToRgb({ l: 0.9, c: 0.4, h: 150 });
    for (const v of [rgb.r, rgb.g, rgb.b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

describe('deriveAccent', () => {
  const edge = [
    '#ffffff',
    '#000000',
    '#ffff00',
    '#ff0000',
    '#00ff00',
    '#0000ff',
    '#808080',
    '#fdfdfd',
    '#010101',
    '#ffd700'
  ];

  it('rejects malformed colours', () => {
    expect(() => deriveAccent('red', 'light')).toThrow(RangeError);
  });

  describe.each<ColorTheme>(['light', 'dark'])('%s theme', (theme) => {
    it.each(edge)('meets contrast for %s', (base) => {
      const tokens = deriveAccent(base, theme);
      const checks = measureAccent(tokens, theme);
      expect(checks.onAccent).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      expect(checks.text).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      expect(checks.ring).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
      expect(checks.soft).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    });

    it('returns hex and rgba tokens', () => {
      const tokens = deriveAccent('#1d4ed8', theme);
      for (const key of ['accent', 'hover', 'text', 'onAccent', 'ring'] as const)
        expect(tokens[key]).toMatch(/^#[0-9a-f]{6}$/);
      expect(tokens.soft).toMatch(/^rgba\(\d+, \d+, \d+, [\d.]+\)$/);
      expect(tokens.glow).toMatch(/^rgba\(\d+, \d+, \d+, [\d.]+\)$/);
    });
  });

  it('keeps a base colour that is already dark enough in light mode', () => {
    expect(deriveAccent('#1d4ed8', 'light').accent).toBe('#1d4ed8');
  });

  it('darkens a light base in light mode and lightens a dark base in dark mode, keeping the hue', () => {
    const light = deriveAccent('#ffff00', 'light');
    expect(rgbToOklch(parseHex(light.accent)!).l).toBeLessThan(rgbToOklch(parseHex('#ffff00')!).l);
    const dark = deriveAccent('#10206a', 'dark');
    expect(rgbToOklch(parseHex(dark.accent)!).l).toBeGreaterThan(rgbToOklch(parseHex('#10206a')!).l);
    expect(Math.abs(rgbToOklch(parseHex(dark.accent)!).h - rgbToOklch(parseHex('#10206a')!).h)).toBeLessThan(8);
  });
});

describe('statusHueWarning', () => {
  it('flags colours close to failed (red) and unknown (amber)', () => {
    expect(statusHueWarning('#ff0000')).toBe('failed');
    expect(statusHueWarning('#d32f2f')).toBe('failed');
    expect(statusHueWarning('#ffb454')).toBe('unknown');
    expect(statusHueWarning('#f59e0b')).toBe('unknown');
  });

  it('stays quiet for other hues, greys, black, white and bad input', () => {
    for (const hex of ['#1d4ed8', '#4f46c8', '#b0206f', '#00aa55', '#ffff00', '#808080', '#000000', '#ffffff']) {
      expect(statusHueWarning(hex)).toBeNull();
    }
    expect(statusHueWarning('nope')).toBeNull();
  });
});
