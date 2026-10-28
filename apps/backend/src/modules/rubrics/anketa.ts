import { abilityImage, escapeHtml } from './picture';
import { pick, type RubricContext, type RubricSample } from './types';

// «Анкета» (owner, 28.10.2026): a hero's dating profile on the owner's own scene — the arena of love with a «Давай
// поженимся» sign and a board. The image model puts the hero into the scene (the sample asks for it with `heroScene`);
// the browser lays the board over it: the name, a crude distance line, three fields and the hero's ability icons.
// A first sample bank of three heroes; the full bank comes after the owner's review.

const RENDERS = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders';
const WIDTH = 1536;
const HEIGHT = 1024;

type Anketa = {
  hero: string;
  name: string;
  distance: string;
  fields: readonly [string, string][];
  abilities: readonly string[];
};

const ANKETAS: readonly Anketa[] = [
  {
    hero: 'pudge',
    name: 'Пудж',
    distance: 'в 12 хуях от вас',
    fields: [
      ['Ищу', 'ту, что не убежит. Всё равно не убежит'],
      ['Красный флаг', 'зову погулять, а через секунду ты у меня дома'],
      ['В постели', 'Рот включаю сразу, остальное по запросу']
    ],
    abilities: ['pudge_meat_hook', 'pudge_rot', 'pudge_flesh_heap', 'pudge_dismember']
  },
  {
    hero: 'faceless_void',
    name: 'Войд',
    distance: 'в двух пиздюлях от вас',
    fields: [
      ['Ищу', 'ту, что замрёт ради меня. Буквально'],
      ['Красный флаг', 'на первом свидании запер всех, своих тоже'],
      ['Не пишите, если', 'ты Фантом Ассасин']
    ],
    abilities: [
      'faceless_void_time_walk',
      'faceless_void_time_dilation',
      'faceless_void_time_lock',
      'faceless_void_chronosphere'
    ]
  },
  {
    hero: 'antimage',
    name: 'АМ',
    distance: 'в одном ебучем блинке от вас',
    fields: [
      ['Цель знакомства', 'нафармиться и съебаться'],
      ['Первое свидание', 'у тебя в лесу, пока ты на лайне'],
      ['Не пишите, если', 'ты Сайленсер. Без маны я не мужик']
    ],
    abilities: ['antimage_mana_break', 'antimage_blink', 'antimage_counterspell', 'antimage_mana_void']
  }
];

const HEART =
  '<svg class="hrt" viewBox="0 0 24 24"><path d="M12 21.4 10.6 20C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.5L12 21.4Z"/></svg>';
const PIN =
  '<svg class="pin" viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';

// The board's inner box sits inside the template's stone frame; the script shrinks the name and the fields until they
// fit, so no text ever leaves the board (owner, 28.10.2026: «текст за рамку выходит»).
const CSS = `*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden}
body{position:relative;background:#140c14 var(--scene,none) 0 0/${WIDTH}px ${HEIGHT}px no-repeat;font-family:Manrope,Arial,sans-serif;color:#fff}
.board{position:absolute;left:1000px;top:236px;width:440px;height:620px;display:flex;flex-direction:column;overflow:hidden}
.nm{display:flex;align-items:center;gap:14px}
.nm span{min-width:0;font-family:Montserrat,Arial,sans-serif;font-weight:900;font-size:92px;line-height:1.05;white-space:nowrap;overflow:hidden;text-transform:uppercase;text-shadow:0 3px 0 rgba(0,0,0,.5)}
.hrt{flex:none;width:54px;height:54px;fill:#ff4f8f;filter:drop-shadow(0 0 12px rgba(255,79,143,.8))}
.dist{display:flex;align-items:center;gap:8px;font-weight:800;font-size:30px;color:#ff86b4;white-space:nowrap;overflow:hidden}
.pin{flex:none;width:28px;height:28px;fill:none;stroke:#ff5c97;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.blocks{flex:1;min-height:0;overflow:hidden;font-size:32px;line-height:1.15;font-weight:700;display:flex;flex-direction:column;justify-content:space-evenly;margin-top:12px;border-top:2px solid rgba(255,79,143,.55)}
.blk{padding:.22em 0}.blk+.blk{border-top:1.5px solid rgba(255,255,255,.13)}
.blk h3{font-family:Montserrat,Arial,sans-serif;font-weight:800;font-size:.6em;letter-spacing:.14em;text-transform:uppercase;color:#ff5c97;margin-bottom:.12em}
.ab{display:flex;gap:10px;padding-top:12px}.ab img{width:62px;height:62px;border:2px solid rgba(255,255,255,.22);border-radius:6px}`;

const FIT = `<script>(()=>{const done=()=>document.documentElement.setAttribute('data-fonts-ready','');
document.fonts.ready.then(()=>{const n=document.querySelector('.nm span');let s=parseFloat(getComputedStyle(n).fontSize);
while(n.scrollWidth>n.clientWidth&&s>40){s-=2;n.style.fontSize=s+'px'}
const d=document.querySelector('.dist');let t=parseFloat(getComputedStyle(d).fontSize);
while(d.scrollWidth>d.clientWidth&&t>18){t-=1;d.style.fontSize=t+'px'}
const r=document.querySelector('.blocks');let f=parseFloat(getComputedStyle(r).fontSize);
while(r.scrollHeight>r.clientHeight+1&&f>20){f-=1;r.style.fontSize=f+'px'}}).then(done,done);setTimeout(done,8000);})();</script>`;

function anketaPage(anketa: Anketa): string {
  const fields = anketa.fields
    .map(([title, text]) => `<section class="blk"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></section>`)
    .join('');
  const icons = anketa.abilities.map((key) => `<img src="${abilityImage(key)}" alt="">`).join('');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&amp;family=Montserrat:wght@800;900&amp;display=block&amp;subset=cyrillic" rel="stylesheet">
<style>${CSS}</style></head><body><div class="board"><div class="nm"><span>${escapeHtml(anketa.name)}</span>${HEART}</div>
<div class="dist">${PIN}${escapeHtml(anketa.distance)}</div><div class="blocks">${fields}</div><div class="ab">${icons}</div></div>${FIT}</body></html>`;
}

export function heroProfile(context: RubricContext): Promise<RubricSample> {
  const anketa = pick(ANKETAS, context.random);
  return Promise.resolve({
    picture: { html: anketaPage(anketa), width: WIDTH, height: HEIGHT },
    heroScene: { renderUrl: `${RENDERS}/${anketa.hero}.png`, heroName: anketa.name },
    text: '❤️ — вправо · 💔 — влево',
    ownText: true,
    poll: null
  });
}
