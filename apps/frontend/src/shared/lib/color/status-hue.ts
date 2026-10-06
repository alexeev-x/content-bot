import { rgbToOklch } from './oklch';
import { parseHex } from './srgb';

export type StatusHueWarning = 'failed' | 'unknown' | null;

// Hues (OKLCH degrees) of the failed (red) and unknown (amber) status tokens.
const FAILED_HUE = 25;
const UNKNOWN_HUE = 75;
const HUE_RANGE = 20;
const MIN_CHROMA = 0.04; // greys have no meaningful hue

const hueDistance = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Which status colour a base colour could be mistaken for, or null. A warning, never a block. */
export function statusHueWarning(baseColor: string): StatusHueWarning {
  const rgb = parseHex(baseColor);
  if (!rgb) return null;
  const { c, h } = rgbToOklch(rgb);
  if (c < MIN_CHROMA) return null;
  const failed = hueDistance(h, FAILED_HUE);
  const unknown = hueDistance(h, UNKNOWN_HUE);
  if (failed <= HUE_RANGE && failed <= unknown) return 'failed';
  if (unknown <= HUE_RANGE) return 'unknown';
  return null;
}
