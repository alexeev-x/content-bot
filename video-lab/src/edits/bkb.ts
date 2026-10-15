import type { Edit } from '../engine/types';

// «БКБ покупают только те, кто не умеет играть в доту» (rubric «Учу фидить»), re-cut on the original voice-over.
// Times are seconds of the voice; each card line pops in on its word (whisper word timings, corrected by ear).
export const bkb: Edit = {
  id: 'bkb',
  source: 'bkb/source.mp4',
  duration: 47.46,
  font: 'bold',
  captionY: 0.76,
  shots: [
    {
      kind: 'image',
      from: 0,
      to: 2.8,
      src: 'bkb/render-hook.png',
      height: 0.58,
      lines: [
        { at: 0.06, text: 'БКБ', size: 160 },
        { at: 0.18, text: 'покупают', accent: 'blue', size: 96 },
        { at: 0.72, text: 'только те, кто не умеет', size: 50 },
        { at: 2.05, text: 'играть в доту', accent: 'blue', size: 84 }
      ]
    },
    {
      kind: 'image',
      from: 2.8,
      to: 5.9,
      src: 'bkb/items.png',
      height: 0.3,
      punches: [4.96],
      lines: [
        { at: 3.69, text: 'сколько урона', accent: 'gold', size: 92 },
        { at: 4.2, text: 'можно купить', size: 64 },
        { at: 4.8, text: 'на 4 000 золота', accent: 'gold', size: 76 }
      ]
    },
    {
      kind: 'image',
      from: 5.9,
      to: 6.9,
      src: 'bkb/bkb-icon.png',
      height: 0.5,
      lines: [
        { at: 6.0, text: 'а бкб', size: 110 },
        { at: 6.32, text: 'что даёт?', accent: 'red', size: 110 }
      ]
    },
    { kind: 'clip', from: 6.9, to: 10.4, at: 7.2, punches: [9.57] },
    {
      kind: 'card',
      from: 10.4,
      to: 12.0,
      lines: [
        { at: 10.5, text: 'и за это', size: 56 },
        { at: 10.77, text: 'ты должен', size: 100 },
        { at: 11.16, text: 'платить?', accent: 'red', size: 140 }
      ]
    },
    {
      kind: 'image',
      from: 12.0,
      to: 15.3,
      src: 'bkb/render-facepalm.png',
      height: 0.6,
      lines: [
        { at: 12.0, text: 'особенно бесят', accent: 'red', size: 70 },
        { at: 12.84, text: 'советчики', size: 70 },
        { at: 13.44, text: 'бкб против 5 станов', accent: 'blue', size: 58 }
      ]
    },
    {
      kind: 'image',
      from: 15.3,
      to: 18.6,
      src: 'bkb/heroes.png',
      height: 0.52,
      punches: [16.99],
      lines: [
        { at: 15.57, text: 'враги специально', size: 60 },
        { at: 16.26, text: 'взяли контроль', accent: 'red', size: 76 },
        { at: 17.88, text: 'и придумали комбу', size: 56 }
      ]
    },
    { kind: 'clip', from: 18.6, to: 22.9, at: 15.6, punches: [19.36, 21.73] },
    {
      kind: 'card',
      from: 22.9,
      to: 24.4,
      lines: [
        { at: 23.0, text: 'и вообще', size: 60 },
        { at: 23.5, text: 'зачем тебе', size: 96 },
        { at: 24.0, text: 'бкб?', accent: 'red', size: 150 }
      ]
    },
    { kind: 'clip', from: 24.4, to: 31.0, at: 24.4, punches: [25.7, 29.46] },
    { kind: 'clip', from: 31.0, to: 33.5, at: 31.0, punches: [32.1] },
    {
      kind: 'image',
      from: 33.5,
      to: 37.1,
      src: 'bkb/render-gold.png',
      height: 0.58,
      lines: [
        { at: 33.6, text: 'ты керри', accent: 'gold', size: 120 },
        { at: 34.06, text: 'твоя задача —', size: 56 },
        { at: 34.83, text: 'наносить урон', accent: 'red', size: 80 },
        { at: 36.0, text: 'а не думать, как выжить', size: 40 }
      ]
    },
    { kind: 'card', from: 37.1, to: 37.95, lines: [{ at: 37.15, text: 'запомни', accent: 'red', size: 150 }] },
    {
      kind: 'card',
      from: 37.95,
      to: 42.6,
      lines: [
        { at: 38.1, text: 'купил бкб и умер', size: 62 },
        { at: 39.39, text: 'виноват ты', accent: 'red', size: 104 },
        { at: 40.48, text: 'не купил', size: 62 },
        { at: 41.76, text: 'виновата команда', accent: 'blue', size: 80 }
      ]
    },
    {
      kind: 'image',
      from: 42.6,
      to: 45.2,
      src: 'bkb/render-philosopher.png',
      height: 0.6,
      lines: [
        { at: 43.0, text: 'поэтому хороший керри', size: 54 },
        { at: 43.97, text: 'никогда не покупает бкб', accent: 'blue', size: 64 }
      ]
    },
    { kind: 'clip', from: 45.2, to: 47.46, at: 45.2 }
  ],
  captions: [
    { from: 6.91, to: 8.6, text: 'несколько секунд' },
    { from: 8.64, to: 9.08, text: 'тебя даже' },
    { from: 9.08, to: 9.89, text: 'нормально побить', accent: 'gold' },
    { from: 9.89, to: 10.4, text: 'не смогут', accent: 'red' },
    { from: 18.69, to: 19.12, text: 'а ты хочешь' },
    { from: 19.12, to: 19.69, text: 'одной кнопкой', accent: 'gold' },
    { from: 19.69, to: 20.85, text: 'испортить им всю игру?', accent: 'red' },
    { from: 20.85, to: 21.73, text: 'имей хоть какое-то' },
    { from: 21.73, to: 22.17, text: 'уважение', accent: 'gold' },
    { from: 22.17, to: 22.9, text: 'к чужому труду' },
    { from: 24.4, to: 25.47, text: 'если у тебя в команде' },
    { from: 25.47, to: 26.58, text: 'ещё 4 человека?', accent: 'gold' },
    { from: 26.58, to: 27.48, text: 'пусть они покупают' },
    { from: 27.48, to: 28.03, text: 'глиммеры', accent: 'blue' },
    { from: 28.03, to: 28.41, text: 'форсы', accent: 'blue' },
    { from: 28.41, to: 28.73, text: 'лотусы', accent: 'blue' },
    { from: 28.73, to: 30.0, text: 'и подобную хуйню' },
    { from: 30.0, to: 31.0, text: 'и спасают тебя', accent: 'gold' },
    { from: 31.0, to: 31.8, text: 'а если они…' },
    { from: 31.8, to: 32.37, text: 'значит плохо', accent: 'red' },
    { from: 32.37, to: 33.5, text: 'выполняют свою работу' }
  ]
};
