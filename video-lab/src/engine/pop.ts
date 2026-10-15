import { spring } from 'remotion';
import { FPS, sec } from './style';

/** 0 → 1 with a small overshoot, starting at `at` seconds (relative to the shot start). */
export function pop(frame: number, at: number): number {
  return spring({ frame: frame - sec(at), fps: FPS, config: { damping: 11, stiffness: 180, mass: 0.6 } });
}

/** A short scale bump (1 → 1.14 → 1.06) after each punch time, for emphasis on a strong word. */
export function punchScale(frame: number, punches: readonly number[]): number {
  let scale = 1;
  for (const at of punches) {
    const f = frame - sec(at);
    if (f < 0) continue;
    const s = spring({ frame: f, fps: FPS, config: { damping: 9, stiffness: 220, mass: 0.5 } });
    scale = Math.max(scale, 1 + 0.14 * s - 0.08 * Math.min(1, f / 12));
  }
  return scale;
}
