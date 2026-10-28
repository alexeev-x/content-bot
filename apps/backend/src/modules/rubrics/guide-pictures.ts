// «Гайд на героя» (12): one card with the build players actually buy, plus a second carousel slide for the alternative
// build, in the `column` look the owner chose (27.10.2026). Every hero, item and ability
// is Valve's own image; the guided hero is the sharp 1440² render placed by HERO_FACES so the face shows, the matchup
// heroes are Valve's small portraits. The content is fixed by the owner (27.10.2026): title with a role badge, the
// build's win rate and sample, four item groups, matchups as one spectrum, win rate by game length, skill order for
// levels 1–10 (abilities only) and the talents.
import { FACE_DEFAULT, HERO_FACES } from './hero-faces';
import { abilityImage, escapeHtml, heroPortraitImage, itemImage, picturePage } from './picture';

export type GuideRole = 'carry' | 'mid' | 'offlane' | 'support';
/** The role badge beside the hero's name: a hero may be guided for another role than its usual one. */
const ROLE_WORDS: Record<GuideRole, string> = { carry: 'Керри', mid: 'Мид', offlane: 'Оффлейн', support: 'Саппорт' };

export interface GuideItem {
  key: string;
  /** The usual minute it is bought, when known. */
  minute?: number;
  /** The share of matches that bought (or ended with) it, 0…1, when counted from a sample. */
  share?: number;
}

/** One side of a talent level: its text, how often it is taken and how often it wins, 0…1. */
export interface GuideTalent {
  text: string;
  pickRate: number;
  winRate: number;
}
export interface GuideTalentRow {
  level: number;
  left: GuideTalent;
  right: GuideTalent;
}

/** The hero's win rate against one opponent minus its usual win rate, 0…1: −0.061 is 6.1 points worse. */
export interface GuideMatchup {
  hero: { name: string };
  delta: number;
}

/** The main build's item and the one this build buys in its place. */
export interface GuideSwap {
  from: GuideItem;
  to: GuideItem;
}

export interface GuideAltBuild {
  /** Left out when the sample holds winners only (STRATZ's guide lists): `share` speaks for the build instead. */
  winRate?: number;
  /** The share of the sample's matches that went this way, 0…1. */
  share: number;
  matches: number;
  /** The item the build turns on, as players name it: «через Мьёльнир». */
  keyItem: string;
  /** The key item's id, for its win rate from STRATZ's purchase totals. */
  keyItemId?: number;
  /** Only the items that differ from the main build, at most four drawn: the shared ones would repeat slide one. */
  swaps: GuideSwap[];
  /** The build's own core in buy order with minutes, its starting set and neutrals, as its matches play them. */
  core?: GuideItem[];
  start?: GuideItem[];
  neutrals?: GuideItem[];
  /** Every talent level this build's matches took, highest first or in any order; `instead` when the main build differs. */
  picks?: { level: number; text: string; instead?: string }[];
  /** Only the talent levels where this build picks the other side; `instead` is the main build's pick. */
  talents?: { level: number; text: string; instead: string }[];
  /** Levels 1–10 as in `HeroGuideCard.skills`, when known; drawn only when some level differs. */
  skills?: (string | null)[];
}

/** One «Поздняя игра» window: matches `from`–`to` minutes long (`to` null: and longer) and what they ended with. */
export interface GuideLate {
  from: number;
  to: number | null;
  matches: number;
  items: GuideItem[];
}

export interface HeroGuideCard {
  hero: { name: string; localizedName: string };
  role: GuideRole;
  /** The main build's win rate (0…1) over `buildMatches` games of the last `buildDays` days; the line is left out without them. */
  buildWinRate?: number;
  buildMatches?: number;
  buildDays: number;
  /** The rate is the hero's at the position, not the build's (the sample held winners only). */
  buildRateOfRole?: boolean;
  /** The days the alternative's sample spans when they differ from `buildDays` (the base's newest games). */
  altDays?: number;
  /** At most six each; core in buy order. */
  start: GuideItem[];
  core: GuideItem[];
  situational: GuideItem[];
  /** One per tier, tier 1 first; may be empty. */
  neutrals: GuideItem[];
  /** The heroes it fears (negative delta) and the ones it beats (positive); five of each at most are drawn; may be empty. */
  matchups: GuideMatchup[];
  /** Win rate (0…1) in games under 35 minutes, 35–50 and over 50; the block is left out without it. */
  byLength?: [number, number, number];
  /** The hero's abilities in Q, W, E, R order; with four the last is the ultimate (Invoker's three basics have none). */
  abilities: string[];
  /** Level 1 first: an ability key from `abilities`, or null for a level without one. Only levels 1–10 are drawn; may be empty. */
  skills: (string | null)[];
  /** The talent tree: levels 10, 15, 20, 25, each with its two options in Russian; may be empty. */
  talents?: GuideTalentRow[];
  /** «Поздняя игра» windows for the items slide; may be empty. */
  late?: GuideLate[];
  /** The second carousel slide: a rarer build, drawn only when present. */
  alt?: GuideAltBuild;
}

// ---- numbers in Russian ----

const decimal = (value: number) => (Math.round(value * 1000) / 10).toFixed(1).replace('.', ',');
const percent = (value: number) => `${decimal(value)}%`;
const signed = (value: number) => `${value > 0 ? '+' : '−'}${decimal(Math.abs(value))}%`;
const pct = (value: number) => `${Math.round(value * 100)}%`;
const count = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
function plural(value: number, [one, few, many]: [string, string, string]) {
  const tens = value % 100;
  const units = value % 10;
  if (units === 1 && tens !== 11) return one;
  if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) return few;
  return many;
}
const MATCHES: [string, string, string] = ['матч', 'матча', 'матчей'];
const DAYS: [string, string, string] = ['день', 'дня', 'дней'];

// ---- the hero ----

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

/** The render placed so the face sits at (faceX, faceY) of the frame (same rule as «Кто кого перебьёт?»). */
function placedRender(heroName: string, frame: Frame) {
  const key = renderKey(heroName);
  const [x, y, height] = HERO_FACES[key] ?? FACE_DEFAULT;
  // At most 1500 px: past Valve's 1440 the render would blur.
  const size = Math.round(Math.min(1500, Math.max(frame.width, frame.height, frame.height / (height * frame.share))));
  const left = Math.round(frame.faceX * frame.width - x * size);
  const top = Math.round(frame.faceY * frame.height - y * size);
  return `<img class="r" src="${heroRender(key)}" alt="" style="width:${size}px;height:${size}px;left:${left}px;top:${top}px">`;
}

const heroBox = (guide: HeroGuideCard, frame: Frame) =>
  `<div class="box" style="width:${frame.width}px;height:${frame.height}px">${placedRender(guide.hero.name, frame)}</div>`;

// ---- shared blocks ----

interface HeadShape {
  /** The width the title may take. */
  room: number;
  max: number;
}

/**
 * «Гайд на <hero>» with the role as a badge (owner, 27.10.2026: «Гайд на {имя героя} и значок роли, бывает герой на
 * другую роль идёт»); a long name shrinks to fit the title's room.
 */
function head(guide: HeroGuideCard, shape: HeadShape) {
  const name = guide.hero.localizedName;
  // Tektur runs about 0.53 em a letter; 0.56 keeps a margin for wide capitals.
  const size = Math.min(shape.max, Math.floor(shape.room / ((name.length + 8) * 0.56)));
  return `<div class="z head"><h1 class="title" style="font-size:${size}px">Гайд на <b>${escapeHtml(name)}</b></h1><span class="role">${ROLE_WORDS[guide.role]}</span></div>`;
}

/** «Винрейт сборки 53,4% · 1 864 матча за 14 дней»; `label` is the first part's HTML, `note` a second line in red. */
function stat(label: string, matches: number, days: number, cls: string, note?: string) {
  const sample = `${count(matches)} ${plural(matches, MATCHES)} за ${days} ${plural(days, DAYS)}`;
  return `<p class="stat ${cls}"><span>${label}</span><span class="dot"> · </span><span>${sample}</span>${
    note === undefined ? '' : `<span class="note">${note}</span>`
  }</p>`;
}

/** The width the card's item column gives a row: six icons with their gaps. */
const ROW_ROOM = 6 * 88 + 5 * 8;
/** At most this many in the core row: the cheap early items and the six real ones. */
const CORE_MAX = 9;
const ICON_WIDTH = 88;

/**
 * Item icons; `numbered` (the core) gets the minute under each when known (owner, 27.10.2026: no order numbers, they hid the
 * items). The core
 * (`numbered`) keeps every item, the early ones and six real ones: past six the icons shrink to fit the row.
 */
function items(list: GuideItem[], numbered: boolean) {
  // Only the core carries minutes on the card: the situational ones have theirs on the «Предметы» slide.
  const timed = numbered && list.some((item) => item.minute !== undefined);
  const shown = numbered ? list.slice(0, CORE_MAX) : list.slice(0, 6);
  const width = Math.min(ICON_WIDTH, Math.floor((ROW_ROOM - 8 * (shown.length - 1)) / shown.length));
  // A shrunk row gets smaller minute labels: «14 мин» at 18 px is wider than a 58 px icon.
  const size = width === ICON_WIDTH ? '' : ` dense" style="--iw:${width}px;--ih:${Math.round((width * 64) / 88)}px`;
  return `<div class="items${size}">${shown
    .map((item) => {
      const minute = timed ? `<span>${item.minute === undefined ? '' : `${Math.round(item.minute)} мин`}</span>` : '';
      return `<figure class="it"><img src="${escapeHtml(itemImage(item.key))}" alt="">${minute}</figure>`;
    })
    .join('')}</div>`;
}

const section = (label: string, content: string) => `<section class="sec"><h3>${label}</h3>${content}</section>`;

/** The item groups that have items, in the order players buy them. */
function itemGroups(guide: HeroGuideCard): [string, GuideItem[], boolean][] {
  const groups: [string, GuideItem[], boolean][] = [
    ['Стартовый закуп', guide.start, false],
    ['Основа', guide.core, true],
    ['По ситуации', guide.situational, false],
    ['Нейтралки', guide.neutrals.slice(0, 5), false]
  ];
  return groups.filter(([, list]) => list.length > 0);
}

/** The item groups as rows, a label column beside each. */
const groups = (guide: HeroGuideCard) =>
  `<div class="z grp rows">${itemGroups(guide)
    .map(([label, list, numbered]) => section(label, items(list, numbered)))
    .join('')}</div>`;

/** Moves sorted positions apart to at least `step` from each other, keeping them within [lo, hi]. */
function pushApart(xs: number[], lo: number, hi: number, step: number) {
  for (let index = 0; index < xs.length; index++)
    xs[index] = Math.max(lo, index === 0 ? (xs[0] ?? lo) : Math.max(xs[index] ?? lo, (xs[index - 1] ?? lo) + step));
  for (let index = xs.length - 1; index >= 0; index--) {
    const limit = index === xs.length - 1 ? hi : (xs[index + 1] ?? hi) - step;
    xs[index] = Math.max(lo, Math.min(xs[index] ?? lo, limit));
  }
}

// ---- matchups as one spectrum ----

interface SpectrumShape {
  width: number;
  /** The widest a face may be; it shrinks when five do not fit a side. */
  face: number;
}
const SPEC = { head: 34, label: 20, stem: 14, pad: 52, gap: 8, side: 8 };

/**
 * The matchups as one axis (idea from Dota2ProTracker, drawn our way): faces placed by the win-rate difference, those
 * the hero fears on the left, those it beats on the right. A face pushed aside by a neighbour keeps a stem to its true
 * value on the axis, so the order and the numbers stay exact. Faces take turns above and below the axis (two lanes),
 * so close values still fit.
 */
function spectrum(guide: HeroGuideCard, shape: SpectrumShape) {
  const { width } = shape;
  const mid = width / 2;
  const fear = guide.matchups
    .filter((matchup) => matchup.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 5);
  const prey = guide.matchups
    .filter((matchup) => matchup.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5)
    .reverse();
  const most = Math.max(fear.length, prey.length, 1);
  const room = mid - SPEC.side;
  const fit = (2 * room - (most - 1) * SPEC.gap) / (most + 1);
  const face = Math.floor(Math.min(shape.face, fit));
  const faceHeight = Math.round((face * 9) / 16);
  const step = (face + SPEC.gap) / 2;
  const reach = Math.max(8, Math.ceil(Math.max(...guide.matchups.map((m) => Math.abs(m.delta) * 100)) / 2) * 2);
  // Each side runs from its own mildest matchup to the reach (owner, 27.10.2026: «как много пустого места» around zero
  // on one scale): the axis breaks at the middle, so the points spread over the whole half.
  const near = (list: GuideMatchup[]) =>
    Math.max(0, Math.floor(Math.min(reach, ...list.map((m) => Math.abs(m.delta) * 100))) - 1);
  const [nearFear, nearPrey] = [near(fear), near(prey)];
  const halfRoom = mid - SPEC.side - SPEC.pad;
  const axisX = (delta: number) => {
    const value = Math.min(reach, Math.abs(delta) * 100);
    const from = delta < 0 ? nearFear : nearPrey;
    const t = reach === from ? 1 : Math.max(0, (value - from) / (reach - from));
    return delta < 0 ? mid - SPEC.side - t * halfRoom : mid + SPEC.side + t * halfRoom;
  };
  // Faces spread evenly over their half in the axis order; a stem joins each to its point.
  const place = (list: GuideMatchup[], lo: number, hi: number) => {
    const xs = list.map((_, index) => lo + ((hi - lo) * (index + 0.5)) / list.length);
    pushApart(xs, lo, hi, step);
    return xs;
  };
  const fearXs = place(fear, face / 2, mid - SPEC.side - face / 2);
  const preyXs = place(prey, mid + SPEC.side + face / 2, width - face / 2);
  const placed = [
    ...fear.map((matchup, index) => ({ matchup, x: fearXs[index] ?? 0 })),
    ...prey.map((matchup, index) => ({ matchup, x: preyXs[index] ?? 0 }))
  ];
  const lane = faceHeight + 4 + SPEC.label + SPEC.stem;
  const axisY = SPEC.head + lane;
  const height = axisY + lane + 2;
  const marks: string[] = [];
  const lines: string[] = [];
  placed.forEach(({ matchup, x }, index) => {
    const below = index % 2 === 1;
    const at = axisX(matchup.delta);
    const fears = matchup.delta < 0;
    const labelTop = below ? axisY + SPEC.stem : SPEC.head + faceHeight + 4;
    const faceTop = below ? labelTop + SPEC.label + 4 : SPEC.head;
    const stemEnd = below ? labelTop - 2 : labelTop + SPEC.label + 2;
    lines.push(
      `<line x1="${at}" y1="${axisY}" x2="${x}" y2="${stemEnd}"/>`,
      `<circle cx="${at}" cy="${axisY}" r="5" fill="${fears ? '#d63a22' : '#f1ebe0'}"/>`
    );
    const left = Math.round(x - face / 2);
    marks.push(
      `<img class="fc" src="${escapeHtml(heroPortraitImage(matchup.hero.name))}" alt="" style="left:${left}px;top:${faceTop}px;width:${face}px;height:${faceHeight}px">`,
      `<span class="d${fears ? ' neg' : ''}" style="left:${left}px;top:${labelTop}px;width:${face}px">${signed(matchup.delta)}</span>`
    );
  });
  const ticks = [-reach, reach]
    .map((value) => `<line x1="${axisX(value / 100)}" y1="${axisY - 5}" x2="${axisX(value / 100)}" y2="${axisY + 5}"/>`)
    .join('');
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<line class="zero" x1="${mid}" y1="${SPEC.head - 4}" x2="${mid}" y2="${height}"/>
<line class="axis" x1="${SPEC.pad - 6}" y1="${axisY}" x2="${mid - SPEC.side}" y2="${axisY}"/>
<line class="axis" x1="${mid + SPEC.side}" y1="${axisY}" x2="${width - SPEC.pad + 6}" y2="${axisY}"/>
<g class="tick">${ticks}</g><g class="stem">${lines.join('')}</g></svg>`;
  return `<div class="z spec" style="width:${width}px;height:${height}px">${svg}
<h3 class="fear">Кого боится</h3><h3 class="prey">Кого душит</h3>
<span class="end" style="left:0;top:${axisY - 10}px;width:${SPEC.pad - 12}px;text-align:right">−${reach}%</span>
<span class="end" style="left:${width - SPEC.pad + 12}px;top:${axisY - 10}px">+${reach}%</span>${marks.join('')}</div>`;
}

// ---- win rate by game length ----

const LENGTHS = ['до 35 мин', '35–50 мин', '50+ мин'];

/** Three bars on a 0–100% scale with a mark at 50%; the strongest stretch of the game in red. */
function lengthBars(guide: HeroGuideCard) {
  const lengths = guide.byLength;
  if (lengths === undefined) return '';
  const best = lengths.indexOf(Math.max(...lengths));
  return `<div class="len"><h3>Винрейт по длине матча</h3>${lengths
    .map(
      (value, index) =>
        `<div class="lr${index === best ? ' hi' : ''}"><span>${LENGTHS[index]}</span><div class="lt"><i style="width:${(value * 100).toFixed(1)}%"></i></div><b>${percent(value)}</b></div>`
    )
    .join('')}</div>`;
}

// ---- skills and talents ----

/** Levels 1–10 only: abilities, never talents (owner, 27.10.2026: talents cost no point and have their own block). */
// A level with nothing to learn shows a dash: an empty cell read as a missing picture.
const skillTile = (guide: HeroGuideCard, skill: string | null | undefined) =>
  skill != null && guide.abilities.includes(skill)
    ? `<img src="${escapeHtml(abilityImage(skill))}" alt="">`
    : '<b>—</b>';

function skillRow(guide: HeroGuideCard) {
  const ultimate = guide.abilities.length === 4 ? guide.abilities.at(-1) : undefined;
  const cells = guide.skills
    .slice(0, 10)
    .map(
      // The ultimate's levels in red: the one point players look for first.
      (skill, index) =>
        `<div class="lv">${skillTile(guide, skill)}<span${skill === ultimate ? ' class="ult"' : ''}>${index + 1}</span></div>`
    )
    .join('');
  return `<div class="z skills"><h3>Как качать</h3><div class="row">${cells}</div></div>`;
}

/** «Лучший выбор»: the side taken at least as often that also wins more, else the more taken one. */
const bestSide = (row: GuideTalentRow): 'left' | 'right' => {
  const score = (talent: GuideTalent) => talent.pickRate * talent.winRate;
  return score(row.left) >= score(row.right) ? 'left' : 'right';
};
/** «Тайная имба»: the other side, rarely taken (under 20%) yet winning 3 points more (75,2% against 71,8%). */
const hiddenGem = (row: GuideTalentRow) => {
  const other = bestSide(row) === 'left' ? row.right : row.left;
  const best = bestSide(row) === 'left' ? row.left : row.right;
  return other.pickRate < 0.2 && other.winRate - best.winRate >= 0.03 ? other : null;
};

/** The most characters of a talent's text that fit one line of the card at its full size. */
const TALENT_ONE_LINE = 24;

/**
 * The talents, level 25 on top as in the game: only the best side, big, with how often it is taken and a red ★ line
 * for a rarely taken side that wins more. Empty when the guide has none.
 */
function talentBlock(guide: HeroGuideCard) {
  const rows = [...(guide.talents ?? [])].sort((a, b) => b.level - a.level);
  if (rows.length === 0) return '';
  const body = rows
    .map((row) => {
      const taken = bestSide(row) === 'left' ? row.left : row.right;
      const gem = hiddenGem(row);
      // Valve's wording runs long: past one line the text is set smaller on two, and a longer one is cut (see .lg).
      const long = taken.text.length > TALENT_ONE_LINE;
      return `<div class="tb"><b>${row.level}</b><p${long ? ' class="lg"' : ''}>${escapeHtml(taken.text)}</p><small>берут ${pct(taken.pickRate)}</small>${
        gem === null ? '' : `<em><span>★ ${escapeHtml(gem.text)}</span><i> — ${pct(gem.winRate)} побед</i></em>`
      }</div>`;
    })
    .join('');
  return `<div class="tal"><h3>Таланты</h3><div class="list${rows.some((row) => (bestSide(row) === 'left' ? row.left : row.right).text.length > TALENT_ONE_LINE) ? ' tight' : ''}">${body}</div></div>`;
}

// ---- «Чем отличается»: the alternative as its differences only ----

const minutes = (item: GuideItem) => (item.minute === undefined ? '' : `${Math.round(item.minute)} мин`);

/** «Вместо»: the main build's item dimmed, an arrow, the alternative's item bright. */
function swapList(alt: GuideAltBuild) {
  const icon = (item: GuideItem, cls: string) =>
    `<figure class="it${cls}"><img src="${escapeHtml(itemImage(item.key))}" alt=""><span>${minutes(item)}</span></figure>`;
  const rows = alt.swaps
    .slice(0, 4)
    .map((swap) => `<div class="swp">${icon(swap.from, ' was')}<i class="arr"></i>${icon(swap.to, '')}</div>`)
    .join('');
  return `<section class="sw"><h3>Вместо</h3><div class="swl">${rows}</div></section>`;
}

/** «Другие таланты»: the levels where the alternative picks the other side, the main pick struck through. */
function talentDiff(alt: GuideAltBuild) {
  const rows = [...(alt.talents ?? [])].sort((a, b) => a.level - b.level);
  if (rows.length === 0) return '';
  const body = rows
    .map(
      (row) =>
        `<div class="tb"><b>${row.level}</b><p>${escapeHtml(row.text)}</p><small>вместо <s>${escapeHtml(row.instead)}</s></small></div>`
    )
    .join('');
  return `<section class="dt"><h3>Другие таланты</h3><div class="list">${body}</div></section>`;
}

/** «Прокачка»: levels 1–10, the ones learnt differently from the main build outlined red; empty when all match. */
function skillDiff(guide: HeroGuideCard, alt: GuideAltBuild) {
  const skills = alt.skills?.slice(0, 10) ?? [];
  const differs = skills.map((skill, index) => skill !== (guide.skills[index] ?? null));
  if (!differs.includes(true)) return '';
  const cells = skills
    .map(
      (skill, index) =>
        `<div class="lv${differs[index] ? ' new' : ''}">${skillTile(guide, skill)}<span>${index + 1}</span></div>`
    )
    .join('');
  return `<section class="pk"><h3>Прокачка</h3><div class="row">${cells}</div></section>`;
}

/**
 * The second slide (owner, 27.10.2026: «нужно прописать её отличия»): only what differs from the main
 * build. With talents or skills the swaps run in one row and the blocks share the height; swaps alone get a wider
 * hero and a column of big rows, so a slide with one block still fills the frame.
 */
function diffSlide(guide: HeroGuideCard, alt: GuideAltBuild) {
  const rarerButBetter =
    guide.buildMatches !== undefined &&
    guide.buildWinRate !== undefined &&
    alt.winRate !== undefined &&
    alt.matches < guide.buildMatches &&
    alt.winRate > guide.buildWinRate;
  const talents = talentDiff(alt);
  const skills = skillDiff(guide, alt);
  const full = talents !== '' || skills !== '';
  const heroWidth = full ? 280 : 560;
  const left = 72 + heroWidth + 32;
  const width = 1464 - left;
  const shown = Math.max(1, Math.min(4, alt.swaps.length));
  // The alternative's icon width: a row of swaps shares the column (its dimmed icon is 0.75 of it, plus arrow and
  // gaps); a column of rows grows to 2× Valve's 88 px for one or two swaps. Never past 2×: the icon would go soft.
  const slot = (width - 48 * (shown - 1)) / shown;
  const size = full ? Math.min(150, Math.floor((slot - 80) / 1.75)) : shown >= 4 ? 120 : shown === 3 ? 150 : 176;
  const was = Math.round(size * (full ? 0.75 : 0.8));
  const vars = `left:${left}px;width:${width}px;--tw:${size}px;--th:${Math.round((size * 64) / 88)}px;--fw:${was}px;--fh:${Math.round((was * 64) / 88)}px`;
  return `${heroBox(guide, { width: heroWidth, height: 644, faceX: 0.5, faceY: 0.34, share: full ? 0.6 : 0.72 })}
<div class="z dif ${full ? 'full' : 'min'}" style="${vars}">${head(guide, { room: 554, max: 52 })}
<h2>Альтернатива: через ${escapeHtml(alt.keyItem)}</h2>${
    // Without its own win rate only the share speaks: the sample's few days are not the card's window.
    alt.winRate === undefined
      ? `<p class="stat"><span>Так собирают <b>${percent(alt.share)}</b> победителей</span></p>`
      : stat(
          `Винрейт сборки <b>${percent(alt.winRate)}</b>`,
          alt.matches,
          guide.altDays ?? guide.buildDays,
          '',
          rarerButBetter ? 'реже берут, но побед больше' : undefined
        )
  }${swapList(alt)}${talents}${skills}</div>`;
}

// Scale: type 64/52/34/22/20/18/16; gaps 4/8/12/16/24/32/64. Items at most 1.7× Valve's 88×64, abilities at most
// their 128², portraits at most their 256×144.
const BASE = `body{display:block;padding:0;background:#0c0d0f}body::before,body::after{content:none}
.main{position:absolute;inset:0;display:block;padding:0}.main::after{content:none}
.mark{top:28px;left:var(--m);color:#6b6f76;z-index:3}
.z{position:absolute}
.head{display:flex;align-items:center;gap:24px}
.title{margin:0;font-family:Tektur,sans-serif;font-weight:800;line-height:1;letter-spacing:-.01em;text-transform:none;
white-space:nowrap}.title::after{content:none}
.role{flex:none;padding:7px 14px;border:2px solid var(--red);border-radius:999px;font-weight:800;font-size:20px;
line-height:1;letter-spacing:.06em;text-transform:uppercase;color:#f1ebe0}
.stat{font-weight:600;font-size:22px;line-height:30px;color:#8a929e;white-space:nowrap;font-variant-numeric:tabular-nums}
.stat b{font-weight:800;color:#f1ebe0}.stat .note{display:block;font-weight:800;color:var(--red)}.box{position:absolute;overflow:hidden;border-radius:10px;border:1px solid rgba(255,255,255,.14);
background:radial-gradient(ellipse 60% 70% at 50% 30%,#232a33 0%,#14181e 75%)}.box .r{position:absolute;max-width:none}
h3{font-weight:800;font-size:20px;line-height:22px;color:#8a929e;white-space:nowrap}
.items{display:flex;gap:var(--ig)}
.it{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px}
.it img{display:block;width:var(--iw);height:var(--ih);border-radius:6px;border:1px solid rgba(255,255,255,.14);background:#14181e}
.it i{position:absolute;left:0;top:0;min-width:26px;height:26px;padding:0 6px;border-radius:6px 0 6px 0;background:#0c0d0f;
font:normal 800 18px/26px Manrope,sans-serif;text-align:center;font-variant-numeric:tabular-nums}
.it span{font-weight:600;font-size:18px;line-height:20px;height:20px;color:#8a929e;font-variant-numeric:tabular-nums;white-space:nowrap}
.dense .it span{font-size:15px;letter-spacing:-.02em}
.grp{display:flex;flex-direction:column;gap:12px}
.grp.rows .sec{display:grid;grid-template-columns:var(--lc) auto;align-items:start}
.grp.rows h3{display:flex;align-items:center;min-height:var(--ih);padding-right:12px;white-space:normal}.skills h3{margin-bottom:10px}.skills .row{display:flex;gap:var(--sg)}
.lv{display:flex;flex-direction:column;align-items:center;gap:6px}
.lv img,.lv b{display:block;width:var(--sw);height:var(--sw);border-radius:6px;border:1px solid rgba(255,255,255,.14)}
.lv b{border-color:rgba(255,255,255,.06);font:800 calc(var(--sw) * .4)/var(--sw) Tektur,sans-serif;color:#4e555e;text-align:center}
.lv span{font-weight:800;font-size:22px;line-height:22px;font-variant-numeric:tabular-nums}.lv .ult{color:var(--red)}
.spec svg{position:absolute;left:0;top:0;overflow:visible}
.spec .axis{stroke:rgba(255,255,255,.4);stroke-width:2}.spec .tick line{stroke:rgba(255,255,255,.4);stroke-width:2}
.spec .zero{stroke:rgba(255,255,255,.22);stroke-width:2;stroke-dasharray:4 5}
.spec .stem line{stroke:rgba(255,255,255,.32);stroke-width:2}
.spec h3{position:absolute;top:0}.spec .fear{left:0}.spec .prey{right:0}
.spec .zl{position:absolute;top:0;width:40px;margin-left:-20px;text-align:center;font-weight:800;font-size:18px;line-height:22px;color:#6b7178}
.spec .fc{position:absolute;display:block;border-radius:8px;border:1px solid rgba(255,255,255,.14);object-fit:cover}
.spec .d{position:absolute;font-weight:800;font-size:18px;line-height:20px;text-align:center;color:#f1ebe0;
font-variant-numeric:tabular-nums}.spec .d.neg{color:var(--red)}
.spec .end{position:absolute;font-weight:600;font-size:16px;line-height:20px;color:#6b7178;font-variant-numeric:tabular-nums}
.len h3{margin-bottom:12px}
.len .lr{display:grid;grid-template-columns:var(--ll,96px) 1fr 66px;align-items:center;gap:12px;height:24px}
.len .lr+.lr{margin-top:10px}
.len span{font-weight:600;font-size:18px;line-height:24px;color:#8a929e;white-space:nowrap}
.len .lt{position:relative;height:12px;border-radius:3px;background:#1d2229}
.len .lt i{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:#5b636e}
.len .lt::after{content:'';position:absolute;left:50%;top:-5px;bottom:-5px;width:2px;margin-left:-1px;background:#8a929e}
.len b{font-weight:800;font-size:20px;line-height:24px;text-align:right;font-variant-numeric:tabular-nums}
.len .hi i{background:var(--red)}
.tal h3{margin-bottom:12px}.tal .list{display:flex;flex-direction:column;gap:10px}
.tb{display:grid;grid-template-columns:40px 1fr;grid-template-areas:"lv p" "lv s" "lv e";column-gap:12px;align-items:start}
.tb>b{grid-area:lv}
.tb>b{display:flex;align-items:center;justify-content:center;height:30px;border-radius:6px;
background:#1d2229;font:800 17px/1 Manrope,sans-serif;color:#f1ebe0}
.tb p{grid-area:p;font-weight:800;font-size:20px;line-height:24px;color:#f1ebe0}
.tb small{grid-area:s;font-weight:600;font-size:16px;line-height:20px;color:#8a929e}
.tb em{grid-area:e;display:flex;font-style:normal;font-weight:600;font-size:16px;line-height:20px;color:var(--red)}
.tb em span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tb em i{flex:none;font-style:normal}
.tal .tb p.lg{font-size:17px;line-height:19px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.tal .list.tight{gap:6px}.rcol:has(.tight){gap:16px}`;

/** The card's page size; the «Чем отличается» slide uses the same. */
export const GUIDE_SIZE = { width: 1536, height: 768 } as const;

// «Чем отличается»: header, swaps, then talents and skills in a bottom band (see diffSlide).
const DIFF_CSS = `html,body{width:1536px;height:768px}:root{--m:72px;--sw:64px;--sg:8px}
.box{left:72px;top:64px}.dif{top:64px;height:644px;display:flex;flex-direction:column}.dif .head{position:static}
.dif h2{margin-top:20px;font-family:Tektur,sans-serif;font-weight:800;font-size:34px;line-height:40px;white-space:nowrap}
.dif .stat{margin-top:8px}.sw{margin-top:36px}.full .sw,.dt,.pk{margin-top:auto}.sw h3,.dt h3,.pk h3{margin-bottom:12px}
.swl{display:flex;gap:48px}.swp{display:flex;align-items:flex-start;gap:12px}
.swp .it img{width:var(--tw);height:var(--th)}.swp .it span{font-size:20px;line-height:22px;height:22px}
.swp .was{margin-top:calc((var(--th) - var(--fh)) / 2)}
.swp .was img{width:var(--fw);height:var(--fh);opacity:.6;filter:grayscale(.5)}.swp .was span{color:#6b7178}
.arr{position:relative;flex:none;width:44px;height:2px;margin:calc(var(--th) / 2 - 1px) 10px 0 0;background:#8a929e}
.arr::after{content:'';position:absolute;right:-10px;top:-7px;border:8px solid transparent;border-right:0;
border-left:12px solid #8a929e}
.min .sw{flex:1;display:flex;flex-direction:column;justify-content:center;margin-top:24px}
.min .swl{flex-direction:column;gap:24px}.min .swp{align-items:center;gap:16px}
.min .swp .it{flex-direction:row;align-items:center;gap:14px}.min .swp .was{margin-top:0}
.min .swp .it span{min-width:76px;font-size:22px;line-height:24px;height:24px}.min .arr{width:64px;margin:0 14px 0 0}
.dt .list{display:flex;gap:16px 48px;flex-wrap:wrap}.dt .tb{row-gap:2px}.dt .tb p{font-size:22px;line-height:26px}
.dt small{font-weight:600;font-size:18px;line-height:22px;color:#8a929e}.dt s{color:#6b7178}
.pk .row{display:flex;gap:var(--sg)}.pk .lv{opacity:.4}.pk .lv span{font-size:20px;line-height:20px}
.pk .lv.new{opacity:1}.pk .new img,.pk .new b{border:2px solid var(--red)}.pk .new span{color:var(--red)}`;

// The hero tall on the left, the item rows beside it, talents and the game-length bars in the right column; the skill
// row and the matchup spectrum share the bottom band.
const CARD_CSS = `html,body{width:1536px;height:768px}:root{--m:72px;--iw:88px;--ih:64px;--ig:8px;--sw:60px;--sg:8px;--lc:150px}
.box{left:72px;top:64px}.head{left:384px;top:64px}.stat{left:384px;top:128px}.grp{left:384px;top:180px}
.rcol{left:1134px;top:64px;width:330px;display:flex;flex-direction:column;gap:32px}
.skills{left:72px;bottom:40px}.spec{left:784px;bottom:40px}.grp{gap:16px}`;

/**
 * The guide card: the page and the size to shoot it at. A block without data is left out and the rest closes up: no
 * build line lifts the item rows; without the skill row, or with it moved aside, the hero runs the card's full height;
 * without matchups the skill row moves under the items.
 */
export function guidePicture(guide: HeroGuideCard): { html: string; width: number; height: number } {
  const hasStat = guide.buildWinRate !== undefined && guide.buildMatches !== undefined;
  const hasSpectrum = guide.matchups.length > 0;
  const hasSkills = guide.skills.length > 0 && guide.abilities.length > 0;
  const tall = !hasSkills || !hasSpectrum;
  const stats =
    guide.buildWinRate === undefined || guide.buildMatches === undefined
      ? ''
      : stat(
          `${guide.buildRateOfRole === true ? 'Винрейт на позиции' : 'Винрейт сборки'} <b>${percent(guide.buildWinRate)}</b>`,
          guide.buildMatches,
          guide.buildDays,
          'z'
        );
  const body = `${heroBox(guide, { width: 280, height: tall ? 664 : 512, faceX: 0.5, faceY: tall ? 0.34 : 0.38, share: tall ? 0.72 : 0.65 })}${head(guide, { room: 554, max: 52 })}
${stats}${groups(guide)}
<div class="z rcol">${talentBlock(guide)}${lengthBars(guide)}</div>${hasSkills ? skillRow(guide) : ''}
${hasSpectrum ? spectrum(guide, { width: 680, face: 84 }) : ''}`;
  const closeUp = `${hasStat ? '' : '.grp{top:128px}'}${hasSkills && !hasSpectrum ? '.skills{left:384px}' : ''}`;
  return { html: picturePage(body, BASE + CARD_CSS + closeUp), ...GUIDE_SIZE };
}

// «Предметы» (owner, 27.10.2026: «первая картинка как основа … а дальше уже подробно»): the whole core line with its
// minutes, the situational items with how often they are bought, and Dota2ProTracker's «Поздняя игра» — what matches of
// each length ended with.
const ITEMS_CSS = `html,body{width:1536px;height:768px}:root{--m:72px;--iw:80px;--ih:58px;--ig:8px;--lc:150px}
.box{left:72px;top:64px}.its{left:384px;top:64px;width:1080px;height:644px;display:flex;flex-direction:column}
.its .head{position:static}.its h2{margin-top:16px;font-family:Tektur,sans-serif;font-weight:800;font-size:34px;line-height:40px}
.its .grp{position:static;margin-top:28px}.its .items{gap:20px}.its .it span{font-size:16px;line-height:18px;height:18px}
.late{margin-top:auto}.late>h3{margin-bottom:12px}.lw{display:flex;gap:32px}
.lc{width:328px;padding:14px 16px 16px;border-radius:10px;background:#14181e;border:1px solid rgba(255,255,255,.08)}
.lc header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}
.lc b{font-family:Tektur,sans-serif;font-weight:800;font-size:22px;line-height:24px;color:#f1ebe0}
.lc small{font-weight:600;font-size:16px;line-height:20px;color:#8a929e}
.lc .grid{display:grid;grid-template-columns:repeat(3,var(--iw));gap:8px;justify-content:space-between}
.lc .grid img{display:block;width:var(--iw);height:var(--ih);border-radius:6px;border:1px solid rgba(255,255,255,.14);background:#14181e}`;

/** Icons with a line under each: the minute, and how often players buy it when \`withShare\`. */
function timedItems(list: GuideItem[], withShare: boolean, max: number) {
  return `<div class="items">${list
    .slice(0, max)
    .map((item) => {
      const parts = [
        item.minute === undefined ? '' : `${Math.round(item.minute)} мин`,
        withShare && item.share !== undefined ? pct(item.share) : ''
      ].filter((part) => part !== '');
      return `<figure class="it"><img src="${escapeHtml(itemImage(item.key))}" alt=""><span>${parts.join(' · ')}</span></figure>`;
    })
    .join('')}</div>`;
}

const lateLabel = (late: GuideLate) => (late.to === null ? `${late.from}+ мин` : `${late.from}–${late.to} мин`);

function lateBlock(guide: HeroGuideCard) {
  const windows = guide.late ?? [];
  if (windows.length === 0) return '';
  return `<section class="late"><h3>Поздняя игра: чем заканчивают</h3><div class="lw">${windows
    .map(
      (late) =>
        `<div class="lc"><header><b>${lateLabel(late)}</b><small>${count(late.matches)} ${plural(late.matches, MATCHES)}</small></header><div class="grid">${late.items
          .slice(0, 6)
          .map((item) => `<img src="${escapeHtml(itemImage(item.key))}" alt="">`)
          .join('')}</div></div>`
    )
    .join('')}</div></section>`;
}

/** The «Предметы» slide: every item block in detail; null without a core. */
export function guideItemsPicture(guide: HeroGuideCard): { html: string; width: number; height: number } | null {
  if (guide.core.length === 0) return null;
  const rows: [string, string][] = [
    ['Стартовый закуп', guide.start.length === 0 ? '' : timedItems(guide.start, false, 7)],
    ['Основа', timedItems(guide.core, false, CORE_MAX)],
    ['По ситуации', guide.situational.length === 0 ? '' : timedItems(guide.situational, true, 8)]
  ];
  const body = `${heroBox(guide, { width: 280, height: 644, faceX: 0.5, faceY: 0.34, share: 0.72 })}
<div class="z its">${head(guide, { room: 700, max: 52 })}<h2>Предметы по минутам</h2><div class="grp rows">${rows
    .filter(([, html]) => html !== '')
    .map(([label, html]) => section(label, html))
    .join('')}</div>${lateBlock(guide)}</div>`;
  return { html: picturePage(body, BASE + ITEMS_CSS), ...GUIDE_SIZE };
}

// The alternative as a whole build (owner, 27.10.2026: «альтернатива как-то слабо, когда один предмет меняется … там
// другие таланты, нейтралки, обычные предметы, старт»): the card's layout with the build's own start, core, neutrals,
// talents and skill order; what differs from the main build is outlined in red, the swaps sum it up at the bottom.
const ALT_CSS = `html,body{width:1536px;height:768px}:root{--m:72px;--iw:88px;--ih:64px;--ig:8px;--sw:60px;--sg:8px;--lc:150px;--tw:88px;--th:64px;--fw:66px;--fh:48px}
.box{left:72px;top:64px}.head{left:384px;top:64px}.alt-h{left:384px;top:126px;margin:0;font-family:Tektur,sans-serif;font-weight:800;
font-size:30px;line-height:36px;white-space:nowrap}.stat{left:384px;top:168px}.grp{left:384px;top:220px;gap:16px}
.rcol{left:1134px;top:64px;width:330px;display:flex;flex-direction:column;gap:32px}
.skills{left:72px;bottom:40px}.skills .lv.new img,.skills .lv.new b{border:2px solid var(--red)}.skills .lv.new span{color:var(--red)}
.it.new img{border:2px solid var(--red)}
.sw{position:absolute;left:784px;bottom:40px}.sw h3{margin-bottom:12px}.swl{display:flex;gap:32px}
.swp{display:flex;align-items:flex-start;gap:10px}.swp .it span{font-size:18px}
.swp .was{margin-top:calc((var(--th) - var(--fh)) / 2)}.swp .was img{width:var(--fw);height:var(--fh);opacity:.6;filter:grayscale(.5)}
.arr{position:relative;flex:none;width:32px;height:2px;margin:calc(var(--th) / 2 - 1px) 10px 0 0;background:#8a929e}
.arr::after{content:'';position:absolute;right:-10px;top:-7px;border:8px solid transparent;border-right:0;border-left:12px solid #8a929e}
.tb.new>b{background:var(--red)}.tb s{color:#6b7178}`;

/** Icons with the minute under each when \`timed\`; one the main build lacks (\`main\` keys) is outlined in red. */
function markedItems(list: GuideItem[], main: GuideItem[], timed: boolean, max: number) {
  const known = new Set(main.map((item) => item.key));
  const shown = list.slice(0, max);
  const width = Math.min(88, Math.floor((6 * 88 + 5 * 8 - 8 * (shown.length - 1)) / shown.length));
  const size = width === 88 ? '' : ` dense" style="--iw:${width}px;--ih:${Math.round((width * 64) / 88)}px`;
  return `<div class="items${size}">${shown
    .map(
      (item) =>
        `<figure class="it${known.has(item.key) ? '' : ' new'}"><img src="${escapeHtml(itemImage(item.key))}" alt="">${
          timed ? `<span>${item.minute === undefined ? '' : `${Math.round(item.minute)} мин`}</span>` : ''
        }</figure>`
    )
    .join('')}</div>`;
}

function altPicks(alt: GuideAltBuild) {
  const picks = [...(alt.picks ?? [])].sort((a, b) => b.level - a.level);
  if (picks.length === 0) return '';
  return `<div class="tal"><h3>Таланты</h3><div class="list">${picks
    .map(
      (pick) =>
        `<div class="tb${pick.instead === undefined ? '' : ' new'}"><b>${pick.level}</b><p${pick.text.length > TALENT_ONE_LINE ? ' class="lg"' : ''}>${escapeHtml(pick.text)}</p>${
          pick.instead === undefined
            ? '<small>как в основной</small>'
            : `<small>вместо <s>${escapeHtml(pick.instead)}</s></small>`
        }</div>`
    )
    .join('')}</div></div>`;
}

function altSkills(guide: HeroGuideCard, alt: GuideAltBuild) {
  const skills = (alt.skills ?? guide.skills).slice(0, 10);
  if (skills.length === 0 || guide.abilities.length === 0) return '';
  const cells = skills
    .map(
      (skill, index) =>
        `<div class="lv${skill !== (guide.skills[index] ?? null) ? ' new' : ''}">${skillTile(guide, skill)}<span>${index + 1}</span></div>`
    )
    .join('');
  return `<div class="z skills"><h3>Как качать</h3><div class="row">${cells}</div></div>`;
}

function altSwaps(alt: GuideAltBuild) {
  if (alt.swaps.length === 0) return '';
  return `<section class="sw"><h3>Главное отличие</h3><div class="swl">${alt.swaps
    .slice(0, 3)
    .map(
      (swap) =>
        `<div class="swp"><figure class="it was"><img src="${escapeHtml(itemImage(swap.from.key))}" alt=""></figure><i class="arr"></i><figure class="it"><img src="${escapeHtml(itemImage(swap.to.key))}" alt=""><span>${minutes(swap.to)}</span></figure></div>`
    )
    .join('')}</div></section>`;
}

function altFullSlide(guide: HeroGuideCard, alt: GuideAltBuild & { core: GuideItem[] }) {
  const line =
    alt.winRate === undefined
      ? `<p class="z stat"><span>Так собирают <b>${percent(alt.share)}</b> победителей</span></p>`
      : stat(`Винрейт сборки <b>${percent(alt.winRate)}</b>`, alt.matches, guide.altDays ?? guide.buildDays, 'z');
  const rows: [string, string][] = [
    ['Стартовый закуп', alt.start === undefined ? '' : markedItems(alt.start, guide.start, false, 6)],
    ['Основа', markedItems(alt.core, guide.core, true, 9)],
    ['Нейтралки', alt.neutrals === undefined ? '' : markedItems(alt.neutrals, guide.neutrals, false, 5)]
  ];
  const hasSkills = guide.abilities.length > 0 && (alt.skills ?? guide.skills).length > 0;
  return `${heroBox(guide, { width: 280, height: hasSkills ? 512 : 664, faceX: 0.5, faceY: 0.38, share: 0.65 })}${head(guide, { room: 554, max: 52 })}
<h2 class="z alt-h">Альтернатива: через ${escapeHtml(alt.keyItem)}</h2>${line}
<div class="z grp rows">${rows
    .filter(([, html]) => html !== '')
    .map(([label, html]) => section(label, html))
    .join(
      ''
    )}</div><div class="z rcol">${altPicks(alt)}</div>${hasSkills ? altSkills(guide, alt) : ''}${altSwaps(alt)}`;
}

/** The «Чем отличается» slide, or null when the guide has no alternative build. */
export function guideAltPicture(guide: HeroGuideCard): { html: string; width: number; height: number } | null {
  const alt = guide.alt;
  if (alt === undefined) return null;
  // A build counted from its own matches is drawn whole; one with swaps only keeps the short slide.
  if (alt.core !== undefined && alt.core.length > 0)
    return { html: picturePage(altFullSlide(guide, { ...alt, core: alt.core }), BASE + ALT_CSS), ...GUIDE_SIZE };
  return { html: picturePage(diffSlide(guide, alt), BASE + DIFF_CSS), ...GUIDE_SIZE };
}
