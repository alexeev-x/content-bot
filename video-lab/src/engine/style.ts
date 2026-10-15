import { loadFont as loadNeucha } from '@remotion/google-fonts/Neucha';
import { loadFont as loadUnbounded } from '@remotion/google-fonts/Unbounded';
import type { Accent } from './types';

export const bold = loadUnbounded('normal', { weights: ['700', '900'], subsets: ['cyrillic', 'latin'] }).fontFamily;
export const hand = loadNeucha('normal', { weights: ['400'], subsets: ['cyrillic', 'latin'] }).fontFamily;

export const ACCENT: Record<Accent, string> = {
  white: '#ffffff',
  blue: '#2fb8ff',
  red: '#ff3b3b',
  gold: '#ffc23d',
  green: '#3dff7a'
};

export const FPS = 30;
export const sec = (seconds: number) => Math.round(seconds * FPS);
