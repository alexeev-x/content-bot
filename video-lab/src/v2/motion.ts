import { random, spring } from 'remotion';
import { FPS, sec } from './style';

export const springAt = (frame: number, at: number, damping = 12) =>
  spring({ frame: frame - sec(at), fps: FPS, config: { damping, stiffness: 190, mass: 0.6 } });

/** Camera shake for ~0.3 s after each hit (deterministic, so renders are repeatable). */
export function shake(frame: number, hits: readonly number[]): { x: number; y: number; r: number } {
  for (const hit of hits) {
    const f = frame - sec(hit);
    if (f >= 0 && f < 9) {
      const power = (1 - f / 9) * 18;
      return {
        x: (random(`x${hit}${f}`) - 0.5) * power,
        y: (random(`y${hit}${f}`) - 0.5) * power,
        r: (random(`r${hit}${f}`) - 0.5) * power * 0.08
      };
    }
  }
  return { x: 0, y: 0, r: 0 };
}

export function flash(frame: number, hits: readonly number[]): number {
  for (const hit of hits) {
    const f = frame - sec(hit);
    if (f >= 0 && f < 5) return 0.55 * (1 - f / 5);
  }
  return 0;
}
