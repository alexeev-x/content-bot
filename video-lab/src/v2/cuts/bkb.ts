import { words } from '../data/bkb-words';
import type { Cut } from '../types';

const G = 'v2/bkb-gameplay.mp4';
const D = (name: string) => `dota/${name}`;

// «БКБ покупают только те, кто не умеет играть в доту» — only the voice is the owner's; the cut changes the
// picture every 1.5–3 s: animated hero renders, item icons, gameplay, slams on the punchlines.
export const bkb2: Cut = {
  id: 'bkb-v2',
  duration: 47.46,
  voice: 'v2/bkb-voice.m4a',
  music: 'v2/bkb-music.m4a',
  musicGain: 0.7,
  words,
  fixes: {},
  accents: {
    бкб: 'red', урона: 'gold', золота: 'gold', платить: 'red', станов: 'red', контролем: 'red',
    кнопкой: 'yellow', уважение: 'gold', глиммеры: 'blue', форсы: 'blue', лотусы: 'blue', хуйню: 'red',
    плохо: 'red', урон: 'red', керри: 'gold', виноват: 'red', виновата: 'green', команда: 'green', никогда: 'red'
  },
  hits: [0.06, 5.6, 11.26, 19.88, 24.22, 35.31, 37.18, 39.54, 41.41, 45.02],
  sfx: [
    { at: 3.82, name: 'pop' }, { at: 4.15, name: 'pop' }, { at: 4.51, name: 'pop' }, { at: 5.28, name: 'cash', gain: 0.7 },
    { at: 6.05, name: 'pop' }, { at: 14.06, name: 'pop' }, { at: 14.2, name: 'pop' }, { at: 14.35, name: 'pop' },
    { at: 14.5, name: 'pop' }, { at: 14.62, name: 'pop' }, { at: 19.61, name: 'pop' }, { at: 27.68, name: 'pop' },
    { at: 28.21, name: 'pop' }, { at: 28.66, name: 'pop' }, { at: 36.2, name: 'riser', gain: 0.4 }
  ],
  beats: [
    {
      kind: 'hero', from: 0, to: 2.85, hero: D('sven.webm'), loop: 1.958, tint: '#1a5cff',
      lines: [
        { at: 0.06, text: 'БКБ', tone: 'red', size: 230 },
        { at: 0.18, text: 'покупают только те,', size: 64 },
        { at: 1.44, text: 'кто не умеет', size: 64 },
        { at: 1.99, text: 'играть в доту', tone: 'yellow', size: 92 }
      ]
    },
    {
      kind: 'icons', from: 2.85, to: 5.9, tint: '#b07a00',
      icons: [{ src: D('greater_crit.png'), at: 3.82 }, { src: D('desolator.png'), at: 4.15 }, { src: D('monkey_king_bar.png'), at: 4.51 }],
      lines: [{ at: 5.28, text: '4 000 золота', tone: 'gold', size: 120 }]
    },
    {
      kind: 'icons', from: 5.9, to: 7.2, tint: '#7a3a00',
      icons: [{ src: D('black_king_bar.png'), at: 6.05 }],
      lines: [{ at: 6.05, text: 'а бкб', size: 110 }, { at: 6.28, text: 'что даёт?', tone: 'red', size: 130 }]
    },
    { kind: 'clip', from: 7.2, to: 10.3, src: G, at: 7.2, tint: '#ffbf2e' },
    {
      kind: 'slam', from: 10.3, to: 11.7, tint: '#7a0010',
      lines: [{ at: 10.32, text: 'и за это', size: 72 }, { at: 10.84, text: 'ты должен', size: 120 }, { at: 11.26, text: 'платить?!', tone: 'red', size: 170 }]
    },
    { kind: 'clip', from: 11.7, to: 13.95, src: G, at: 15.3, tint: '#ff3d3d' },
    {
      kind: 'icons', from: 13.95, to: 15.16, tint: '#8a1020',
      icons: [
        { src: D('lion.png'), at: 14.06 }, { src: D('shadow_shaman.png'), at: 14.2 }, { src: D('earthshaker.png'), at: 14.35 },
        { src: D('tidehunter.png'), at: 14.5 }, { src: D('magnataur.png'), at: 14.62 }
      ],
      lines: [{ at: 14.43, text: 'против 5 станов', tone: 'red', size: 96 }]
    },
    { kind: 'hero', from: 15.16, to: 18.8, hero: D('shadow_shaman.webm'), loop: 2.667, tint: '#a0302a' },
    {
      kind: 'icons', from: 18.8, to: 20.9, tint: '#7a3a00',
      icons: [{ src: D('black_king_bar.png'), at: 19.61 }],
      lines: [{ at: 19.31, text: 'одной кнопкой', tone: 'yellow', size: 110 }, { at: 19.88, text: 'испортить им всю игру', tone: 'red', size: 70 }]
    },
    { kind: 'clip', from: 20.9, to: 23.05, src: G, at: 18.2, tint: '#ffbf2e' },
    {
      kind: 'slam', from: 23.05, to: 24.45, tint: '#7a0010',
      lines: [{ at: 23.12, text: 'и вообще', size: 72 }, { at: 23.66, text: 'зачем тебе', size: 120 }, { at: 24.22, text: 'бкб?', tone: 'red', size: 230 }]
    },
    { kind: 'clip', from: 24.45, to: 26.6, src: G, at: 25.0, tint: '#41ff8a' },
    {
      kind: 'icons', from: 26.6, to: 30.0, tint: '#1f8a5a',
      icons: [
        { src: D('glimmer_cape.png'), at: 27.68, label: 'глиммер' },
        { src: D('force_staff.png'), at: 28.21, label: 'форс' },
        { src: D('lotus_orb.png'), at: 28.66, label: 'лотус' }
      ],
      lines: [{ at: 26.64, text: 'пусть они покупают', size: 70 }]
    },
    { kind: 'clip', from: 30.0, to: 33.45, src: G, at: 29.0, tint: '#41ff8a' },
    { kind: 'hero', from: 33.45, to: 37.0, hero: D('sven.webm'), loop: 1.958, tint: '#ffbf2e' },
    { kind: 'slam', from: 37.0, to: 37.8, tint: '#7a0010', lines: [{ at: 37.18, text: 'запомни', tone: 'red', size: 200 }] },
    {
      kind: 'versus', from: 37.8, to: 42.6,
      rows: [
        { at: 38.32, cause: 'купил бкб и умер', verdict: 'виноват ты', tone: 'red' },
        { at: 40.98, cause: 'не купил', verdict: 'виновата команда', tone: 'green' }
      ]
    },
    {
      kind: 'slam', from: 42.6, to: 45.4, tint: '#123a8a',
      lines: [
        { at: 42.66, text: 'поэтому', size: 64 },
        { at: 43.16, text: 'хороший керри', tone: 'gold', size: 110 },
        { at: 43.94, text: 'никогда', tone: 'red', size: 150 },
        { at: 44.35, text: 'не покупает бкб', size: 96 }
      ]
    },
    {
      kind: 'hero', from: 45.4, to: 47.46, hero: D('sven.webm'), loop: 1.958, tint: '#1a5cff',
      lines: [{ at: 45.48, text: 'учу фидить', tone: 'yellow', size: 140 }, { at: 46.44, text: 'в доту', size: 120 }]
    }
  ]
};
