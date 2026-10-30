import { abilityImage, escapeHtml, heroImage, heroPortraitImage, PICTURE_SIZE, picturePage } from './picture';
import { seriouslyPicture } from './seriously-pictures';
import { VALVE_TIME_LOOKS, valveTimePicture } from './valve-time-pictures';
import {
  type HeroInfo,
  noData,
  pick,
  plural,
  poll,
  quiz,
  type RubricContext,
  type RubricSample,
  DONT_BOTHER_JOKES,
  withJoke
} from './types';

// Rubrics over Valve's latest patch notes (Russian datafeed). A note «X увеличен с 60 до 65» is read as a buff or a
// nerf by the stat's name: for a cooldown, a cost or a cast time less is better, for the rest more is better.

const CHANGE =
  /^(.+?)\s+(увеличен[аоы]?|повышен[аоы]?|уменьшен[аоы]?|снижен[аоы]?|понижен[аоы]?)\s+с\s+([\d.,/%\s]+?)\s+до\s+([\d.,/%\s]+?)\.?$/iu;
// «Расход маны» too (26.10.2026: Power Cogs' mana cost 75 → 90 passed for a buff).
const LESS_IS_BETTER =
  /перезарядк|затрат|стоимост|расход|время применения|время каста|время возрождения|задержк|урон по себе/iu;

interface Change {
  heroId: number;
  abilityId: number | null;
  stat: string;
  from: string;
  to: string;
  buff: boolean;
  /** |to − from| / from of the first number: how big the change is. */
  size: number;
  note: string;
}

const firstNumber = (value: string) => Number.parseFloat(value.replace(',', '.').split('/')[0] ?? '');

function readChange(heroId: number, abilityId: number | null, note: string): Change | null {
  const match = CHANGE.exec(note.trim());
  if (match === null) return null;
  const [, stat = '', verb = '', from = '', to = ''] = match;
  const before = firstNumber(from);
  const after = firstNumber(to);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === after) return null;
  const more = /увеличен|повышен/iu.test(verb);
  return {
    heroId,
    abilityId,
    stat: stat.trim(),
    from: from.trim(),
    to: to.trim(),
    buff: LESS_IS_BETTER.test(stat) ? !more : more,
    size: before === 0 ? 1 : Math.abs(after - before) / Math.abs(before),
    note: note.trim()
  };
}

async function latestPatch(context: RubricContext) {
  const patches = await context.sources.patches();
  const latest = [...patches].sort((a, b) => b.timestamp - a.timestamp)[0];
  if (latest === undefined) throw noData('patch list');
  const [notes, heroes] = await Promise.all([context.sources.patchNotes(latest.version), context.sources.heroes()]);
  const byId = new Map(heroes.map((hero) => [hero.id, hero]));
  const changes = notes.heroes.flatMap((hero) =>
    hero.notes
      .map((note) => readChange(hero.heroId, note.abilityId, note.note))
      .filter((each): each is Change => each !== null)
  );
  // Each changed hero with its notes count and the balance of buffs and nerfs.
  const scored = notes.heroes
    .map((hero) => {
      const own = changes.filter((change) => change.heroId === hero.heroId);
      const balance = own.reduce((sum, change) => sum + (change.buff ? 1 : -1), 0);
      return { hero: byId.get(hero.heroId), notes: hero.notes.length, balance };
    })
    .filter((each): each is { hero: HeroInfo; notes: number; balance: number } => each.hero !== undefined)
    .sort((a, b) => b.notes - a.notes);
  return { version: latest.version, timestamp: latest.timestamp, notes, changes, scored, byId };
}

export type PatchOutcome = 'nerfed' | 'buffed' | 'changed' | 'untouched';

/**
 * What the latest patch did to each hero, «Кого понерфят?»'s answer: the sums of its buffs and nerfs in % decide, as in
 * «Кто теперь имба?»; notes with no number read (a rework) are «changed».
 */
export async function patchOutcomes(
  context: RubricContext,
  heroIds: number[]
): Promise<{ version: string; outcomes: Map<number, PatchOutcome> }> {
  const patch = await latestPatch(context);
  const sum = (heroId: number, buff: boolean) =>
    patch.changes
      .filter((change) => change.heroId === heroId && change.buff === buff)
      .reduce((total, change) => total + change.size, 0);
  const touched = new Set(patch.scored.map((each) => each.hero.id));
  const outcome = (heroId: number): PatchOutcome => {
    if (!touched.has(heroId)) return 'untouched';
    const net = sum(heroId, true) - sum(heroId, false);
    return net < 0 ? 'nerfed' : net > 0 ? 'buffed' : 'changed';
  };
  return { version: patch.version, outcomes: new Map(heroIds.map((heroId) => [heroId, outcome(heroId)])) };
}

// «Кого понерфили» as a patch-notes poster (owner chose it 26.10.2026 from three looks): a huge condensed title stacked
// on the left, the patch number as outlined numerals under it, the faces as a mosaic on the right. The rubric's own CSS
// replaces the shared page's look: no diagonal stripes, red glow, rounded plate or soft shadows.

/** A Google Font stylesheet in the page body (the shared head loads Manrope and Unbounded only). */
const googleFont = (family: string) =>
  `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${family}&amp;display=block">`;

// Tiles keep the portrait's 16:9 (owner: «картинки как будто порезанные»): two columns, an odd last face centred, so
// 3, 4 and 5 heroes (the rubric's range) all fill the right side. Cards: a 10 px radius and a thin light border (owner
// chose it 26.10.2026 from five card styles).
const BROKEN_CSS = `body{display:block;padding:0;background:#0a0a0b}body::before,body::after{content:none}
.main{position:absolute;inset:0;display:block;padding:0}.main::after{content:none}
.mark{top:44px;left:64px;color:#6b6f76}
.title{position:absolute;margin:0;left:58px;top:82px;font-family:Tektur,sans-serif;font-weight:800;font-size:150px;
line-height:.86;letter-spacing:0;text-transform:uppercase}.title::after{content:none}
.title b{display:block;font-size:84px;line-height:1.1}
.plate{position:absolute;left:64px;right:auto;top:auto;bottom:52px;display:block;gap:0;border:0;border-radius:0;
background:none;padding:0;font-family:Oswald,sans-serif;font-weight:500;font-size:136px;line-height:.9;color:transparent;
-webkit-text-stroke:3px #f1ebe0}
.plate small{display:block;margin-bottom:12px;font-family:Manrope,sans-serif;font-weight:800;font-size:18px;
letter-spacing:8px;color:#d63a22;-webkit-text-stroke:0}
.heroes{position:absolute;right:0;top:0;bottom:0;width:836px;display:grid;grid-template-columns:repeat(2,411px);
grid-auto-rows:231px;align-content:center;gap:14px}
.tile{position:relative;overflow:hidden;background:#1d2229;border-radius:10px;border:1px solid rgba(255,255,255,.14)}
.tile:last-child:nth-child(odd){grid-column:1 / -1;justify-self:center;width:411px}
.face{display:block;width:100%;height:100%;object-fit:cover}.cut .face{object-position:50% 25%}`;

export async function patchBroken(context: RubricContext): Promise<RubricSample> {
  const patch = await latestPatch(context);
  // «Кого понерфили» (owner, 26.10.2026): heroes weakened on balance, the most nerfs first.
  const nerfs = (heroId: number) => patch.changes.filter((one) => one.heroId === heroId && !one.buff);
  const top = patch.scored
    .filter((each) => each.balance < 0)
    .sort((a, b) => nerfs(b.hero.id).length - nerfs(a.hero.id).length)
    .slice(0, 5);
  if (top.length < 3) throw noData('nerfed heroes');
  // Each hero's biggest nerf by size, «было → стало» (owner, 25.10.2026: «непонятно, насколько их понизили»).
  const details = await Promise.all(top.map((each) => context.sources.heroDetail(each.hero.id).catch(() => null)));
  const biggest = top.map((each, index) => {
    const change = nerfs(each.hero.id).sort((a, b) => b.size - a.size)[0];
    if (change === undefined) return null;
    const ability = details[index]?.abilities.find((one) => one.id === change.abilityId)?.name ?? null;
    return { ...change, what: ability === null ? change.stat : `${ability}: ${change.stat.toLowerCase()}` };
  });
  // Portraits only (owner, 26.10.2026): players know heroes by face, and the post's lines carry «было → стало».
  // Every hero keeps a background, one of two looks at random («1 раз так, другой так»): Valve's portrait with its
  // painted background, or the large cut-out crop on a dark backdrop.
  const painted = context.random() < 0.5;
  const faces = top
    .map(
      (each) =>
        `<div class="tile"><img class="face" src="${painted ? heroPortraitImage(each.hero.name) : heroImage(each.hero.name)}" alt=""></div>`
    )
    .join('');
  const html = picturePage(
    `${googleFont('Oswald:wght@500;700')}<div class="title">Кого <b>понерфили</b></div>
<div class="heroes${painted ? '' : ' cut'}">${faces}</div>
<div class="plate"><small>ПАТЧ</small>${escapeHtml(patch.version)}</div>`,
    BROKEN_CSS
  );
  const lines = [`Патч ${patch.version}: этих героев ослабили сильнее всех.`];
  // One line per hero, its biggest nerf: the post shows how much, not only who.
  top.forEach((each, index) => {
    const change = biggest[index];
    if (change !== null && change !== undefined)
      lines.push(`${each.hero.localizedName} — ${change.what}: ${change.from} → ${change.to}`);
  });
  lines.push('Играете на ком-то из них? Кого порезали сильнее всех — пишите в комментарии.');
  return { picture: { html, ...PICTURE_SIZE }, text: lines.join('\n'), poll: null };
}

// «Кто теперь имба?» is 01's pair (buffs instead of nerfs) but must not look like it (owner, 26.10.2026: «дизайн все же
// отличался между рубриками»). Two looks, switched here: 'A' — the heroes are too big for their cards, Valve's full
// renders break out above a row of tall cards under a wide Unbounded title; 'B' — a measuring plate, each portrait raised
// over a ruled scale by its biggest buff, in % of the old value (a cooldown cut counts too) (owner: «не понятно, что за правок»; in a small patch
// every hero has one buff, so a count would stand them all level), an accent Tektur title only (owner, 26.10.2026), the labels and figures in the page's plain Manrope.
const IMBA_LOOK: 'A' | 'B' = 'B';

/** Valve's 1440² cut-out render: sharp even at full card height, unlike the 400×250 crop. */
const heroRender = (heroName: string) => {
  const key = heroName.replace(/^npc_dota_hero_/, '');
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/${/^[a-z0-9_]{1,80}$/.test(key) ? key : 'default'}.png`;
};

// A: cards share one row (grid columns by count, so 2…6 heroes fill the width); the render's clip is open at the top,
// so heads rise over the card's edge, and the card bottom crops the legs. 01's frame: 10 px radius, 1 px light border.
const IMBA_A_CSS = `body{display:block;padding:0;background:#0b0c0e}body::before,body::after{content:none}
.main{position:absolute;inset:0;display:block;padding:0}.main::after{content:none}
.mark{top:44px;left:72px;color:#6b6f76}
.title{position:absolute;margin:0;left:72px;top:82px;font-family:Unbounded,sans-serif;font-weight:900;font-size:64px;
line-height:1;letter-spacing:-.01em}.title::after{content:none}
.plate{position:absolute;top:44px;right:72px;display:block;border:0;border-radius:0;background:none;padding:0;
text-align:right;font-family:Unbounded,sans-serif;font-weight:700;font-size:48px;line-height:1;color:#f1ebe0}
.plate small{display:block;margin-bottom:14px;font-family:Manrope,sans-serif;font-weight:800;font-size:18px;
letter-spacing:8px;color:#d63a22}
.heroes{position:absolute;left:72px;right:72px;top:176px;bottom:56px;display:grid;grid-auto-flow:column;
grid-auto-columns:1fr;gap:14px}
.tile{position:relative;container-type:size}
.card{position:absolute;left:0;right:0;bottom:0;top:136px;border-radius:10px;border:1px solid rgba(255,255,255,.14);
background:linear-gradient(#1d232b,#13171d)}
.fig{position:absolute;inset:0;clip-path:inset(0 1px 1px 1px round 0 0 9px 9px)}
.fig img{position:absolute;left:50%;top:0;height:max(132cqh,118cqw);transform:translateX(-50%)}`;

// B: a ruled plate; one rule per tenth of the top hero's growth, every fifth stronger, so a portrait's height over the base line can be counted.
// The heroes stand from the smallest buff to the biggest, left to right: the row climbs.
const IMBA_B_CSS = `body{display:block;padding:0;background:#0d0d0e}body::before,body::after{content:none}
.main{position:absolute;inset:0;display:block;padding:0}.main::after{content:none}
.mark{top:44px;left:72px;color:#6b6f76}
.title{position:absolute;margin:0;left:68px;top:84px;font-family:Tektur,sans-serif;font-weight:800;font-style:normal;
font-size:96px;line-height:1;letter-spacing:-.01em;text-transform:none}.title::after{content:none}
.plate{position:absolute;left:72px;right:auto;top:212px;display:block;border:0;border-radius:0;background:none;padding:0;
font-family:Manrope,sans-serif;font-weight:600;font-size:26px;color:#8a929e}
.scale{position:absolute;left:72px;right:72px;bottom:96px;height:calc(var(--max) * var(--unit));
background:repeating-linear-gradient(to top,rgba(255,255,255,.2) 0 1px,transparent 1px calc(var(--unit) * 5)),
repeating-linear-gradient(to top,rgba(255,255,255,.09) 0 1px,transparent 1px var(--unit))}
.base{position:absolute;left:72px;right:72px;bottom:95px;height:2px;background:#f1ebe0}
.heroes{position:absolute;left:72px;right:72px;bottom:96px;height:600px;display:grid;grid-auto-flow:column;
grid-auto-columns:1fr;gap:24px;align-items:end}
.tile{position:relative;display:flex;flex-direction:column;align-items:center;height:calc(var(--n) * var(--unit))}
.tile::after{content:'';position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;background:#f1ebe0}
.face{position:absolute;bottom:100%;width:min(100%,360px);aspect-ratio:16/9;object-fit:cover;border-radius:10px;
border:1px solid rgba(255,255,255,.14);background:#1d2229}
.num{position:absolute;top:calc(100% + 16px);font-family:Manrope,sans-serif;font-weight:800;font-size:28px;
font-variant-numeric:tabular-nums;color:#f1ebe0}`;

function imbaPicture(version: string, heroes: { hero: HeroInfo; percent: number }[]): string {
  if (IMBA_LOOK === 'A') {
    const tiles = heroes
      .map(
        (each) =>
          `<div class="tile"><div class="card"></div><div class="fig"><img src="${heroRender(each.hero.name)}" alt=""></div></div>`
      )
      .join('');
    return picturePage(
      `<div class="title">Кто теперь <b>имба?</b></div>
<div class="heroes">${tiles}</div>
<div class="plate"><small>ПАТЧ</small>${escapeHtml(version)}</div>`,
      IMBA_A_CSS
    );
  }
  const climbing = [...heroes].sort((a, b) => a.percent - b.percent);
  // Ten rules for the tallest; the others stand in proportion (at least one rule, so no portrait sits on the line).
  const top = Math.max(...climbing.map((each) => each.percent));
  const steps = (percent: number) => Math.max(1, Math.round((percent / top) * 10));
  const max = 10;
  const tiles = climbing
    .map(
      (each) =>
        `<div class="tile" style="--n:${steps(each.percent)}"><img class="face" src="${heroPortraitImage(each.hero.name)}" alt=""><div class="num">на ${each.percent}%</div></div>`
    )
    .join('');
  return picturePage(
    `${googleFont('Tektur:wght@800')}
<div class="title">Кто теперь <b>имба?</b></div>
<div class="plate">Самое крупное усиление каждого героя в патче ${escapeHtml(version)}</div>
<div class="scale" style="--max:${max};--unit:${Math.floor(260 / max)}px"></div>
<div class="heroes" style="--unit:${Math.floor(260 / max)}px">${tiles}</div><div class="base"></div>`,
    IMBA_B_CSS
  );
}

/** Six portraits still read on a phone in one row; more would shrink every face. */
const IMBA_HEROES_MAX = 6;

export async function whoIsImba(context: RubricContext): Promise<RubricSample> {
  const patch = await latestPatch(context);
  // Heroes who came out stronger than they were (owner, 26.10.2026: «кто стал сильнее, чем был — это важно»): the sum of
  // their buffs in % beats the sum of their nerfs, so a small nerf beside a huge buff still counts («убрать силу, но очень
  // усилить ульту»). The strongest total first.
  const own = (heroId: number) => patch.changes.filter((change) => change.heroId === heroId);
  const sum = (changes: Change[]) => changes.reduce((total, change) => total + change.size, 0);
  const biggestOf = (changes: Change[]) => [...changes].sort((a, b) => b.size - a.size)[0];
  const ranked = patch.scored
    .map((each) => {
      const changes = own(each.hero.id);
      const buffs = changes.filter((change) => change.buff);
      const nerfs = changes.filter((change) => !change.buff);
      const biggest = biggestOf(buffs);
      // The picture's scale: the hero's biggest buff in % of the old value.
      return {
        hero: each.hero,
        net: sum(buffs) - sum(nerfs),
        biggest,
        nerf: biggestOf(nerfs),
        percent: Math.round(100 * (biggest?.size ?? 0))
      };
    })
    .filter((each) => each.net > 0 && each.biggest !== undefined)
    .sort((a, b) => b.net - a.net);
  // As many heroes as really came out stronger (owner, 26.10.2026: «важно, сколько героев реально усилили»), six at
  // most: the picture holds no more.
  const top = ranked.slice(0, IMBA_HEROES_MAX);
  if (top.length < 2) throw noData('heroes who came out stronger');
  // In words, no «было → стало» table (owner, 26.10.2026: «хватит таблиц, тут просто словами»): no arrow, so the rich
  // message makes no table of it; the AI writer retells it in the channel's voice. A nerf beside the buff is said too.
  const details = await Promise.all(top.map((each) => context.sources.heroDetail(each.hero.id).catch(() => null)));
  const said = (change: Change, index: number) => {
    const ability = details[index]?.abilities.find((one) => one.id === change.abilityId)?.name;
    const what = ability === undefined ? change.stat : `${ability}, ${change.stat.toLowerCase()}`;
    return `${what} — было ${change.from}, стало ${change.to}`;
  };
  const lines = top.flatMap((each, index) =>
    each.biggest === undefined
      ? []
      : [
          `${each.hero.localizedName}: ${said(each.biggest, index)}${each.nerf === undefined ? '' : `; зато порезали: ${said(each.nerf, index)}`}`
        ]
  );
  return {
    picture: { html: imbaPicture(patch.version, top), ...PICTURE_SIZE },
    // A plain opening, no count of the rest (owner, 26.10.2026: «просто: после 7.41f этих героев больше всего усилили»).
    text: [`После патча ${patch.version} сильнее всех усилили этих героев:`, ...lines].join('\n'),
    poll: poll(
      `Кто имба после ${patch.version}?`,
      withJoke(
        top.map((each) => each.hero.localizedName),
        context.random
      )
    )
  };
}

// «Нерф или баф?» is one poll whose picture carries everything (owner, 26.10.2026): the hero, each change «было → стало»
// with the ability's name and icon, the patch and the title. The lines stay neutral: no red or green, no ▲/▼; the old
// value is muted only because it is the past. Two looks the owner chose of five (26.10.2026), alternating at random from
// post to post, each unlike 01's poster and 02's measuring plate: 'A' a hero panel on the left and a ruled list; 'C' a
// wide close-up band over the lines. Valve's 1440² render keeps the large hero sharp.
const NERF_LOOKS = ['A', 'C'] as const;
type NerfLook = (typeof NERF_LOOKS)[number];

interface NerfRow {
  /** Valve's ability key for its icon; null for a base stat. */
  icon: string | null;
  ability: string | null;
  stat: string;
  from: string;
  to: string;
}

/**
 * One way to lay a look out: `size` is the hero panel's width (C: the band's height), `width` one column of lines,
 * `height` the list's room, `pad` the least room a line takes beyond its text. Per-level values («70/140/210/280») can
 * be wider than a line, so after the frames with a large hero each look offers a roomier one with a narrow hero: rare
 * (eight changes come only in big patches) but never cut.
 */
interface NerfFrame {
  size: number;
  cols: number;
  width: number;
  height: number;
  pad: number;
}

const nerfFrame = (size: number, cols: number, width: number, height: number, pad: number): NerfFrame => ({
  size,
  cols,
  width,
  height,
  pad
});

const NERF_FRAMES: Record<NerfLook, (count: number) => NerfFrame[]> = {
  A: () =>
    [
      [560, 1],
      [560, 2],
      [400, 1],
      [280, 1]
    ].map(([size = 0, cols = 1]) =>
      nerfFrame(size, cols, (1536 - size - 136 - 48 * (cols - 1)) / cols, 468, size === 280 ? 12 : 20)
    ),
  C: () =>
    [
      [380, 1],
      [340, 1],
      [320, 1],
      [320, 2],
      [280, 2]
    ].map(([size = 0, cols = 1]) => nerfFrame(size, cols, (1392 - 64 * (cols - 1)) / cols, 768 - size - 72, 16))
};

const nerfLabel = (row: NerfRow) => (row.ability === null ? row.stat : `${row.ability}: ${row.stat}`);

/**
 * The largest type at which every line fits its frame, from Manrope's glyph widths (≈ 0.56 em a letter, 0.6 em a
 * figure): a label may wrap to two lines; each value stays on one line.
 */
function nerfFit(rows: NerfRow[], frame: NerfFrame, trap: boolean) {
  const icons = rows.some((row) => row.icon !== null);
  const perCol = Math.ceil(rows.length / frame.cols);
  let last = { scale: 0, label: 26, num: 28, icon: icons ? 40 : 0, stack: true };
  for (let scale = 1; scale >= 0.25; scale -= 0.03) {
    const size = Math.max(26, Math.round(46 * scale));
    const icon = trap ? 160 : icons ? Math.min(80, Math.max(40, Math.round(size * 1.6))) : 0;
    const text = frame.width - (icon === 0 ? 0 : icon + 24);
    // Values beside the label, or under it when they don't fit: then a line of their own, as large as the widest pair
    // lets them, up to 96 px; the trap's single line runs under the big icon too.
    const widest = Math.max(...rows.map((row) => (row.from.length + row.to.length) * 0.6 + 1.4));
    const valueRoom = trap ? frame.width : text;
    for (const stack of trap ? [true] : [false, true]) {
      const num = Math.max(28, Math.min(Math.round(96 * scale), stack ? Math.floor(valueRoom / widest) : 96));
      // A label never outweighs its figures.
      const label = Math.min(size, Math.max(26, num));
      let fits = true;
      const heights = rows.map((row) => {
        const labelWidth = nerfLabel(row).length * label * 0.56;
        const valuesWidth = (row.from.length + row.to.length) * num * 0.6 + num * 1.4;
        const room = stack ? text : text - valuesWidth - 24;
        const lines = Math.ceil(labelWidth / Math.max(room, 1));
        if (room < text * (stack ? 1 : 0.3) || lines > 2 || valuesWidth > (trap ? frame.width : text)) fits = false;
        if (trap) return Math.max(icon, lines * label * 1.15) + 24 + num + frame.pad;
        const body = stack ? lines * label * 1.15 + 10 + num : Math.max(lines * label * 1.15, num);
        return Math.max(body, icon) + frame.pad;
      });
      const columns = Array.from({ length: frame.cols }, (_, col) =>
        heights.slice(col * perCol, (col + 1) * perCol).reduce((sum, each) => sum + each, 0)
      );
      last = { scale, label, num, icon, stack };
      if (fits && Math.max(...columns) <= frame.height) return { ...last, fits: true };
    }
  }
  return { ...last, fits: false };
}

const NERF_BASE = `body{display:block;padding:0;background:#0c0d0f}body::before,body::after{content:none}
.main{position:absolute;inset:0;display:block;padding:0}.main::after{content:none}
.mark{top:40px;left:72px;color:#6b6f76;z-index:3}
.title{position:absolute;margin:0;z-index:2;font-family:Tektur,sans-serif;font-weight:800;font-size:80px;line-height:1;
letter-spacing:-.01em;text-transform:none}.title::after{content:none}
.fig{position:absolute;overflow:hidden;background:linear-gradient(#1e242d,#111419)}
.fig img{position:absolute;left:50%;transform:translateX(-50%)}
.who{position:absolute;display:flex;align-items:baseline;gap:20px}
.name{font-weight:800;color:#f1ebe0;line-height:1}.patch{font-weight:600;font-size:30px;color:#8a929e;line-height:1}
.list{position:absolute;display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));
grid-template-rows:repeat(var(--rows),1fr);grid-auto-flow:column;column-gap:var(--gap,48px)}
.row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;column-gap:24px}
.ic{width:var(--icon);height:var(--icon)}
.ic img{display:block;width:100%;height:100%;border-radius:6px;border:1px solid rgba(255,255,255,.14)}
.what{font-weight:600;font-size:var(--label);line-height:1.15;color:#f1ebe0}.what b{font-weight:800}
.vals{display:flex;align-items:baseline;gap:.3em;white-space:nowrap;font-weight:800;font-size:var(--num);line-height:1;
font-variant-numeric:tabular-nums}
.was{color:#8a929e}.now{color:#f1ebe0}.to::before{content:'→';font-weight:600;color:#5b616b}
.inline .vals{justify-content:flex-end}
.stack .row{grid-template-columns:auto minmax(0,1fr);row-gap:10px;align-content:center}
.stack .ic{grid-row:span 2}.stack .vals{grid-column:2}
.noicons .ic{display:none}.noicons .row{grid-template-columns:minmax(0,1fr) auto}
.noicons.stack .row{grid-template-columns:minmax(0,1fr)}.noicons.stack .vals{grid-column:1}
.trap .row{row-gap:24px}.trap .ic{grid-row:auto}.trap .vals{grid-column:1 / -1}`;

const NERF_CSS: Record<NerfLook, string> = {
  // A: a full-height hero panel on the left under a caps title; the lines a ruled list.
  A: `.fig{left:0;top:0;bottom:0;width:var(--size)}.fig img{top:24px;height:1000px}
.mark{left:calc(var(--size) + 64px)}
.title{left:calc(var(--size) + 60px);top:72px;font-size:80px;text-transform:uppercase}
.who{left:calc(var(--size) + 64px);right:72px;top:180px}.name{font-size:44px}
.list{left:calc(var(--size) + 64px);right:72px;top:252px;bottom:48px}
.row{border-top:1px solid rgba(255,255,255,.12)}`,
  // C: a letterbox close-up across the top, the title on its calm left; the lines below in one or two columns.
  C: `.fig{left:0;right:0;top:0;height:var(--size)}.fig img{left:auto;right:0;transform:none;top:-8px;height:calc(var(--size) + 48px)}
.title{left:68px;top:72px;font-size:88px}
.who{left:72px;top:192px}.name{font-size:48px}
.list{left:72px;right:72px;top:calc(var(--size) + 32px);bottom:40px;--gap:64px}
.row{border-bottom:1px solid rgba(255,255,255,.12)}`
};

function nerfPicture(look: NerfLook, version: string, hero: HeroInfo, rows: NerfRow[], trap: boolean): string {
  // The first frame that keeps the type large enough for a phone, else the one with the largest type.
  const tries = NERF_FRAMES[look](rows.length).map((each) => ({ frame: each, fit: nerfFit(rows, each, trap) }));
  const fitting = tries.filter((each) => each.fit.fits);
  const best =
    fitting.find((each) => each.fit.scale >= 0.6) ??
    [...fitting].sort((a, b) => b.fit.scale - a.fit.scale)[0] ??
    tries[tries.length - 1];
  if (best === undefined) throw noData('a picture frame');
  const { frame, fit } = best;
  const row = (each: NerfRow) => {
    const stat = escapeHtml(each.ability === null ? each.stat : each.stat.toLowerCase());
    const what = each.ability === null ? stat : `<b>${escapeHtml(each.ability)}:</b> ${stat}`;
    const ic = each.icon === null ? '' : `<img src="${abilityImage(each.icon)}" alt="">`;
    return `<div class="row"><span class="ic">${ic}</span><span class="what">${what}</span><span class="vals"><span class="was">${escapeHtml(each.from)}</span><span class="to"></span><span class="now">${escapeHtml(each.to)}</span></span></div>`;
  };
  const list = `<div class="list">${rows.map(row).join('')}</div>`;
  const perCol = Math.ceil(rows.length / frame.cols);
  const vars = `:root{--label:${fit.label}px;--num:${fit.num}px;--icon:${fit.icon}px;--cols:${frame.cols};--rows:${perCol};--size:${frame.size}px}`;
  const kind = `${fit.stack ? 'stack' : 'inline'}${fit.icon === 0 ? ' noicons' : ''}${trap ? ' trap' : ''}`;
  return picturePage(
    `<style>${vars}</style><div class="sheet ${kind}">
<div class="fig"><img src="${look === 'C' ? heroImage(hero.name) : heroRender(hero.name)}" alt=""></div>
<div class="title">Нерф <b>или</b> баф?</div>
<div class="who"><span class="name">${escapeHtml(hero.localizedName)}</span><span class="patch">патч ${escapeHtml(version)}</span></div>
${list}</div>`,
    `${NERF_BASE}\n${NERF_CSS[look]}`
  );
}

/**
 * «Нерф или баф?» must be a real question (owner, 25.10.2026: «тут явный нерф, было больше — стало меньше, в чём суть»).
 * First choice: a hero who got buffs and nerfs at once — all its changes without a hint, and an opinion poll on the
 * total. Otherwise a trap: a cost, a cooldown or a cast time that went down is a buff though the number shrank.
 */
export async function nerfOrBuff(context: RubricContext): Promise<RubricSample> {
  const patch = await latestPatch(context);
  // One of the two looks at random, so the rubric does not grow stale (owner, 26.10.2026: «чтобы чередовалось»).
  const look = pick([...NERF_LOOKS], context.random);
  // Nerf, buff and one joke of the «не еби мозги» kind (owner, 26.10.2026); the picture sits in the poll, no post.
  const options = withJoke(['Нерф', 'Баф'], context.random, DONT_BOTHER_JOKES);
  const mixed = patch.scored.filter((each) => {
    const own = patch.changes.filter((change) => change.heroId === each.hero.id);
    return own.length >= 2 && own.length <= 8 && own.some((one) => one.buff) && own.some((one) => !one.buff);
  });
  if (mixed.length > 0) {
    const { hero } = pick(mixed, context.random);
    const own = patch.changes.filter((change) => change.heroId === hero.id);
    const detail = await context.sources.heroDetail(hero.id).catch(() => null);
    const rows = own.map((change) => {
      const ability = detail?.abilities.find((one) => one.id === change.abilityId);
      return {
        icon: ability?.key ?? null,
        ability: ability?.name ?? null,
        stat: change.stat,
        from: change.from,
        to: change.to
      };
    });
    return {
      picture: { html: nerfPicture(look, patch.version, hero, rows, false), ...PICTURE_SIZE },
      pictureInPoll: true,
      // Never sent (the poll is the whole post); kept for the logs and the local preview.
      text: `${hero.localizedName}, патч ${patch.version}: нерф или баф?`,
      poll: poll(`${hero.localizedName} после ${patch.version}: нерф или баф?`, options)
    };
  }
  const traps = patch.changes.filter(
    (change) =>
      change.abilityId !== null && LESS_IS_BETTER.test(change.stat) && firstNumber(change.to) < firstNumber(change.from)
  );
  if (traps.length === 0) throw noData('a change that is not obvious');
  const change = pick(traps, context.random);
  const hero = patch.byId.get(change.heroId);
  if (hero === undefined) throw noData('hero');
  const detail = await context.sources.heroDetail(change.heroId);
  const ability = detail.abilities.find((each) => each.id === change.abilityId);
  const subject = ability === undefined ? hero.localizedName : `${ability.name} (${hero.localizedName})`;
  const html =
    ability === undefined
      ? null
      : nerfPicture(
          look,
          patch.version,
          hero,
          [{ icon: ability.key, ability: ability.name, stat: change.stat, from: change.from, to: change.to }],
          true
        );
  return {
    picture: html === null ? null : { html, ...PICTURE_SIZE },
    text: `${subject}: ${change.stat.toLowerCase()}: ${change.from} → ${change.to}\nЦифра стала меньше — значит, нерф?`,
    pictureInPoll: html !== null,
    poll: quiz('Это нерф или баф?', options, 1, `${change.note} (патч ${patch.version})`)
  };
}

// «Valve, ты серьёзно?» (owner, 27.10.2026): the three funniest micro-changes of the patch, ones absurd on their own.
// The smallest in % alone picked Centaur's speed 300 → 295, a plain nerf that matters in the game: speed and damage
// are left out, and a change counts when it moves its stat by at most 6%: 7.41f had nothing under 3%, its funny ones were
// «сила 23 → 22», «интеллект 20 → 21», «прирост силы 3,3 → 3,4» (27.10.2026).
const SERIOUS_STAT = /скорост[ьи] передвижения|урон|damage/iu;
const MICRO_MAX = 0.06;
const SERIOUSLY_MAX = 3;
// The poll's three answers, one set per post (owner, 29.10.2026: the same three every time got old).
const SERIOUSLY_SETS: readonly (readonly [string, string, string])[] = [
  ['Это меняет всё', 'Ждал этого три года', 'Иди нахуй, Valve'],
  ['Наконец-то', 'Кто, блять, это просил?', 'Valve, вы ебанутые'],
  ['Гениально', 'Я нихуя не понял', 'Удаляю доту'],
  ['Именно этого не хватало', 'Похуй, всё равно солью', 'Верните как было, суки'],
  ['Красиво', 'Зачем?', 'Сначала почините матчмейкинг, пидорасы'],
  ['Шедевр', 'Это шутка?', 'Габен, проспись'],
  ['Жду в катке', 'Ничего не понял, но уже злюсь', 'Пиздец, а не патч'],
  ['Великий день', 'Минус одна причина жить', 'Valve, что вы курите и где взять'],
  ['Правильно', 'Херня', 'Я уже ливнул'],
  ['Беру', 'Смешно', 'Верните мне десять лет жизни'],
  ['Ура', 'И что?', 'Valve, вы там живы вообще?'],
  ['Топ', 'Опять, блять', 'Сколько можно издеваться'],
  ['Лучший патч', 'Худший патч', 'Мне похуй, я на Пудже'],
  ['Баланс', 'Пизданс', 'Вальв, не надо'],
  ['Обожаю', 'Терплю', 'Ненавижу, сука']
];

export async function valveSeriously(context: RubricContext): Promise<RubricSample> {
  const patch = await latestPatch(context);
  const micro = patch.changes
    .filter((change) => change.size > 0 && change.size <= MICRO_MAX && !SERIOUS_STAT.test(change.stat))
    .sort((a, b) => a.size - b.size);
  // One change a hero: three heroes read funnier than three lines of one.
  const picked = micro
    .filter((change, index) => micro.findIndex((other) => other.heroId === change.heroId) === index)
    .slice(0, SERIOUSLY_MAX);
  if (picked.length === 0) throw noData('micro-changes in the patch');
  // No arrow: the writer retells each line in words, the rich message makes no table of it.
  const lines = picked.map(
    (change) =>
      `${patch.byId.get(change.heroId)?.localizedName ?? 'Герой'}: ${change.stat.toLowerCase()} — было ${change.from}, стало ${change.to}`
  );
  const details = await Promise.all(
    picked.map((change) => context.sources.heroDetail(change.heroId).catch(() => null))
  );
  const changes = picked.flatMap((change, index) => {
    const hero = patch.byId.get(change.heroId);
    if (hero === undefined) return [];
    const ability = details[index]?.abilities.find((one) => one.id === change.abilityId)?.key ?? null;
    return [{ hero, ability, stat: change.stat, from: change.from, to: change.to, diff: difference(change) }];
  });
  return {
    picture: changes.length === 0 ? null : { html: seriouslyPicture(changes), ...PICTURE_SIZE },
    text: [`Самые крошечные правки патча ${patch.version}:`, ...lines].join('\n'),
    poll: poll('Valve, ты серьёзно?', [...pick(SERIOUSLY_SETS, context.random)])
  };
}

/** The difference as players read it: «+1», «−0,01», as many decimals as the values have. */
function difference(change: Change): string {
  const decimals = (value: string) => /[.,](\d+)/u.exec(value.split('/')[0] ?? '')?.[1]?.length ?? 0;
  const digits = Math.max(decimals(change.from), decimals(change.to));
  const delta = firstNumber(change.to) - firstNumber(change.from);
  const text = Math.abs(delta).toFixed(digits).replace('.', ',');
  return `${delta < 0 ? '−' : '+'}${text}${change.to.trim().endsWith('%') ? '%' : ''}`;
}

/**
 * «Валв-тайм» goes out on round marks without a patch (owner, 27.10.2026): 30, 45, 60, 90 days, then every 30; a short
 * wait is no joke. The scheduler posts it on the mark's day; the DEV sample shows the current count once past 30.
 */
const VALVE_TIME_MARKS = [30, 45, 60, 90] as const;

export async function valveTime(context: RubricContext): Promise<RubricSample> {
  const patches = await context.sources.patches();
  const latest = [...patches].sort((a, b) => b.timestamp - a.timestamp)[0];
  if (latest === undefined) throw noData('patch list');
  const days = Math.max(0, Math.floor((context.now - latest.timestamp * 1000) / 86_400_000));
  if (days < VALVE_TIME_MARKS[0]) throw noData('a patch came out less than 30 days ago');
  const date = new Date(latest.timestamp * 1000).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Moscow'
  });
  // The board (A) and the endless loading bar (C) take turns at random (owner, 27.10.2026).
  const look = pick(VALVE_TIME_LOOKS, context.random);
  return {
    picture: { html: valveTimePicture(look, { days, version: latest.version, date }), ...PICTURE_SIZE },
    // The board carries the numbers; the caption is the joke alone (owner, 27.10.2026: the sample repeated the board).
    text: 'Патча всё нет.',
    reference: `${days} ${plural(days, 'день', 'дня', 'дней')} без патча; последний патч ${latest.version} вышел ${date}.`,
    poll: null
  };
}

// «Valve исправила» (owner, 27.10.2026): one real note of the latest patch, then what «the fix» led to; the joke is in
// the escalation, the note itself stays true.
export async function valveFixed(context: RubricContext): Promise<RubricSample> {
  const patch = await latestPatch(context);
  const notes = patch.notes.heroes.flatMap((each) =>
    each.notes.map((note) => ({ heroId: each.heroId, note: note.note.trim() }))
  );
  const chosen = pick(
    notes.filter((each) => each.note !== ''),
    context.random
  );
  const hero = patch.byId.get(chosen.heroId)?.localizedName ?? 'Герой';
  return {
    picture: null,
    text: `Valve исправила ${hero}.`,
    reference: `Патч ${patch.version}, ${hero}: ${chosen.note}`,
    poll: null
  };
}
