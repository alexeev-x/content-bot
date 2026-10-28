// «Кто кого перебьёт?» (10): one picture and nothing else; people argue in the comments (owner, 27.10.2026). Two
// carries face to face, each with six items: half the time their real late build, half a joke build where six identical
// icons are the joke, so the slots are large. The title is a crude question picked at random (owner, 27.10.2026: one
// question on the picture; «Кто кого перебьёт?» is only the rubric's inner name). No names or arrows:
// players know heroes by face, so every hero is Valve's sharp 1440² render moved by HERO_FACES until the face sits where
// the frame wants it.
import { FACE_DEFAULT, HERO_FACES } from './hero-faces';
import { escapeHtml, itemImage, picturePage } from './picture';
import type { HeroInfo } from './types';

export const VERSUS_LOOKS = ['B', 'D'] as const;
export type VersusLook = (typeof VERSUS_LOOKS)[number];

/** The picture's title, one picked at random: its plain start and its red end. */
export const VERSUS_TITLES = [
  { lead: 'Кто кому', red: 'пизды даст?' },
  { lead: 'Кто кого', red: 'ебнет?' },
  { lead: 'Кто у кого', red: 'отсосёт?' },
  { lead: 'Кто кого', red: 'разъебёт?' },
  { lead: 'Кто первый', red: 'сольётся?' }
] as const;
export type VersusTitle = (typeof VERSUS_TITLES)[number];

export interface VersusSide {
  hero: Pick<HeroInfo, 'name'>;
  /** Six items: the real late build, most bought first, or a joke build. */
  items: { key: string }[];
}

const renderKey = (heroName: string) => {
  const key = heroName.replace(/^npc_dota_hero_/, '');
  return /^[a-z0-9_]{1,80}$/.test(key) ? key : 'default';
};
const heroRender = (key: string) =>
  `https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/${key}.png`;

interface Frame {
  width: number;
  height: number;
  /** Where the face goes, as fractions of the frame. */
  faceX: number;
  faceY: number;
  /** The share of the figure's height the frame shows: 0.55 is head and shoulders. */
  share: number;
}

/** The render placed so the face sits at (faceX, faceY) of the frame. */
function placedRender(heroName: string, frame: Frame) {
  const key = renderKey(heroName);
  const [x, y, height] = HERO_FACES[key] ?? FACE_DEFAULT;
  // At most 1500 px: past Valve's 1440 the render would blur.
  const size = Math.round(Math.min(1500, Math.max(frame.width, frame.height, frame.height / (height * frame.share))));
  const left = Math.round(frame.faceX * frame.width - x * size);
  const top = Math.round(frame.faceY * frame.height - y * size);
  return `<img class="r" src="${heroRender(key)}" alt="" style="width:${size}px;height:${size}px;left:${left}px;top:${top}px">`;
}

/** A frame holding the hero; `flip` mirrors it so the faces turn to each other. */
const heroBox = (side: VersusSide, frame: Frame, cls: string, flip: boolean) =>
  `<div class="box ${cls}">${flip ? `<div class="flip">${placedRender(side.hero.name, frame)}</div>` : placedRender(side.hero.name, frame)}</div>`;

const itemTags = (items: { key: string }[]) =>
  items.map((item) => `<img class="it" src="${escapeHtml(itemImage(item.key))}" alt="">`).join('');
const six = (side: VersusSide) => side.items.slice(0, 6);

const titleHtml = (title: VersusTitle, wrap: boolean) =>
  `${escapeHtml(title.lead)}${wrap ? '<br>' : ' '}<b>${escapeHtml(title.red)}</b>`;

// Scale: type 72/64/28; gaps 12/24/40/72. Items stay at most 1.66× Valve's 88×64 so they keep sharp.
const BASE = `body{display:block;padding:0;background:#0c0d0f}body::before,body::after{content:none}
.main{position:absolute;inset:0;display:block;padding:0}.main::after{content:none}
.mark{top:40px;left:72px;color:#6b6f76;z-index:3}
.title{position:absolute;left:68px;top:72px;margin:0;z-index:2;font-family:Tektur,sans-serif;font-size:72px;line-height:1;
letter-spacing:-.01em;text-transform:none;white-space:nowrap}.title::after{content:none}
.box{position:absolute;overflow:hidden;border-radius:10px;border:1px solid rgba(255,255,255,.14);
background:radial-gradient(ellipse 60% 70% at var(--fx,50%) 30%,#232a33 0%,#14181e 75%)}
.box .r{position:absolute;max-width:none}.flip{position:absolute;inset:0;transform:scaleX(-1)}
.it{display:block;width:var(--iw);height:var(--ih);border-radius:6px;border:1px solid rgba(255,255,255,.14);background:#14181e}
.vs{font-family:Tektur,sans-serif;font-weight:800;line-height:1;color:#f1ebe0}`;

interface Look {
  body(a: VersusSide, b: VersusSide, title: VersusTitle): string;
  css: string;
}

// B: a fight poster. Two tall corners hold the heroes; between them the title and the items, paired slot by slot
// across «VS», two by three on each side.
const B_FRAME: Frame = { width: 336, height: 624, faceX: 0.5, faceY: 0.22, share: 0.95 };
const bGrid = (items: { key: string }[]) => `<div class="grid">${itemTags(items)}</div>`;

// D: the diagonal. Two slanted strips lean the same way, one hero top left, the other bottom right, faces turned to
// each other; each hero's six items sit two by three in the opposite corner of its row, and the question runs between
// the rows. The strip is skewed and its picture skewed back, so the faces stay true.
const D_SKEW = 48; // 222 px high at 12°: how far the strip's top is shifted against its bottom.
const D_FRAME: Frame = { width: 840 + 2 * D_SKEW, height: 222, faceX: 0.42, faceY: 0.28, share: 0.3 };
const slantBox = (side: VersusSide, cls: string, flip: boolean) => {
  const render = placedRender(side.hero.name, D_FRAME);
  return `<div class="box ${cls}"><div class="sk">${flip ? `<div class="flip">${render}</div>` : render}</div></div>`;
};

const grid = (items: { key: string }[], cls: string) => `<div class="grid ${cls}">${itemTags(items)}</div>`;

const LOOKS: Record<VersusLook, Look> = {
  B: {
    body: (a, b, title) =>
      `${heroBox(a, B_FRAME, 'l', false)}${heroBox(b, B_FRAME, 'r', true)}
<div class="head title">${titleHtml(title, true)}</div>
<div class="tape">${bGrid(six(a))}<span class="vs">VS</span>${bGrid(six(b))}</div>`,
    css: `.box{top:72px;width:336px;height:624px}.box.l{left:72px}.box.r{left:1128px}
.head.title{left:432px;width:672px;top:80px;font-size:64px;line-height:1.05;text-align:center}
.tape{position:absolute;left:432px;width:672px;top:357px;height:339px;display:grid;grid-template-columns:300px 72px 300px;
align-items:center}.tape .vs{font-size:40px;text-align:center}
.grid{display:grid;grid-template-columns:repeat(2,144px);gap:12px;--iw:144px;--ih:105px}`
  },
  D: {
    body: (a, b, title) =>
      `${slantBox(a, 'a', false)}${grid(six(a), 'a')}<div class="title">${titleHtml(title, false)}</div>
${grid(six(b), 'b')}${slantBox(b, 'b', true)}`,
    css: `.box{width:840px;height:222px;transform:skewX(-12deg)}.box.a{left:72px;top:72px;transform-origin:0 100%;--fx:42%}
.box.b{left:624px;top:474px;transform-origin:0 0;--fx:58%}
.sk{position:absolute;top:0;bottom:0;left:-${D_SKEW}px;right:-${D_SKEW}px;transform:skewX(12deg)}
.title{top:348px}
.grid{position:absolute;display:grid;grid-template-columns:repeat(3,144px);gap:12px;--iw:144px;--ih:105px}
.grid.a{left:1008px;top:72px}.grid.b{left:72px;top:474px}`
  }
};

/** The rubric's only picture: two heroes with six items each, «VS» between them, a crude question as the title. */
export function versusPicture(look: VersusLook, a: VersusSide, b: VersusSide, title: VersusTitle): string {
  const chosen = LOOKS[look];
  return picturePage(chosen.body(a, b, title), BASE + chosen.css);
}
