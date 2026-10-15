import type { Edit } from '../engine/types';

// «Как я на оракле играл. Учусь играть в доту. Часть 69» (rubric «Учусь играть»), re-cut on the original
// voice-over. The gameplay keeps the original cuts (it matches what is said); added: a branded intro, punch-ins
// on strong words, big two-colour captions over a blur strip that hides the captions burned into the source.
const BAND = 0.68;

export const oracle: Edit = {
  id: 'oracle',
  source: 'oracle/source.mp4',
  duration: 48.43,
  font: 'bold',
  captionY: BAND,
  shots: [
    {
      kind: 'image',
      from: 0,
      to: 2.0,
      src: 'oracle/dota-logo.png',
      height: 0.45,
      lines: [
        { at: 0.11, text: 'учусь', size: 110, font: 'hand' },
        { at: 0.53, text: 'играть', size: 130, font: 'hand' },
        { at: 1.18, text: 'в доту!', accent: 'red', size: 150, font: 'hand' },
        { at: 1.5, text: '69 часть', accent: 'gold', size: 90, font: 'hand' }
      ]
    },
    { kind: 'clip', from: 2.0, to: 8.37, at: 2.0, hideBand: BAND, punches: [4.71] },
    { kind: 'clip', from: 8.37, to: 12.27, at: 8.37, hideBand: BAND, punches: [8.06, 9.0] },
    { kind: 'clip', from: 12.27, to: 16.37, at: 12.27, hideBand: BAND, punches: [15.68] },
    { kind: 'clip', from: 16.37, to: 23.37, at: 16.37, hideBand: BAND, punches: [16.82, 23.32] },
    { kind: 'clip', from: 23.37, to: 30.32, at: 23.37, hideBand: BAND, punches: [24.29, 25.81] },
    { kind: 'clip', from: 30.32, to: 35.87, at: 30.32, hideBand: BAND, punches: [33.02] },
    { kind: 'clip', from: 35.87, to: 43.25, at: 35.87, hideBand: BAND, punches: [37.0, 41.71] },
    { kind: 'clip', from: 43.25, to: 45.42, at: 43.25, hideBand: BAND },
    { kind: 'clip', from: 45.42, to: 48.43, at: 45.42, hideBand: BAND }
  ],
  captions: [
    { from: 2.0, to: 3.0, text: 'oracle', accent: 'gold' },
    { from: 3.0, to: 3.83, text: 'один из легчайших' },
    { from: 3.83, to: 4.43, text: 'саппортов' },
    { from: 4.43, to: 5.5, text: 'чтобы заруинить игру', accent: 'red' },
    { from: 5.5, to: 6.35, text: 'просто кидаешь скиллы' },
    { from: 6.35, to: 6.91, text: 'рандомно', accent: 'gold' },
    { from: 6.91, to: 8.06, text: 'кто-нибудь обязательно' },
    { from: 8.06, to: 8.44, text: 'умрёт', accent: 'red' },
    { from: 8.44, to: 9.4, text: 'иногда даже враг', accent: 'gold' },
    { from: 9.4, to: 10.04, text: 'а если серьёзно' },
    { from: 10.04, to: 11.0, text: 'герой требует понимать' },
    { from: 11.0, to: 12.2, text: 'что и когда нажимать', accent: 'gold' },
    { from: 12.2, to: 14.0, text: 'скиллы простые' },
    { from: 14.0, to: 15.0, text: 'но ими можно спасти союзника' },
    { from: 15.0, to: 16.1, text: 'так и самого его добить', accent: 'red' },
    { from: 16.1, to: 17.34, text: 'или случайно похилить' },
    { from: 17.34, to: 18.0, text: 'врага', accent: 'red' },
    { from: 18.0, to: 19.17, text: 'комбинаций немного' },
    { from: 19.17, to: 20.36, text: 'хочешь дамажить — 3 и 1' },
    { from: 20.36, to: 21.95, text: 'хочешь хилить — 2 и 3' },
    { from: 21.95, to: 23.32, text: 'звучит просто, пока не начнётся' },
    { from: 23.32, to: 24.0, text: 'файт', accent: 'red' },
    { from: 24.0, to: 25.0, text: 'и мой мозг выключается', accent: 'gold' },
    { from: 25.0, to: 26.67, text: 'с ультой главное — не заруинить момент' },
    { from: 26.67, to: 28.0, text: 'а потом третьей как ненормальный' },
    { from: 28.0, to: 30.0, text: 'пытается человека выхилить' },
    { from: 30.0, to: 31.28, text: 'ещё оракл умеет предсказывать' },
    { from: 31.28, to: 31.76, text: 'руны', accent: 'gold' },
    { from: 31.76, to: 32.58, text: 'только всем как будто' },
    { from: 32.58, to: 33.4, text: 'вообще похуй', accent: 'red' },
    { from: 33.4, to: 34.68, text: 'аганим я ни разу не покупал' },
    { from: 34.68, to: 36.0, text: 'я бедный саппорт' },
    { from: 36.0, to: 37.62, text: 'и с этими картами заёбываться' },
    { from: 37.62, to: 38.12, text: 'не хочу', accent: 'red' },
    { from: 38.12, to: 39.47, text: 'короче, герой требует быстро понять' },
    { from: 39.47, to: 41.32, text: 'что именно сейчас нужно нажать' },
    { from: 41.32, to: 42.44, text: 'как вы понимаете, мой тупой мозг' },
    { from: 42.44, to: 43.25, text: 'этого не умеет', accent: 'red' },
    { from: 43.6, to: 45.4, text: 'серебряный габен — ораклу', accent: 'gold', y: 0.83 },
    { from: 45.6, to: 46.72, text: 'голосуй за следующего героя', y: 0.83 },
    { from: 46.72, to: 47.47, text: 'и подпишись', accent: 'gold', y: 0.83 },
    { from: 47.47, to: 48.43, text: 'заебал', accent: 'red' }
  ]
};
