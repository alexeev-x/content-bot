import type { Accent } from './look';

/** A phrase on screen: words appear letter by letter from `at`; `accent` colours the given words. */
export type Phrase = { at: number; text: string; accent?: { words: string[]; color: Accent }; size?: number };

export type Layer =
  | { kind: 'text'; from: number; to: number; phrases: Phrase[]; y?: number }
  | { kind: 'hero'; from: number; to: number; src: string; loop: number; side: 'left' | 'right'; width?: number }
  | { kind: 'window'; from: number; to: number; src: string; at: number; tilt?: number; y?: number }
  | { kind: 'icons'; from: number; to: number; icons: { src: string; at: number }[]; y?: number; size?: number };

export type Hook = {
  id: string;
  duration: number;
  voice: string;
  music: string;
  musicGain: number;
  backdrop: { src: string; at: number };
  layers: Layer[];
  sfx: { at: number; name: string; gain: number }[];
};
