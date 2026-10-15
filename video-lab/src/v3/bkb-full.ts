import type { Hook, Layer } from './types';

const D = (name: string) => `dota/${name}`;
const O = (name: string) => `own/${name}.png`;
const W = 'v2/bkb-gameplay.mp4';
const red = (...words: string[]) => ({ words, color: 'red' as const });
const gold = (...words: string[]) => ({ words, color: 'gold' as const });

// Pictures sit right/left of the text; boxes keep each cut-out whole (fractions of the 1080×1920 frame).
const RIGHT = { x: 0.3, y: 0.4, w: 0.7, h: 0.6 };
const LEFT = { x: 0, y: 0.4, w: 0.7, h: 0.6 };
const CENTER = { x: 0.15, y: 0.42, w: 0.7, h: 0.5 };

const layers: Layer[] = [
  { kind: 'image', from: 0, to: 2.95, src: O('sven-pointer'), box: RIGHT, from_: 'right' },
  { kind: 'text', from: 0, to: 2.95, y: 0.22, phrases: [
    { at: 0.06, text: 'БКБ покупают', accent: red('бкб'), size: 80 },
    { at: 0.73, text: 'только те, кто не умеет', size: 50 },
    { at: 1.99, text: 'играть в доту', accent: red('доту'), size: 66 } ] },

  { kind: 'icons', from: 2.85, to: 5.95, y: 0.62, size: 250, icons: [
    { src: D('greater_crit.png'), at: 3.82 }, { src: D('desolator.png'), at: 4.15 }, { src: D('monkey_king_bar.png'), at: 4.51 } ] },
  { kind: 'text', from: 2.85, to: 5.95, y: 0.34, phrases: [
    { at: 2.88, text: 'ты представляешь,', size: 46 },
    { at: 3.82, text: 'сколько урона можно купить', size: 54 },
    { at: 4.8, text: 'на 4 000 золота', accent: gold('4', '000', 'золота'), size: 72 } ] },

  { kind: 'image', from: 5.85, to: 7.25, src: O('bkb-art'), box: CENTER },
  { kind: 'text', from: 5.85, to: 7.25, y: 0.3, phrases: [{ at: 5.96, text: 'а БКБ что даёт?', accent: red('даёт'), size: 76 }] },

  { kind: 'window', from: 7.1, to: 10.4, src: W, at: 7.2, y: 0.58, tilt: 8 },
  { kind: 'text', from: 7.1, to: 10.4, y: 0.17, phrases: [
    { at: 7.23, text: 'несколько секунд,', size: 56 },
    { at: 8.69, text: 'тебя даже нормально', size: 48 },
    { at: 9.48, text: 'побить не смогут', accent: red('побить'), size: 60 } ] },

  { kind: 'text', from: 10.3, to: 11.75, y: 0.45, phrases: [
    { at: 10.32, text: 'и за это ты должен', size: 58 },
    { at: 11.26, text: 'платить?', accent: red('платить'), size: 112 } ] },

  { kind: 'image', from: 11.65, to: 15.2, src: O('sven-facepalm'), box: LEFT, from_: 'left' },
  { kind: 'text', from: 11.65, to: 15.2, y: 0.2, phrases: [
    { at: 11.7, text: 'особенно бесят люди,', size: 56 },
    { at: 12.68, text: 'которые советуют БКБ', size: 50 },
    { at: 14.06, text: 'против пяти станов', accent: red('станов'), size: 62 } ] },

  { kind: 'icons', from: 15.1, to: 18.85, y: 0.6, size: 175, icons: [
    { src: D('lion.png'), at: 15.5 }, { src: D('shadow_shaman.png'), at: 15.7 }, { src: D('earthshaker.png'), at: 15.9 },
    { src: D('tidehunter.png'), at: 16.1 }, { src: D('magnataur.png'), at: 16.3 } ] },
  { kind: 'text', from: 15.1, to: 18.85, y: 0.3, phrases: [
    { at: 15.16, text: 'враги специально взяли', size: 50 },
    { at: 16.59, text: 'героев с контролем', accent: red('контролем'), size: 60 },
    { at: 17.64, text: 'и придумали комбинацию', size: 48 } ] },

  { kind: 'image', from: 18.8, to: 20.95, src: D('black_king_bar.png'), box: { x: 0.25, y: 0.5, w: 0.5, h: 0.25 } },
  { kind: 'text', from: 18.8, to: 20.95, y: 0.3, phrases: [
    { at: 18.88, text: 'а ты хочешь одной кнопкой', size: 50 },
    { at: 19.88, text: 'испортить им всю игру?', accent: red('испортить'), size: 60 } ] },

  { kind: 'window', from: 20.9, to: 23.05, src: W, at: 18.2, y: 0.58, tilt: -8 },
  { kind: 'text', from: 20.9, to: 23.05, y: 0.17, phrases: [
    { at: 20.92, text: 'имей хоть какое-то', size: 50 },
    { at: 21.8, text: 'уважение к чужому труду', accent: gold('уважение'), size: 56 } ] },

  { kind: 'window', from: 23.0, to: 26.6, src: W, at: 25.0, y: 0.6, tilt: 8 },
  { kind: 'text', from: 23.0, to: 26.6, y: 0.17, phrases: [
    { at: 23.12, text: 'и вообще, зачем тебе БКБ,', accent: red('бкб'), size: 50 },
    { at: 24.5, text: 'если у тебя в команде', size: 48 },
    { at: 25.52, text: 'ещё 4 человека?', accent: gold('4'), size: 64 } ] },

  { kind: 'icons', from: 26.55, to: 31.0, y: 0.6, size: 250, icons: [
    { src: D('glimmer_cape.png'), at: 27.68 }, { src: D('force_staff.png'), at: 28.21 }, { src: D('lotus_orb.png'), at: 28.66 } ] },
  { kind: 'text', from: 26.55, to: 31.0, y: 0.3, phrases: [
    { at: 26.64, text: 'пусть они покупают', size: 54 },
    { at: 27.68, text: 'глиммеры, форсы, лотусы', accent: { words: ['глиммеры', 'форсы', 'лотусы'], color: 'blue' }, size: 52 },
    { at: 29.95, text: 'и спасают тебя', accent: gold('спасают'), size: 60 } ] },

  { kind: 'window', from: 30.95, to: 33.45, src: W, at: 29.0, y: 0.6, tilt: -8 },
  { kind: 'text', from: 30.95, to: 33.45, y: 0.17, phrases: [
    { at: 31.06, text: 'а если они спасли —', size: 50 },
    { at: 31.86, text: 'значит плохо выполняют', accent: red('плохо'), size: 52 },
    { at: 32.86, text: 'свою работу', size: 56 } ] },

  { kind: 'image', from: 33.4, to: 37.05, src: O('sven-gold'), box: RIGHT, from_: 'right' },
  { kind: 'text', from: 33.4, to: 37.05, y: 0.2, phrases: [
    { at: 33.52, text: 'ты керри,', accent: gold('керри'), size: 76 },
    { at: 34.16, text: 'твоя задача — наносить урон,', accent: red('урон'), size: 46 },
    { at: 35.78, text: 'а не думать, как выжить', size: 44 } ] },

  { kind: 'text', from: 37.0, to: 37.85, y: 0.45, phrases: [{ at: 37.18, text: 'запомни', accent: red('запомни'), size: 120 }] },

  { kind: 'text', from: 37.8, to: 42.6, y: 0.45, phrases: [
    { at: 37.83, text: 'купил БКБ и умер —', size: 58 },
    { at: 39.54, text: 'виноват ты', accent: red('ты', 'виноват'), size: 96 },
    { at: 40.48, text: 'не купил —', size: 58 },
    { at: 41.41, text: 'виновата команда', accent: gold('виновата', 'команда'), size: 80 } ] },

  { kind: 'image', from: 42.55, to: 45.3, src: O('sven-philosopher'), box: RIGHT, from_: 'right' },
  { kind: 'text', from: 42.55, to: 45.3, y: 0.2, phrases: [
    { at: 42.66, text: 'поэтому хороший керри', accent: gold('керри'), size: 52 },
    { at: 43.94, text: 'никогда не покупает БКБ', accent: red('никогда'), size: 56 } ] },

  // The owner's branded outro «Учу фидить в доту», as it is.
  { kind: 'clip', from: 45.2, to: 47.46, src: 'bkb/source.mp4', at: 45.2 }
];

export const bkbFull: Hook = {
  id: 'bkb-v3',
  duration: 47.46,
  voice: 'v2/bkb-voice-loud.m4a',
  music: 'v2/bkb-music.m4a',
  musicGain: 0.18,
  backdrop: { src: 'v3/bkb-backdrop.mp4', at: 0, loop: 26.7 },
  sfx: [2.8, 5.8, 7.05, 11.6, 15.05, 20.85, 26.5, 33.35, 42.5].map((at) => ({ at, name: 'whoosh', gain: 0.07 })),
  layers
};
