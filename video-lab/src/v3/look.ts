import { loadFont } from '@remotion/google-fonts/Unbounded';
import { interpolate, spring } from 'remotion';

// v3 follows the owner's references (AntiAcademy, DONTEPAN): a continuous blurred gameplay backdrop in a
// navy grade, soft fades instead of jump cuts, key phrases only, light-blue text with a glow, no outlines.
export const font = loadFont('normal', { weights: ['500', '700'], subsets: ['cyrillic', 'latin'] }).fontFamily;
export const FPS = 30;
export const sec = (s: number) => Math.round(s * FPS);
export const INK = '#a9dcff';
export const ACCENT = { red: '#ff5263', gold: '#ffc94d', blue: '#a9dcff' } as const;
export type Accent = keyof typeof ACCENT;

/** Soft in and out: 0 → 1 over 9 frames from `from`, back to 0 over 7 frames before `to` (frames). */
export function presence(frame: number, from: number, to: number): number {
  const enter = spring({ frame: frame - from, fps: FPS, config: { damping: 200, stiffness: 120 } });
  const leave = interpolate(frame, [to - 7, to], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return Math.min(enter, leave);
}

export const glow = (color: string) => `0 0 18px ${color}99, 0 0 42px ${color}44`;
