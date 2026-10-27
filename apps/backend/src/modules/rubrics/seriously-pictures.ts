// «Valve, ты серьёзно?» (07): the patch's funniest micro-changes, «под лупой» — the tiny difference shown huge, as if
// Valve's patch note were examined closely (owner idea, 27.10.2026). The owner chose look B of three (27.10.2026): one
// column per change, the difference as the headline; the post may go with it or as text alone, the release plan decides.
// Valve's portrait (faces must show), the ability's icon when there is one, the stat, the old value struck through, the
// new one. No hero names and no ▲/▼: the post carries them.
import { abilityImage, escapeHtml, heroPortraitImage, picturePage } from './picture';
import type { HeroInfo } from './types';

export interface SeriouslyChange {
  hero: Pick<HeroInfo, 'name'>;
  /** Valve's ability key (`lina_dragon_slave`), or null for a hero stat. */
  ability: string | null;
  /** The stat in Russian: «Броня», «Время каста». */
  stat: string;
  from: string;
  to: string;
  /** The difference as players read it: «+1», «−0,01». */
  diff: string;
}

/** Three at most: a fourth line would shrink every face. */
const MAX_CHANGES = 3;

const TITLE = 'Valve, ты <b>серьёзно?</b>';

/** A Tektur size that fits `text` in `room` px (its glyphs are about 0.62 em wide). */
const fit = (text: string, room: number, max: number) => Math.min(max, Math.floor(room / (text.length * 0.62)));

const portrait = (change: SeriouslyChange) => `<img class="pic" src="${heroPortraitImage(change.hero.name)}" alt="">`;
const icon = (change: SeriouslyChange) =>
  change.ability === null ? '' : `<img class="ab" src="${abilityImage(change.ability)}" alt="">`;
/** The patch-note pair: the old value struck through, the new one bright. */
const values = (change: SeriouslyChange) =>
  `<div class="vals"><s>${escapeHtml(change.from)}</s><span>${escapeHtml(change.to)}</span></div>`;
const stat = (change: SeriouslyChange) => `<div class="stat">${escapeHtml(change.stat)}</div>`;

const BASE = `body{display:block;padding:0;background:#0c0d0f}body::before,body::after{content:none}
.main{position:absolute;inset:0;display:block;padding:0}.main::after{content:none}
.mark{top:40px;left:72px;color:#6b6f76;z-index:3}
.title{position:absolute;left:68px;top:72px;margin:0;z-index:2;font-family:Tektur,sans-serif;font-size:80px;
line-height:1;letter-spacing:-.01em;text-transform:none;white-space:nowrap}.title::after{content:none}
.pic{display:block;flex:none;aspect-ratio:16/9;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.14);
background:#1d2229}
.ab{display:block;flex:none;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:#1d2229}
.stat{font-weight:600;color:#8a929e;line-height:1.1;white-space:nowrap}
.vals{display:flex;align-items:baseline;gap:.45em;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;
white-space:nowrap}
.vals s{color:#6b6f76;text-decoration-thickness:.08em}.vals span{color:#f1ebe0}
.diff{font-family:Tektur,sans-serif;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap}`;

// One column per change; the difference is the headline, the old and new values its small print. A single change lays
// out across: a big face on the left, its difference beside it.
const LOOK = {
  body: (changes: SeriouslyChange[]) => {
    const one = changes.length === 1;
    const size = Math.min(...changes.map((each) => fit(each.diff, one ? 760 : 440, one ? 220 : 120)));
    const cards = changes
      .map(
        (each) =>
          `<div class="card">${portrait(each)}<div class="info"><div class="head">${icon(each)}${stat(each)}</div>
<div class="diff" style="font-size:${size}px">${escapeHtml(each.diff)}</div>${values(each)}</div></div>`
      )
      .join('');
    return `<div class="cards${one ? ' one' : ''}">${cards}</div>`;
  },
  css: `.cards{position:absolute;left:72px;right:72px;top:192px;bottom:56px;display:grid;grid-auto-flow:column;
grid-auto-columns:minmax(0,1fr);gap:24px;align-content:center}
.card{display:flex;flex-direction:column;gap:24px;min-width:0}
.card .pic{width:100%}
.info{display:flex;flex-direction:column;gap:16px}
.head{display:flex;align-items:center;gap:16px;height:56px}.head .ab{width:56px;height:56px}.head .stat{font-size:24px}
.card .diff{color:#f1ebe0;letter-spacing:-.02em}
.card .vals{font-size:32px}
.one{grid-auto-columns:auto}.one .card{flex-direction:row;align-items:center;gap:64px}
.one .pic{width:512px}.one .info{gap:24px}.one .head{height:72px}.one .head .ab{width:72px;height:72px}
.one .head .stat{font-size:32px}.one .card .diff{color:var(--red)}.one .card .vals{font-size:48px}`
};

/** The picture for 1…3 micro-changes, the funniest first. */
export function seriouslyPicture(changes: SeriouslyChange[]): string {
  const shown = changes.slice(0, MAX_CHANGES);
  return picturePage(`<div class="title">${TITLE}</div>${LOOK.body(shown)}`, BASE + LOOK.css);
}
