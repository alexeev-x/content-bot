import { oklchToRgb, rgbToOklch, type Oklch } from './oklch';
import { composite, contrastRatio, parseHex, toHex, toRgbaString, type Rgb } from './srgb';

const SOFT_ALPHA = { light: 0.09, dark: 0.15 } as const;

export type ColorTheme = 'light' | 'dark';

export type DerivedAccent = {
  accent: string;
  hover: string;
  text: string;
  soft: string;
  onAccent: string;
  ring: string;
  glow: string;
};

// Backdrops an accent must read on. They mirror --color-bg and --color-surface-1..3 in tokens.css;
// Update both together.
const THEME_SURFACES: Record<ColorTheme, readonly string[]> = {
  light: ['#f7f7f8', '#ffffff', '#f4f4f5', '#e9e9ec'],
  dark: ['#0a0a0b', '#111113', '#18181b', '#222226']
};

const TEXT_CONTRAST = 4.5; // WCAG 1.4.3: on-accent text and accent text
const NON_TEXT_CONTRAST = 3; // WCAG 1.4.11: focus ring, control boundaries
const STEP = 0.005;

const surfaces = (theme: ColorTheme): Rgb[] => THEME_SURFACES[theme].map((hex) => parseHex(hex)!);
const worstContrast = (color: Rgb, backdrops: Rgb[]): number =>
  Math.min(...backdrops.map((b) => contrastRatio(color, b)));
const rgbOf = (color: Oklch): Rgb => oklchToRgb(color);
// Compare what the browser will paint (8-bit sRGB), not the unrounded value.
const painted = (color: Oklch): Rgb => parseHex(toHex(rgbOf(color)))!;

// Selected navigation puts accent text on the soft tint over surface 1.
const onSoft = (text: Rgb, tint: Rgb, theme: ColorTheme, backdrops: Rgb[]): number =>
  contrastRatio(text, composite({ ...tint, a: SOFT_ALPHA[theme] }, backdrops[1]!));

/** Moves lightness by `direction` in STEP increments until `ok` passes or the range ends. */
function walk(start: Oklch, direction: 1 | -1, ok: (color: Oklch) => boolean): Oklch {
  let color = start;
  while (!ok(color)) {
    const next = color.l + direction * STEP;
    if (next < 0 || next > 1) return { ...color, l: Math.min(1, Math.max(0, next)) };
    color = { ...color, l: next };
  }
  return color;
}

/**
 * Derives the seven accent tokens from one base colour (custom presets store only that colour).
 * Hue and chroma are kept; only lightness moves, until:
 * - on-accent text on the accent is >= 4.5:1;
 * - the accent text and the focus ring are >= 4.5:1 / >= 3:1 on every surface of the theme.
 * Light: white text on a darkened accent, accent = text = ring. Dark: near-black tinted text on a
 * lightened accent, with a still lighter accent text and ring (the prototype's cobalt pattern).
 */
export function deriveAccent(baseColor: string, theme: ColorTheme): DerivedAccent {
  const base = parseHex(baseColor);
  if (!base) throw new RangeError(`Expected #rrggbb, got "${baseColor}"`);
  const origin = rgbToOklch(base);
  const backdrops = surfaces(theme);

  if (theme === 'light') {
    const white: Rgb = { r: 255, g: 255, b: 255 };
    const accent = walk(origin, -1, (c) => {
      const rgb = painted(c);
      return (
        contrastRatio(white, rgb) >= TEXT_CONTRAST &&
        worstContrast(rgb, backdrops) >= TEXT_CONTRAST &&
        onSoft(rgb, rgb, theme, backdrops) >= TEXT_CONTRAST
      );
    });
    const rgb = painted(accent);
    const hover = rgbOf({ ...accent, l: Math.max(0, accent.l - 0.04) });
    return {
      accent: toHex(rgb),
      hover: toHex(hover),
      text: toHex(rgb),
      soft: toRgbaString(rgb, SOFT_ALPHA.light),
      onAccent: '#ffffff',
      ring: toHex(rgb),
      glow: toRgbaString(rgb, 0.35)
    };
  }

  const onAccentColor: Oklch = { l: 0.18, c: Math.min(origin.c, 0.05), h: origin.h };
  const onAccent = painted(onAccentColor);
  // Raise to a readable lightness for filled controls: dark text on it >= 4.5, against the
  // page surface >= 3 so the fill is visible as a control.
  const accent = walk(origin, 1, (c) => {
    const rgb = painted(c);
    return contrastRatio(onAccent, rgb) >= TEXT_CONTRAST && worstContrast(rgb, backdrops) >= NON_TEXT_CONTRAST;
  });
  const accentRgb = painted(accent);
  const text = walk({ ...accent, l: Math.min(1, accent.l + 0.06) }, 1, (c) => {
    const rgb = painted(c);
    return worstContrast(rgb, backdrops) >= TEXT_CONTRAST && onSoft(rgb, accentRgb, theme, backdrops) >= TEXT_CONTRAST;
  });
  const textRgb = painted(text);
  return {
    accent: toHex(accentRgb),
    hover: toHex(rgbOf({ ...accent, l: Math.min(1, accent.l + 0.04) })),
    text: toHex(textRgb),
    soft: toRgbaString(accentRgb, SOFT_ALPHA.dark),
    onAccent: toHex(onAccent),
    ring: toHex(textRgb),
    glow: toRgbaString(accentRgb, 0.4)
  };
}
