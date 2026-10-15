import { words } from '../data/oracle-words';
import type { Cut } from '../types';

const G = 'v2/oracle-gameplay.mp4';
const D = (name: string) => `dota/${name}`;

// «Как я на оракле играл. Учусь играть в доту. Часть 69» — the owner's voice; gameplay from the original video
// (cropped above its burned-in captions), the official Oracle render, slams on the jokes, a Telegram vote CTA.
export const oracle2: Cut = {
  id: 'oracle-v2',
  duration: 48.43,
  voice: 'v2/oracle-voice.m4a',
  music: 'v2/oracle-music.m4a',
  musicGain: 0.7,
  words,
  fixes: {},
  accents: {
    oracle: 'gold', заруинить: 'red', умрет: 'red', враг: 'red', врага: 'red', добить: 'red', файт: 'red',
    выключается: 'yellow', руны: 'gold', похуй: 'red', аганим: 'blue', хочу: 'red', тупой: 'red', заебал: 'red'
  },
  hits: [1.18, 2.2, 4.76, 7.96, 9.53, 15.87, 23.58, 33.0, 43.03, 47.6],
  sfx: [{ at: 18.86, name: 'pop' }, { at: 20.32, name: 'pop' }, { at: 33.58, name: 'pop' }, { at: 44.86, name: 'cash', gain: 0.6 }],
  beats: [
    {
      kind: 'slam', from: 0, to: 2.2, tint: '#7a1a00',
      lines: [
        { at: 0.11, text: 'учусь играть', size: 120 },
        { at: 1.18, text: 'в доту', tone: 'red', size: 170 },
        { at: 1.6, text: 'часть 69', tone: 'yellow', size: 100 }
      ]
    },
    { kind: 'hero', from: 2.2, to: 3.2, hero: D('oracle.webm'), loop: 3.083, tint: '#2fb8a0', lines: [{ at: 2.2, text: 'oracle', tone: 'gold', size: 170 }] },
    { kind: 'clip', from: 3.2, to: 5.7, src: G, at: 3.2, tint: '#2fb8a0' },
    { kind: 'clip', from: 5.7, to: 8.9, src: G, at: 5.7, tint: '#ff3d3d' },
    { kind: 'slam', from: 8.9, to: 9.9, tint: '#7a0010', lines: [{ at: 8.96, text: 'иногда даже', size: 90 }, { at: 9.53, text: 'враг', tone: 'red', size: 230 }] },
    { kind: 'clip', from: 9.9, to: 12.4, src: G, at: 9.9, tint: '#2fb8a0' },
    { kind: 'clip', from: 12.4, to: 16.3, src: G, at: 12.4, tint: '#41ff8a' },
    { kind: 'clip', from: 16.3, to: 18.8, src: G, at: 16.3, tint: '#ff3d3d' },
    {
      kind: 'slam', from: 18.8, to: 22.3, tint: '#123a8a',
      lines: [
        { at: 18.86, text: 'хочешь дамажить', size: 84 },
        { at: 19.56, text: '3 + 1', tone: 'red', size: 150 },
        { at: 20.32, text: 'хочешь хилить', size: 84 },
        { at: 21.08, text: '2 + 3', tone: 'green', size: 150 }
      ]
    },
    { kind: 'clip', from: 22.3, to: 25.0, src: G, at: 22.3, tint: '#ff3d3d' },
    { kind: 'clip', from: 25.0, to: 29.4, src: G, at: 25.0, tint: '#2fb8a0' },
    { kind: 'hero', from: 29.4, to: 32.5, hero: D('oracle.webm'), loop: 3.083, tint: '#6a2fb8' },
    { kind: 'slam', from: 32.5, to: 33.5, tint: '#7a0010', lines: [{ at: 32.58, text: 'вообще', size: 120 }, { at: 33.0, text: 'похуй', tone: 'red', size: 210 }] },
    {
      kind: 'icons', from: 33.5, to: 35.8, tint: '#1a4ad6',
      icons: [{ src: D('ultimate_scepter.png'), at: 33.58, label: 'аганим' }],
      lines: [{ at: 34.12, text: 'ни разу не покупал', tone: 'red', size: 76 }]
    },
    { kind: 'clip', from: 35.8, to: 38.0, src: G, at: 35.9, tint: '#ff3d3d' },
    { kind: 'clip', from: 38.0, to: 41.3, src: G, at: 38.0, tint: '#2fb8a0' },
    { kind: 'slam', from: 41.3, to: 43.5, tint: '#7a0010', lines: [{ at: 42.15, text: 'мой тупой мозг', size: 110 }, { at: 42.77, text: 'этого не умеет', tone: 'red', size: 110 }] },
    {
      kind: 'hero', from: 43.5, to: 45.25, hero: D('oracle.webm'), loop: 3.083, tint: '#c0c0c0',
      lines: [{ at: 43.64, text: 'серебряный габен', size: 96 }, { at: 44.86, text: '→ oracle', tone: 'gold', size: 130 }]
    },
    {
      kind: 'poll', from: 45.25, to: 46.8, title: 'голосуй за следующего героя',
      heroes: [
        { src: D('warlock.png'), name: 'Warlock' }, { src: D('weaver.png'), name: 'Weaver' },
        { src: D('vengefulspirit.png'), name: 'Vengeful Spirit' }, { src: D('disruptor.png'), name: 'Disruptor' }
      ]
    },
    { kind: 'slam', from: 46.8, to: 48.43, tint: '#123a8a', lines: [{ at: 46.84, text: 'и подпишись', tone: 'yellow', size: 130 }, { at: 47.6, text: 'заебал', tone: 'red', size: 190 }] }
  ]
};
