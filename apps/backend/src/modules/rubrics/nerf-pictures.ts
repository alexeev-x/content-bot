// «Кого понерфят?» (06): a bet on the next patch. Each look is a pair that keeps one frame, like whose_ability: the
// question puts the strongest rising heroes «на прицел», the result (after the next patch) stamps each with what Valve
// did. The owner chose 'A' (a police lineup) and 'B' (a sniper scope on the most dangerous hero) of three, to take
// turns at random (27.10.2026); faces must show (owner: «чтобы на фотках было лицо персонажа видно»).
import { FACE_DEFAULT, HERO_FACES } from './hero-faces';
import type { PatchOutcome } from './patch-rubrics';
import { escapeHtml, heroPortraitImage, picturePage } from './picture';
import { percent, type HeroInfo } from './types';

export const NERF_LOOKS = ['A', 'B'] as const;
export type NerfLook = (typeof NERF_LOOKS)[number];

export interface NerfTarget {
  hero: Pick<HeroInfo, 'name'>;
  /** This week's share of wins over every rank, 0…1. */
  winRate: number;
  /** This week's win rate minus last week's, 0…1. */
  growth: number;
}

export interface NerfVerdict extends NerfTarget {
  outcome: PatchOutcome;
}

interface NerfPair {
  question(targets: NerfTarget[]): string;
  result(verdicts: NerfVerdict[], patch: string): string;
  css: string;
}

const STAMP: Record<PatchOutcome, string> = {
  nerfed: 'ПОНЕРФЛЕН',
  untouched: 'НЕ ТРОНУЛИ',
  buffed: 'АПНУЛИ',
  changed: 'ПЕРЕДЕЛАЛИ'
};
const stamp = (outcome: PatchOutcome) => `<span class="stamp ${outcome}">${STAMP[outcome]}</span>`;
const growth = (value: number) => `+${percent(value)}`;
/** A rise shows from half a percent, as in the post's text (stats-rubrics.ts `shownGrowth`). */
const GROWTH_SHOWN = 0.005;

/** Valve's 1440² cut-out render: sharp even when the scope shows it large. */
const heroRender = (key: string) =>
  `https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/${/^[a-z0-9_]{1,80}$/.test(key) ? key : 'default'}.png`;

const SCOPE = 600;
/** The render placed so the face sits a little above the scope's centre, head and shoulders filling it. */
function scopeImage(heroName: string) {
  const key = heroName.replace(/^npc_dota_hero_/, '');
  const [x, y, height] = HERO_FACES[key] ?? FACE_DEFAULT;
  // At most 1500 px: past Valve's 1440 the render would blur.
  const size = Math.round(Math.min(1500, Math.max(SCOPE, SCOPE / (height * 0.55))));
  const left = Math.round(SCOPE / 2 - x * size);
  const top = Math.round(SCOPE * 0.45 - y * size);
  return `<img src="${heroRender(key)}" alt="" style="width:${size}px;height:${size}px;left:${left}px;top:${top}px">`;
}

// A reticle with an open centre, so the face under it still reads.
const RETICLE = `<svg class="ret" viewBox="0 0 100 100"><circle cx="50" cy="50" r="38"/><path d="M50 0v26M50 74v26M0 50h26M74 50h26"/></svg>`;

/** The title's size so it fits its room (Tektur's caps are about 0.62 em wide). */
const titleSize = (text: string, room: number, max = 88) => Math.min(max, Math.floor(room / (text.length * 0.62)));
const title = (plain: string, html: string, room: number) =>
  `<style>:root{--t:${titleSize(plain, room)}px}</style><div class="title">${html}</div>`;
const questionTitle = (room: number) => title('Кого понерфят?', 'Кого <b>понерфят?</b>', room);
/** The result says how the bet went: «Понерфили 2 из 5», or nobody nerfed at all. */
const resultTitle = (verdicts: NerfVerdict[], room: number) => {
  const nerfed = verdicts.filter((each) => each.outcome === 'nerfed').length;
  if (nerfed === 0) return title('Valve похуй', 'Valve <b>похуй</b>', room);
  const count = `${nerfed} из ${verdicts.length}`;
  return title(`Понерфили ${count}`, `Понерфили <b>${count}</b>`, room);
};
/** What the numbers are: every rank, this week. */
const brackets = `<div class="meta"><span>Винрейт<br>за неделю</span></div>`;
const patchPlate = (patch: string) => `<div class="patch"><small>ПАТЧ</small>${escapeHtml(patch)}</div>`;

/** Bigger danger, bigger mark: the strongest hero's mark is `big` px, the weakest one's `small`. */
function markSize(targets: NerfTarget[], target: NerfTarget, small: number, big: number) {
  const rates = targets.map((each) => each.winRate);
  const low = Math.min(...rates);
  const high = Math.max(...rates);
  return high === low ? big : Math.round(small + ((target.winRate - low) / (high - low)) * (big - small));
}
/** Untouched heroes fade only when Valve touched someone: with nobody touched there is nothing to set apart. */
const faded = (verdicts: NerfVerdict[], verdict: NerfVerdict) =>
  verdict.outcome === 'untouched' && verdicts.some((each) => each.outcome !== 'untouched') ? ' off' : '';
const byDanger = <T extends NerfTarget>(targets: T[]) => [...targets].sort((a, b) => b.winRate - a.winRate);

const NERF_BASE = `body{display:block;padding:0;background:#0c0d0f}body::before,body::after{content:none}
.main{position:absolute;inset:0;display:block;padding:0}.main::after{content:none}
.mark{top:40px;left:72px;color:#6b6f76;z-index:3}
.title{position:absolute;left:68px;top:72px;margin:0;z-index:2;font-family:Tektur,sans-serif;font-size:var(--t,88px);
line-height:1;letter-spacing:-.01em;text-transform:none;white-space:nowrap}.title::after{content:none}
.num{font-weight:800;line-height:1;font-variant-numeric:tabular-nums;color:#f1ebe0;white-space:nowrap}
.gr{font-weight:600;line-height:1;font-variant-numeric:tabular-nums;color:#8a929e;white-space:nowrap}
.meta{position:absolute;top:64px;right:72px;display:flex;align-items:center;gap:8px;font-weight:600;font-size:20px;
line-height:1.2;color:#8a929e}.meta img{display:block;width:72px;height:72px}.meta span{margin-left:12px}
.patch{position:absolute;top:60px;right:72px;text-align:right;font-weight:800;font-size:48px;line-height:1;color:#f1ebe0}
.patch small{display:block;margin-bottom:10px;font-size:18px;letter-spacing:8px;color:var(--red)}
.stamp{display:inline-block;padding:8px 14px 7px;border:3px solid currentColor;border-radius:4px;font-family:Tektur,sans-serif;
font-weight:800;font-size:var(--s,30px);line-height:1;white-space:nowrap;transform:rotate(-4deg)}
.stamp.nerfed{color:#fff;background:var(--red);border-color:var(--red)}
.stamp.buffed{color:#0c0d0f;background:#f1ebe0;border-color:#f1ebe0}
.stamp.untouched{color:#8a929e;background:#0c0d0f}
.stamp.changed{color:#f1ebe0;background:#0c0d0f}
.ret{position:absolute;overflow:visible;fill:none;stroke:var(--red);stroke-width:3px;vector-effect:non-scaling-stroke}
.ret *{vector-effect:non-scaling-stroke}
.pic{display:block;border-radius:10px;border:1px solid rgba(255,255,255,.14);object-fit:cover;background:#1d2229}`;

const NERF_PAIRS: Record<NerfLook, NerfPair> = {
  // A: a police lineup. The heroes stand in a row in front of a height chart, a reticle over each face, bigger for the
  // higher win rate; under each a placard with its numbers. The result stamps the placard.
  A: {
    question: (targets) => {
      const row = byDanger(targets)
        .map((each) => {
          const size = markSize(targets, each, 84, 132);
          return `<div class="who"><div class="cell"><img src="${heroPortraitImage(each.hero.name)}" alt="">
<div class="aim" style="--m:${size}px">${RETICLE}</div></div>
<div class="card"><div class="num">${percent(each.winRate)}</div>${each.growth >= GROWTH_SHOWN ? `<div class="gr">${growth(each.growth)} за неделю</div>` : ''}</div></div>`;
        })
        .join('');
      return `${questionTitle(1000)}${brackets}<div class="line">${row}</div>`;
    },
    result: (verdicts, patch) => {
      const row = byDanger(verdicts)
        .map((each) => {
          const size = markSize(verdicts, each, 84, 132);
          return `<div class="who ${each.outcome}${faded(verdicts, each)}"><div class="cell"><img src="${heroPortraitImage(each.hero.name)}" alt="">
<div class="aim" style="--m:${size}px">${RETICLE}</div></div>
<div class="card"><div class="num">${percent(each.winRate)}</div>${stamp(each.outcome)}</div></div>`;
        })
        .join('');
      return `${resultTitle(verdicts, 1000)}${patchPlate(patch)}<div class="line">${row}</div>`;
    },
    css: `.line{position:absolute;left:0;right:0;top:196px;bottom:40px;padding:0 72px 24px;display:grid;grid-auto-flow:column;
grid-auto-columns:minmax(0,1fr);gap:24px;align-content:center;
background:repeating-linear-gradient(to top,rgba(255,255,255,.14) 0 2px,transparent 2px 96px) 0 0/100% 100%,
repeating-linear-gradient(to top,rgba(255,255,255,.05) 0 1px,transparent 1px 24px) 0 0/100% 100%}
.who{display:flex;flex-direction:column;gap:20px;min-width:0}
.cell{position:relative;aspect-ratio:4/3;overflow:hidden;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:#161a20}
.cell img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.aim{position:absolute;left:50%;top:48%;width:var(--m);height:var(--m);transform:translate(-50%,-50%)}
.aim .ret{inset:0;width:100%;height:100%}
.card{flex:none;height:112px;display:flex;flex-direction:column;justify-content:center;gap:12px;padding:0 4px}
.card .num{font-size:48px}.card .gr{font-size:22px}
.card .stamp{align-self:flex-start;--s:24px}
.off .cell img{opacity:.4}.off .ret,.buffed .ret{stroke:#8a929e}.off .num{color:#8a929e}`
  },
  // B: a sniper scope on the most dangerous hero, its numbers big beside it; the rest wait in a row under them, each
  // with its own small mark. The result stamps the scope and every face in the row.
  B: {
    question: (targets) => {
      const [first, ...rest] = byDanger(targets);
      if (first === undefined) return questionTitle(760);
      return `${questionTitle(760)}${scope(first, '')}
<div class="lead"><div class="num">${percent(first.winRate)}</div><div class="gr">побед за неделю</div>
${first.growth >= GROWTH_SHOWN ? `<div class="gr up">${growth(first.growth)} к прошлой неделе</div>` : ''}</div>
<div class="queue">${rest
        .map(
          (each) =>
            `<div class="q"><img class="pic" src="${heroPortraitImage(each.hero.name)}" alt=""><div class="num">${percent(each.winRate)}</div></div>`
        )
        .join('')}</div>`;
    },
    result: (verdicts, patch) => {
      const [first, ...rest] = byDanger(verdicts);
      if (first === undefined) return resultTitle(verdicts, 760);
      return `${resultTitle(verdicts, 760)}${patchPlate(patch)}${scope(first, `${faded(verdicts, first)} ${first.outcome}`)}
<div class="lead"><div class="num">${percent(first.winRate)}</div><div class="gr">побед за неделю</div></div>
<div class="sx">${stamp(first.outcome)}</div>
<div class="queue">${rest
        .map(
          (each) =>
            `<div class="q${faded(verdicts, each)}"><img class="pic" src="${heroPortraitImage(each.hero.name)}" alt="">${stamp(each.outcome)}</div>`
        )
        .join('')}</div>`;
    },
    css: `.scope{position:absolute;left:760px;top:100px;width:600px;height:600px;border-radius:50%;overflow:hidden;
background:radial-gradient(circle at 50% 45%,#1e242c 0%,#12161b 70%);border:2px solid rgba(255,255,255,.22)}
.scope img{position:absolute;max-width:none}
.scope .ret{inset:0;width:100%;height:100%;stroke-width:2px}
.scope.off img{opacity:.4}.scope.untouched .ret,.scope.buffed .ret{stroke:#8a929e}
.lead{position:absolute;left:72px;top:216px;display:flex;flex-direction:column;gap:14px}
.lead .num{font-size:120px;letter-spacing:-.02em}.lead .gr{font-size:24px}.lead .up{color:#f1ebe0}
.sx{position:absolute;left:72px;top:410px}.sx .stamp{--s:40px}
.queue{position:absolute;left:72px;top:520px;display:flex;gap:16px}
.q{display:flex;flex-direction:column;align-items:flex-start;gap:12px}.q .pic{width:168px;height:94px}
.q .num{font-size:28px}.q .stamp{--s:17px;padding:6px 8px 5px;border-width:2px}
.q.off .pic{opacity:.4}`
  }
};

/** The scope: the hero's sharp render in a round sight under the reticle, moved so the face is in it. */
const scope = (target: NerfTarget, classes: string) =>
  `<div class="scope${classes}">${scopeImage(target.hero.name)}${RETICLE}</div>`;

/** The question picture: the heroes on the target, with this week's win rate and its rise. */
export function nerfQuestionPicture(look: NerfLook, targets: NerfTarget[]): string {
  const pair = NERF_PAIRS[look];
  return picturePage(pair.question(targets), NERF_BASE + pair.css);
}

/** The result picture after the next patch: the same frame, each hero stamped with what Valve did. */
export function nerfResultPicture(look: NerfLook, verdicts: NerfVerdict[], patch: string): string {
  const pair = NERF_PAIRS[look];
  return picturePage(pair.result(verdicts, patch), NERF_BASE + pair.css);
}
