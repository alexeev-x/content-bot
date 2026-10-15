import type { Hook } from './types';

const D = (name: string) => `dota/${name}`;

// The first 11.7 s of «БКБ покупают только те, кто не умеет играть в доту» in the AntiAcademy style.
export const bkbHook: Hook = {
  id: 'bkb-v3-hook',
  duration: 11.9,
  voice: 'v2/bkb-voice-loud.m4a',
  music: 'v2/bkb-music.m4a',
  // About 20 dB under the voice, as in the references.
  musicGain: 0.18,
  backdrop: { src: 'v2/bkb-gameplay.mp4', at: 15.5 },
  sfx: [
    { at: 2.8, name: 'whoosh', gain: 0.08 },
    { at: 5.85, name: 'whoosh', gain: 0.08 },
    { at: 7.1, name: 'whoosh', gain: 0.08 }
  ],
  layers: [
    { kind: 'hero', from: 0, to: 2.95, src: D('sven.webm'), loop: 1.958, side: 'right' },
    {
      kind: 'text', from: 0, to: 2.95, y: 0.3,
      phrases: [
        { at: 0.06, text: 'БКБ покупают', accent: { words: ['бкб'], color: 'red' }, size: 78 },
        { at: 0.73, text: 'только те, кто не умеет', size: 50 },
        { at: 1.99, text: 'играть в доту', accent: { words: ['доту'], color: 'red' }, size: 66 }
      ]
    },
    {
      kind: 'icons', from: 2.85, to: 5.95, y: 0.6, size: 250,
      icons: [{ src: D('greater_crit.png'), at: 3.82 }, { src: D('desolator.png'), at: 4.15 }, { src: D('monkey_king_bar.png'), at: 4.51 }]
    },
    {
      kind: 'text', from: 2.85, to: 5.95, y: 0.36,
      phrases: [
        { at: 2.88, text: 'ты представляешь,', size: 46 },
        { at: 3.82, text: 'сколько урона можно купить', size: 54 },
        { at: 4.8, text: 'на 4 000 золота', accent: { words: ['4', '000', 'золота'], color: 'gold' }, size: 70 }
      ]
    },
    { kind: 'icons', from: 5.85, to: 7.25, y: 0.6, size: 420, icons: [{ src: D('black_king_bar.png'), at: 5.9 }] },
    {
      kind: 'text', from: 5.85, to: 7.25, y: 0.36,
      phrases: [{ at: 5.96, text: 'а БКБ что даёт?', accent: { words: ['даёт'], color: 'red' }, size: 74 }]
    },
    { kind: 'window', from: 7.1, to: 10.4, src: 'v2/bkb-gameplay.mp4', at: 7.2, y: 0.56, tilt: 9 },
    {
      kind: 'text', from: 7.1, to: 10.4, y: 0.17,
      phrases: [
        { at: 7.23, text: 'несколько секунд,', size: 56 },
        { at: 8.69, text: 'тебя даже нормально', size: 48 },
        { at: 9.48, text: 'побить не смогут', accent: { words: ['побить'], color: 'red' }, size: 60 }
      ]
    },
    {
      kind: 'text', from: 10.3, to: 11.9, y: 0.45,
      phrases: [
        { at: 10.32, text: 'и за это ты должен', size: 58 },
        { at: 11.26, text: 'платить?', accent: { words: ['платить'], color: 'red' }, size: 110 }
      ]
    }
  ]
};
