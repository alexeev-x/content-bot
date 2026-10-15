import type { Hook, Layer } from './types';

const D = (name: string) => `dota/${name}`;
const W = 'v2/oracle-gameplay.mp4';
const red = (...words: string[]) => ({ words, color: 'red' as const });
const gold = (...words: string[]) => ({ words, color: 'gold' as const });
const blue = (...words: string[]) => ({ words, color: 'blue' as const });

const win = (from: number, to: number, tilt: number): Layer => ({ kind: 'window', from, to, src: W, at: from, y: 0.6, tilt });

// «Как я на оракле играл. Учусь играть в доту. Часть 69» in the AntiAcademy style. The owner's branded intro
// stays; gameplay windows come from his video, cropped above his burned-in captions.
const layers: Layer[] = [
  { kind: 'clip', from: 0, to: 2.25, src: 'oracle/source.mp4', at: 0 },

  { kind: 'hero', from: 2.2, to: 3.2, src: D('oracle.webm'), loop: 3.083, side: 'right', width: 900 },
  { kind: 'text', from: 2.2, to: 3.2, y: 0.2, phrases: [{ at: 2.2, text: 'Oracle', accent: gold('oracle'), size: 110 }] },

  win(3.15, 5.75, 8),
  { kind: 'text', from: 3.15, to: 5.75, y: 0.17, phrases: [
    { at: 3.2, text: 'один из легчайших саппортов,', size: 46 },
    { at: 4.5, text: 'чтобы заруинить игру', accent: red('заруинить'), size: 58 } ] },

  win(5.7, 9.0, -8),
  { kind: 'text', from: 5.7, to: 9.0, y: 0.17, phrases: [
    { at: 5.76, text: 'просто кидаешь скиллы рандомно,', size: 44 },
    { at: 6.96, text: 'кто-нибудь обязательно умрёт', accent: red('умрёт'), size: 50 } ] },

  { kind: 'text', from: 8.95, to: 9.95, y: 0.45, phrases: [
    { at: 8.96, text: 'иногда даже', size: 60 },
    { at: 9.53, text: 'враг', accent: red('враг'), size: 130 } ] },

  win(9.9, 12.45, 8),
  { kind: 'text', from: 9.9, to: 12.45, y: 0.17, phrases: [
    { at: 9.96, text: 'а если серьёзно,', size: 50 },
    { at: 10.44, text: 'герой требует понимать,', size: 48 },
    { at: 11.15, text: 'что и когда нажимать', accent: gold('когда'), size: 54 } ] },

  win(12.4, 16.3, -8),
  { kind: 'text', from: 12.4, to: 16.3, y: 0.17, phrases: [
    { at: 12.46, text: 'скиллы простые, но ими можно', size: 44 },
    { at: 14.11, text: 'спасти союзника', accent: gold('спасти'), size: 56 },
    { at: 15.36, text: 'или самого его добить', accent: red('добить'), size: 52 } ] },

  win(16.3, 18.8, 8),
  { kind: 'text', from: 16.3, to: 18.8, y: 0.17, phrases: [
    { at: 16.36, text: 'ну или случайно', size: 50 },
    { at: 17.02, text: 'похилить врага', accent: red('врага'), size: 60 },
    { at: 17.86, text: 'комбинаций немного:', size: 50 } ] },

  { kind: 'image', from: 18.75, to: 22.35, src: D('oracle.png'), box: { x: 0.15, y: 0.6, w: 0.7, h: 0.22 } },
  { kind: 'text', from: 18.75, to: 22.35, y: 0.38, phrases: [
    { at: 18.86, text: 'хочешь дамажить — 3 и 1', accent: red('3', '1'), size: 58 },
    { at: 20.32, text: 'хочешь хилить — 2 и 3', accent: gold('2', '3'), size: 58 } ] },

  win(22.3, 25.05, -8),
  { kind: 'text', from: 22.3, to: 25.05, y: 0.17, phrases: [
    { at: 22.36, text: 'звучит просто,', size: 50 },
    { at: 22.93, text: 'пока не начинается файт', accent: red('файт'), size: 54 },
    { at: 23.76, text: 'и мой мозг выключается', accent: gold('мозг'), size: 48 } ] },

  win(25.0, 29.45, 8),
  { kind: 'text', from: 25.0, to: 29.45, y: 0.17, phrases: [
    { at: 25.12, text: 'с ультой главное —', size: 48 },
    { at: 25.76, text: 'не заруинить момент,', accent: red('заруинить'), size: 54 },
    { at: 26.63, text: 'а потом третьей, как ненормальный,', size: 40 },
    { at: 28.04, text: 'пытаешься выхилить', accent: gold('выхилить'), size: 50 } ] },

  { kind: 'hero', from: 29.4, to: 33.5, src: D('oracle.webm'), loop: 3.083, side: 'left', width: 900 },
  { kind: 'text', from: 29.4, to: 33.5, y: 0.2, phrases: [
    { at: 29.48, text: 'ещё Oracle умеет', size: 52 },
    { at: 30.34, text: 'предсказывать руны,', accent: gold('руны'), size: 56 },
    { at: 31.5, text: 'только всем как будто', size: 46 },
    { at: 32.58, text: 'вообще похуй', accent: red('похуй'), size: 70 } ] },

  { kind: 'image', from: 33.45, to: 35.85, src: D('ultimate_scepter.png'), box: { x: 0.25, y: 0.5, w: 0.5, h: 0.25 } },
  { kind: 'text', from: 33.45, to: 35.85, y: 0.3, phrases: [
    { at: 33.58, text: 'аганим я ни разу не покупал,', accent: blue('аганим'), size: 46 },
    { at: 35.03, text: 'я бедный саппорт', size: 58 } ] },

  win(35.8, 38.0, -8),
  { kind: 'text', from: 35.8, to: 38.0, y: 0.17, phrases: [
    { at: 35.81, text: 'и ещё с этими картами', size: 50 },
    { at: 36.89, text: 'заёбываться не хочу', accent: red('хочу'), size: 54 } ] },

  win(37.95, 41.3, 8),
  { kind: 'text', from: 37.95, to: 41.3, y: 0.17, phrases: [
    { at: 38.04, text: 'короче, герой требует', size: 50 },
    { at: 38.95, text: 'быстро понять,', size: 54 },
    { at: 39.6, text: 'что именно сейчас нажать', accent: gold('сейчас'), size: 50 } ] },

  { kind: 'text', from: 41.25, to: 43.55, y: 0.45, phrases: [
    { at: 41.32, text: 'как вы понимаете,', size: 54 },
    { at: 42.15, text: 'мой тупой мозг', accent: red('тупой'), size: 80 },
    { at: 42.77, text: 'этого не умеет', size: 62 } ] },

  { kind: 'hero', from: 43.5, to: 45.3, src: D('oracle.webm'), loop: 3.083, side: 'right', width: 900 },
  { kind: 'text', from: 43.5, to: 45.3, y: 0.2, phrases: [
    { at: 43.64, text: 'серебряный Габен', accent: blue('серебряный', 'габен'), size: 66 },
    { at: 44.46, text: 'достаётся Oracle', accent: gold('oracle'), size: 60 } ] },

  { kind: 'icons', from: 45.25, to: 46.8, y: 0.6, size: 200, icons: [
    { src: D('warlock.png'), at: 45.3 }, { src: D('weaver.png'), at: 45.45 }, { src: D('vengefulspirit.png'), at: 45.6 }, { src: D('disruptor.png'), at: 45.75 } ] },
  { kind: 'text', from: 45.25, to: 46.8, y: 0.34, phrases: [
    { at: 45.28, text: 'голосуй за следующего героя', accent: gold('голосуй'), size: 50 },
    { at: 45.9, text: 'в Telegram', accent: blue('telegram'), size: 60 } ] },

  { kind: 'text', from: 46.75, to: 48.43, y: 0.45, phrases: [
    { at: 46.76, text: 'и подпишись,', accent: gold('подпишись'), size: 70 },
    { at: 47.6, text: 'заебал', accent: red('заебал'), size: 120 } ] }
];

export const oracleFull: Hook = {
  id: 'oracle-v3',
  duration: 48.43,
  voice: 'v2/oracle-voice-loud.m4a',
  music: 'v2/oracle-music.m4a',
  musicGain: 0.18,
  backdrop: { src: 'v3/oracle-backdrop.mp4', at: 0, loop: 40 },
  sfx: [2.15, 8.9, 17.75, 29.35, 33.4, 41.2, 43.45, 45.2].map((at) => ({ at, name: 'whoosh', gain: 0.07 })),
  layers
};
