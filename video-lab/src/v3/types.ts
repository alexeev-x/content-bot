import type { Accent } from './look';

/** A phrase on screen: words appear letter by letter from `at`; `accent` colours the given words. */
export type Phrase = { at: number; text: string; accent?: { words: string[]; color: Accent }; size?: number };

export type Layer =
  | { kind: 'text'; from: number; to: number; phrases: Phrase[]; y?: number }
  | { kind: 'hero'; from: number; to: number; src: string; loop: number; side: 'left' | 'right'; width?: number }
  /** A cut-out picture kept whole inside a box (fractions of the frame): it is scaled, never cropped. */
  | { kind: 'image'; from: number; to: number; src: string; box: { x: number; y: number; w: number; h: number }; from_?: 'left' | 'right' | 'bottom' }
  /** A full-screen piece of a source video (e.g. the owner's branded outro). */
  | { kind: 'clip'; from: number; to: number; src: string; at: number }
  | { kind: 'window'; from: number; to: number; src: string; at: number; tilt?: number; y?: number }
  | { kind: 'icons'; from: number; to: number; icons: { src: string; at: number }[]; y?: number; size?: number };

export type Hook = {
  id: string;
  duration: number;
  voice: string;
  music: string;
  musicGain: number;
  backdrop: { src: string; at: number; loop?: number };
  layers: Layer[];
  sfx: { at: number; name: string; gain: number }[];
};
