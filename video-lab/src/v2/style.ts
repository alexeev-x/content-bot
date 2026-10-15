import { loadFont } from '@remotion/google-fonts/Montserrat';
import type { Tone } from './types';

export const font = loadFont('normal', { weights: ['800', '900'], subsets: ['cyrillic', 'latin'] }).fontFamily;
export const FPS = 30;
export const sec = (seconds: number) => Math.round(seconds * FPS);
export const TONE: Record<Tone, string> = {
  white: '#ffffff',
  yellow: '#ffe14d',
  red: '#ff3d3d',
  green: '#41ff8a',
  blue: '#3ec5ff',
  gold: '#ffbf2e'
};
/** The largest size up to `size` at which `text` fits one line of `width` px (Montserrat Black is ~0.74 em per letter). */
export const fit = (text: string, size: number, width = 980) => Math.min(size, Math.floor(width / (Math.max(4, text.length) * 0.84)));
/** Like `fit`, for text allowed to wrap: only its longest word has to fit the width. */
export const fitWords = (text: string, size: number, width = 980) =>
  fit(text.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), ''), size, width);

/** Heavy outlined text that reads over any picture. */
export const outlined = (size: number, color: string) => ({
  fontFamily: font,
  fontWeight: 900,
  fontSize: size,
  lineHeight: 1.02,
  color,
  textTransform: 'uppercase' as const,
  WebkitTextStroke: `${Math.max(6, size * 0.13)}px #000`,
  paintOrder: 'stroke fill' as const,
  textShadow: '0 10px 30px rgba(0,0,0,0.55)'
});
