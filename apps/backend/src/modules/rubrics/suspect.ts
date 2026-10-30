import { spokenHeroName } from './anketa';
import { shuffledOrder } from './bank-order';
import { escapeHtml } from './picture';
import { noData, pick, poll, type RubricContext, type RubricSample, shuffled } from './types';

// «Подозреваемый» (owner, 30.10.2026, was «Суд»): a hero's police mugshot. The sign in his hands lists short charges
// in chalk; the post brings other, harsher ones, his defence and the poll «Приговор» (owner: the sign and the post never
// repeat each other). Every hero once, in a shuffled order without repeats, as in «Анкета».

interface Suspect {
  /** Valve's key: `pudge`. */
  hero: string;
  /** 3–4 charges in chalk, each ≤ 22 characters. */
  sign: string[];
  charge: string;
  more: string;
  defence: string;
  /** Four verdicts, one of them a crude joke; shuffled per post. */
  verdicts: string[];
}

const SUSPECTS: Suspect[] = [
  {
    hero: 'pudge',
    sign: ['промахивается хуками', 'станит не туда', 'умирает с флешем', 'крадёт крипов'],
    charge: 'кидает хук сорок раз за игру, попадает два. Оба раза — в своего саппорта.',
    more: 'пикается ластпиком на мид без спроса и пишет «мид или фид». Потом фидит. На миде.',
    defence: 'один раз в жизни он попал хуком через весь лес. Ради этого раза его все и пикают.',
    verdicts: [
      'Пожизненно в саппорты',
      'Оправдать: тот хук был охуенный',
      'Запретить мид навсегда',
      'Насадить его жопой на его же крюк'
    ]
  }
];

// The picture (owner's example, 30.10.2026): the image model puts the hero behind the blank sign of the owner's wall;
// the browser writes the chalk on the sign at the template's own place and tilt, screened into the slate.
const RENDERS = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders';
const WIDTH = 1536;
const HEIGHT = 1024;
const CHALK = '#e9e6dc';
const CSS = `*{margin:0;padding:0}html,body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden}
body{position:relative;background:#121212 var(--scene,none) 0 0/${WIDTH}px ${HEIGHT}px no-repeat}
.sign{position:absolute;left:318px;top:548px;width:900px;height:452px;transform:rotate(-1deg);font-family:Neucha,Arial,sans-serif;
color:${CHALK};text-transform:uppercase;letter-spacing:.06em;filter:url(#chalk);mix-blend-mode:screen;opacity:.92}
.head{position:absolute;left:58px;top:34px;font-size:66px;display:flex;align-items:center;gap:22px}
.head svg{width:62px;height:62px}
.rule{position:absolute;left:52px;right:52px;border-top:3px solid ${CHALK}}
.case{position:absolute;left:66px;right:60px;top:140px;height:226px;font-size:38px;line-height:44px;white-space:nowrap}
.hero{position:absolute;left:78px;top:384px;font-size:44px;white-space:nowrap}
.hero b{font-weight:400;margin-left:40px}
.stamp{position:absolute;right:170px;top:392px;font-size:26px;border:3px solid ${CHALK};padding:2px 12px;transform:rotate(-6deg)}
.mark{position:absolute;right:52px;top:372px;font-size:26px;text-align:center;transform:rotate(-8deg);text-transform:none}
.mark svg{display:block;margin:0 auto -2px;width:40px;height:26px}`;
// Chalk: the strokes wobble a little and lose bits where the noise is dark.
const CHALK_FILTER = `<svg width="0" height="0" style="position:absolute"><filter id="chalk"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.5" result="d"/><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="3" result="m"/><feColorMatrix in="m" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.9" result="a"/><feComposite in="d" in2="a" operator="in"/></filter></svg>`;
const DOTA_LOGO = `<svg viewBox="0 0 100 100"><rect x="4" y="4" width="92" height="92" rx="8" fill="${CHALK}"/><path d="M22 14 L86 78 L86 86 L78 86 L14 22 L14 14Z M14 66 L14 86 L34 86Z M66 14 L86 14 L86 34Z" fill="#121212"/></svg>`;
const CROWN = `<svg viewBox="0 0 40 26"><path d="M3 23 L6 6 L14 15 L20 3 L26 15 L34 6 L37 23Z" fill="none" stroke="${CHALK}" stroke-width="2.5"/></svg>`;
// The charges and the name never leave the sign: their font shrinks until they fit.
const FIT = `<script>(()=>{const done=()=>document.documentElement.setAttribute('data-fonts-ready','');
const fit=(n,s)=>{while((n.scrollWidth>n.clientWidth||n.scrollHeight>n.clientHeight)&&s>18){s-=2;n.style.fontSize=s+'px';n.style.lineHeight=Math.round(s*1.16)+'px'}};
document.fonts.ready.then(()=>{fit(document.querySelector('.case'),38);const h=document.querySelector('.hero');h.style.width='520px';fit(h,44)}).then(done,done);
setTimeout(done,8000);})();</script>`;

function signPage(suspect: Suspect, englishName: string): string {
  const charges = suspect.sign.map((line) => `<div>- ${escapeHtml(line)}</div>`).join('');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Neucha&amp;display=block&amp;subset=cyrillic" rel="stylesheet">
<style>${CSS}</style></head><body>${CHALK_FILTER}<div class="sign">
<div class="head">ПОДОЗРЕВАЕМЫЙ${DOTA_LOGO}</div><div class="rule" style="top:126px"></div>
<div class="case"><div>Дело:</div>${charges}</div><div class="rule" style="top:374px"></div>
<div class="hero">Герой:<b>${escapeHtml(englishName)}</b></div><div class="stamp">DOTA 2</div><div class="mark">${CROWN}ALEXEEV</div>
</div>${FIT}</body></html>`;
}

export async function suspect(context: RubricContext): Promise<RubricSample> {
  const turn = await context.sources.turns?.next('hero_trial');
  const size = SUSPECTS.length;
  const chosen =
    turn === undefined
      ? pick(SUSPECTS, context.random)
      : (SUSPECTS[shuffledOrder(Math.floor(turn / size), size)[turn % size] ?? 0] ?? pick(SUSPECTS, context.random));
  const hero = (await context.sources.heroes()).find((each) => each.name === `npc_dota_hero_${chosen.hero}`);
  if (hero === undefined) throw noData(`the hero ${chosen.hero}`);
  const name = spokenHeroName(chosen.hero) ?? hero.localizedName;
  const fields = [
    ['Обвиняется', chosen.charge],
    ['Ещё', chosen.more],
    ['Защита', chosen.defence]
  ] as const;
  const heading = `Подозреваемый: ${name}`;
  return {
    picture: { html: signPage(chosen, hero.localizedName), width: WIDTH, height: HEIGHT },
    heroScene: { renderUrl: `${RENDERS}/${chosen.hero}.png`, heroName: hero.localizedName, scene: 'suspect' },
    text: [heading, ...fields.map(([label, value]) => `${label}: ${value}`)].join('\n'),
    rich: [
      `<p><b>${escapeHtml(heading)}</b></p>`,
      ...fields.map(([label, value]) => `<p><b>${label}:</b> ${escapeHtml(value)}</p>`)
    ].join(''),
    boldLead: true,
    ownText: true,
    poll: poll('Приговор', shuffled(chosen.verdicts, context.random))
  };
}
