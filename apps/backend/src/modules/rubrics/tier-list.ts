import { escapeHtml, heroPortraitImage, PICTURE_SIZE, picturePage, rankMedalImage } from './picture';
import { needStats, noData, pick, type RubricContext, type RubricSample, type StatsSource } from './types';

// «Тир-лист» (owner, 28.10.2026): one 2:1 picture and no caption («тут текст не нужен вообще»). The title on the left
// says what the picture shows; five role columns with four heroes each stand on the right. Eight looks, picked at random;
// a look STRATZ cannot fill is skipped with an owner's note «Нет данных», and the next one is tried.

const ROLES = ['Керри', 'Мид', 'Оффлейн', 'Четвёрка', 'Пятёрка'] as const;
const POSITIONS = [1, 2, 3, 4, 5] as const;
const PER_ROLE = 4;

/** Ranks of «Лучшие» and «Худшие» in turn (owner): Рекрут … Легенда; the Divine side only appears in «Рекруты и Божества». */
const ROTATION: { bracket: number; on: string }[] = [
  { bracket: 1, on: 'Рекрутах' },
  { bracket: 2, on: 'Стражах' },
  { bracket: 3, on: 'Рыцарях' },
  // «на Героях» read as «heroes on heroes»: the rank is named as a rank.
  { bracket: 4, on: 'ранге Герой' },
  { bracket: 5, on: 'Легендах' }
];
const RECRUIT = 1;

/** Matches a hero needs at a position in the stretch counted before its rate says anything (the card: 300 a week). */
const MIN_WEEK_MATCHES = 300;
/**
 * The swing look reads every rank at once, where 300 games a week is a hero's rare off-role picks and their win rate
 * jumps by chance (DEV, 28.10.2026: one hero «fell» on mid, four and five); a role needs this many games both weeks.
 */
const MIN_SWING_MATCHES = 2000;
/** The easy heroes sit on the low ranks with few games each: a lower floor. */
const MIN_EASY_MATCHES = 100;
// A short game is about one in eight (DEV, 28.10.2026): fewer than this many swung the rate by luck.
const MIN_LENGTH_MATCHES = 300;
const SHORT_MINUTES = 30;
/** STRATZ's timeline stops at minute 35: «long» is the games still running then. */
const LONG_MINUTES = 35;
/** The newest STRATZ week is still filling: under this share of the week before it, it is dropped. */
const SETTLED_SHARE = 0.6;

/** The owner's list of simple heroes, four for each role (hero names without `npc_dota_hero_`). */
const EASY_HEROES: readonly (readonly string[])[] = [
  ['skeleton_king', 'drow_ranger', 'luna', 'sven'],
  ['viper', 'sniper', 'necrolyte', 'dragon_knight'],
  ['axe', 'bristleback', 'centaur', 'tidehunter'],
  ['lion', 'spirit_breaker', 'bounty_hunter', 'shadow_shaman'],
  ['ogre_magi', 'witch_doctor', 'crystal_maiden', 'dazzle']
];

type WeekRow = { heroId: number; week: number; matches: number; wins: number };

/**
 * The weeks STRATZ has finished, newest first, as hero → matches and wins. The newest week is dropped when it holds far
 * fewer matches than the one before: it is still being counted and would mix thin samples into the rates.
 */
export function settledWeeks(rows: readonly WeekRow[]): Map<number, { matches: number; wins: number }>[] {
  const byWeek = new Map<number, Map<number, { matches: number; wins: number }>>();
  for (const row of rows) {
    const week = byWeek.get(row.week) ?? new Map();
    const own = week.get(row.heroId) ?? { matches: 0, wins: 0 };
    week.set(row.heroId, { matches: own.matches + row.matches, wins: own.wins + row.wins });
    byWeek.set(row.week, week);
  }
  const total = (week: Map<number, { matches: number }>) =>
    [...week.values()].reduce((sum, each) => sum + each.matches, 0);
  const weeks = [...byWeek.entries()].sort((a, b) => b[0] - a[0]).map(([, week]) => week);
  const [newest, before] = weeks;
  if (newest !== undefined && before !== undefined && total(newest) < total(before) * SETTLED_SHARE) weeks.shift();
  return weeks;
}

interface Tile {
  hero: string;
  num: string;
  fall?: boolean;
}
type Cell = Tile | { group: string };
type Column = Cell[];

interface Look {
  title: string;
  /** Under the title: a rank medal. */
  medal?: number;
  columns: Column[];
}

const dec = (value: number) => Math.abs(value).toFixed(1).replace('.', ',');
const pct = (value: number) => `${dec(value)}%`;
const rate = (matches: number, wins: number) => (matches === 0 ? 0 : (wins / matches) * 100);
// Triangles are drawn as SVG at cap height: the ▲/▼ glyphs fell back to another font and sat off the baseline.
const triangle = (up: boolean) =>
  `<svg class="tri" viewBox="0 0 20 18" aria-hidden="true"><path d="${up ? 'M10 0L20 18H0Z' : 'M0 0H20L10 18Z'}"/></svg>`;
const delta = (value: number) =>
  `<span class="${value >= 0 ? 'up' : 'down'}">${triangle(value >= 0)}${dec(value)}</span>`;

interface Ctx {
  stats: StatsSource;
  /** Hero id → the name Valve's image carries (`npc_dota_hero_` dropped). */
  names: Map<number, string>;
}

type Scored = { heroId: number; value: number };
const tilesOf = (ctx: Ctx, list: Scored[], label: (value: number) => string, fall = false): Tile[] =>
  list.flatMap((each) => {
    const hero = ctx.names.get(each.heroId);
    return hero === undefined
      ? []
      : [{ hero, num: label(each.value), ...(fall && each.value < 0 ? { fall: true } : {}) }];
  });
const full = (what: string, tiles: Tile[]) => {
  if (tiles.length < PER_ROLE) throw noData(what);
  return tiles;
};
const best = (list: Scored[], count: number) => [...list].sort((a, b) => b.value - a.value).slice(0, count);
const worst = (list: Scored[], count: number) => [...list].sort((a, b) => a.value - b.value).slice(0, count);

/** One role's games and wins per hero in the settled newest week of a bracket. */
async function weekRows(
  ctx: Ctx,
  bracket: number,
  position: number
): Promise<Map<number, { matches: number; wins: number }>> {
  const [week] = settledWeeks(await ctx.stats.positionWeeks(bracket, position, 3));
  return week ?? new Map();
}

/**
 * A hero counts under a role only when it is his own: at least this share of his games on the rank are there (DEV,
 * 28.10.2026: Invoker «worst carry» at 29% from a few off-role picks, the same heroes in three columns).
 */
const OWN_ROLE_SHARE = 0.25;

/** Whether role `index` is the hero's own among five roles' games: his most-played, with OWN_ROLE_SHARE at least. */
function ownRole(byRole: ReadonlyMap<number, { matches: number }>[]): (heroId: number, index: number) => boolean {
  const totals = new Map<number, number>();
  const home = new Map<number, number>();
  byRole.forEach((rows, index) => {
    for (const [heroId, each] of rows) {
      totals.set(heroId, (totals.get(heroId) ?? 0) + each.matches);
      const held = home.get(heroId);
      if (held === undefined || each.matches > (byRole[held]?.get(heroId)?.matches ?? 0)) home.set(heroId, index);
    }
  });
  return (heroId, index) =>
    home.get(heroId) === index &&
    (byRole[index]?.get(heroId)?.matches ?? 0) >= (totals.get(heroId) ?? 0) * OWN_ROLE_SHARE;
}

/** One role's rates in the settled newest week of a bracket. */
async function weekRates(ctx: Ctx, bracket: number, position: number, floor: number): Promise<Scored[]> {
  const [week] = settledWeeks(await ctx.stats.positionWeeks(bracket, position, 3));
  if (week === undefined) return [];
  return [...week.entries()]
    .filter(([, each]) => each.matches >= floor)
    .map(([heroId, each]) => ({ heroId, value: rate(each.matches, each.wins) }));
}

async function rankLook(ctx: Ctx, random: () => number, side: 'best' | 'worst'): Promise<Look> {
  const rank = pick(ROTATION, random);
  const byRole: Map<number, { matches: number; wins: number }>[] = [];
  for (const position of POSITIONS) byRole.push(await weekRows(ctx, rank.bracket, position));
  const own = ownRole(byRole);
  const columns: Column[] = [];
  for (const [index, rows] of byRole.entries()) {
    const position = POSITIONS[index] ?? index + 1;
    const rates = [...rows.entries()]
      .filter(([heroId, each]) => each.matches >= MIN_WEEK_MATCHES && own(heroId, index))
      .map(([heroId, each]) => ({ heroId, value: rate(each.matches, each.wins) }));
    const chosen = side === 'best' ? best(rates, PER_ROLE) : worst(rates, PER_ROLE);
    columns.push(full(`${ROLES[position - 1]} на ${rank.on}`, tilesOf(ctx, chosen, pct)));
  }
  return {
    title:
      side === 'best'
        ? `<b>Лучшие</b><br>герои<br>недели на<br>${rank.on}`
        : `<b>Худшие</b><br>герои<br>недели на<br>${rank.on}`,
    medal: rank.bracket,
    columns
  };
}

async function easyLook(ctx: Ctx): Promise<Look> {
  const byName = new Map([...ctx.names].map(([id, name]) => [name, id]));
  const columns: Column[] = [];
  for (const position of POSITIONS) {
    const rates = await weekRates(ctx, RECRUIT, position, MIN_EASY_MATCHES);
    const own = (EASY_HEROES[position - 1] ?? []).flatMap((name) => {
      const heroId = byName.get(name);
      return heroId === undefined ? [] : rates.filter((each) => each.heroId === heroId);
    });
    columns.push(full(`лёгкие герои: ${ROLES[position - 1]}`, tilesOf(ctx, best(own, PER_ROLE), pct)));
  }
  return { title: '<b>Лёгкие</b><br>герои<br>для<br>новичка', columns };
}

async function swingLook(ctx: Ctx): Promise<Look> {
  // All roles first, so a hero who moved on several stays only where he moved most.
  // A hero shows up only under his own role (owner, 28.10.2026: Mirana and Disruptor on the offlane).
  const byRole: Scored[][] = [];
  const nows: Map<number, { matches: number }>[] = [];
  for (const position of POSITIONS) {
    const weeks = settledWeeks(await ctx.stats.positionWeeks(null, position, 4));
    const [now, before] = weeks;
    if (now === undefined || before === undefined) throw noData('two weeks');
    nows.push(now);
    const moves: Scored[] = [...now.entries()].flatMap(([heroId, each]) => {
      const earlier = before.get(heroId);
      if (earlier === undefined || each.matches < MIN_SWING_MATCHES || earlier.matches < MIN_SWING_MATCHES) return [];
      return [{ heroId, value: rate(each.matches, each.wins) - rate(earlier.matches, earlier.wins) }];
    });
    byRole.push(moves);
  }
  const own = ownRole(nows);
  const strongest = new Map<number, number>();
  byRole.forEach((moves, index) => {
    for (const each of moves) {
      if (!own(each.heroId, index)) continue;
      const held = strongest.get(each.heroId);
      const heldMove =
        held === undefined ? 0 : Math.abs(byRole[held]?.find((m) => m.heroId === each.heroId)?.value ?? 0);
      if (held === undefined || Math.abs(each.value) > heldMove) strongest.set(each.heroId, index);
    }
  });
  const columns: Column[] = [];
  for (const [index, all] of byRole.entries()) {
    const position = POSITIONS[index] ?? index + 1;
    const moves = all.filter((each) => strongest.get(each.heroId) === index);
    // Two who rose, then two who fell: a hero that did not move the other way is never forced into the other half.
    const risen = best(
      moves.filter((each) => each.value > 0),
      PER_ROLE / 2
    );
    const fallen = worst(
      moves.filter((each) => each.value < 0),
      PER_ROLE / 2
    ).sort((a, b) => b.value - a.value);
    columns.push(full(`взлёт и падение: ${ROLES[position - 1]}`, tilesOf(ctx, [...risen, ...fallen], delta, true)));
  }
  return { title: 'Кто<br>поднялся<br>и кто <b>упал</b><br>за неделю', columns };
}

/** Every hero's most-played position among the rows, with his share: the role he is listed under. */
function mainRole(rows: { heroId: number; position: number; matches: number }[]): Map<number, number> {
  const top = new Map<number, { position: number; matches: number }>();
  for (const row of rows) {
    const own = top.get(row.heroId);
    if (own === undefined || row.matches > own.matches)
      top.set(row.heroId, { position: row.position, matches: row.matches });
  }
  return new Map([...top].map(([heroId, each]) => [heroId, each.position]));
}

async function ranksLook(ctx: Ctx): Promise<Look> {
  // Рекруты: each hero only under the role that holds most of his games there, and a quarter of them at least (DEV,
  // 28.10.2026: Bristleback on mid and offlane, Troll on carry and four).
  const recruitRows: Map<number, { matches: number; wins: number }>[] = [];
  for (const position of POSITIONS) recruitRows.push(await weekRows(ctx, RECRUIT, position));
  const recruitOwn = ownRole(recruitRows);
  // Божества: the same rule over STRATZ's positions.
  const divine = await ctx.stats.positions();
  const divineHome = mainRole(divine);
  const divineTotals = new Map<number, number>();
  for (const row of divine) divineTotals.set(row.heroId, (divineTotals.get(row.heroId) ?? 0) + row.matches);
  const columns: Column[] = POSITIONS.map((position, index) => {
    const low = best(
      [...(recruitRows[index] ?? new Map()).entries()]
        .filter(([heroId, each]) => each.matches >= MIN_WEEK_MATCHES && recruitOwn(heroId, index))
        .map(([heroId, each]) => ({ heroId, value: rate(each.matches, each.wins) })),
      PER_ROLE / 2
    );
    const high = best(
      divine
        .filter(
          (each) =>
            each.position === position &&
            each.matches >= MIN_WEEK_MATCHES &&
            divineHome.get(each.heroId) === position &&
            each.matches >= (divineTotals.get(each.heroId) ?? 0) * OWN_ROLE_SHARE
        )
        .map((each) => ({ heroId: each.heroId, value: rate(each.matches, each.wins) })),
      PER_ROLE / 2
    );
    return [{ group: 'Рекруты' }, ...tilesOf(ctx, low, pct), { group: 'Божества' }, ...tilesOf(ctx, high, pct)];
  });
  for (const [index, column] of columns.entries()) {
    if (column.length < PER_ROLE + 2) throw noData(`Рекруты и Божества: ${ROLES[index]}`);
  }
  return { title: '<b>Лучшие</b><br>герои:<br>Рекруты<br>и Божества', columns };
}

async function lengthLook(ctx: Ctx): Promise<Look> {
  const rows: { heroId: number; position: number; minute: number; matches: number; wins: number }[] = [];
  for (const position of POSITIONS) rows.push(...(await ctx.stats.lengthRates(position)));
  // STRATZ's `time` is a timeline (DEV, 28.10.2026: values 0…35), not a length: the row at minute t counts the games
  // still running then. So games shorter than 30 minutes are «all at 0» minus «still running at 30», and long games
  // are those still running at 35.
  const at = (position: number, minute: number) =>
    new Map(
      rows
        .filter((row) => row.position === position && row.minute === minute)
        .map((row) => [row.heroId, { matches: row.matches, wins: row.wins }])
    );
  const scored = (games: Map<number, { matches: number; wins: number }>): Scored[] =>
    [...games]
      .filter(([, each]) => each.matches >= MIN_LENGTH_MATCHES)
      .map(([heroId, each]) => ({ heroId, value: rate(each.matches, each.wins) }));
  const shortGames = (position: number) => {
    const all = at(position, 0);
    const late = at(position, SHORT_MINUTES);
    return new Map(
      [...all].map(([heroId, each]) => {
        const still = late.get(heroId) ?? { matches: 0, wins: 0 };
        return [heroId, { matches: each.matches - still.matches, wins: each.wins - still.wins }];
      })
    );
  };
  // Only under a hero's own role, judged on all his games (minute 0).
  const own = ownRole(POSITIONS.map((position) => at(position, 0)));
  // Over 35 minutes holds about two thirds of the games (DEV, 28.10.2026), so picking by the long-game rate just
  // repeated the overall best. A hero is picked by how much better he does in one kind of game than in the other.
  const columns: Column[] = POSITIONS.map((position, index) => {
    const shortRates = new Map(scored(shortGames(position)).map((each) => [each.heroId, each.value]));
    const longRates = new Map(scored(at(position, LONG_MINUTES)).map((each) => [each.heroId, each.value]));
    const both = [...shortRates.keys()].filter((heroId) => longRates.has(heroId) && own(heroId, index));
    const gap = (heroId: number) => (shortRates.get(heroId) ?? 0) - (longRates.get(heroId) ?? 0);
    const early = best(
      both.map((heroId) => ({ heroId, value: gap(heroId) })),
      PER_ROLE / 2
    );
    // «Strong late» under 50% read as a contradiction (DEV, 28.10.2026: 42.7% on the mid): late picks win long games.
    const late = worst(
      both.filter((heroId) => (longRates.get(heroId) ?? 0) >= 50).map((heroId) => ({ heroId, value: gap(heroId) })),
      PER_ROLE / 2
    );
    const short = early.map((each) => ({ heroId: each.heroId, value: shortRates.get(each.heroId) ?? 0 }));
    const long = late.map((each) => ({ heroId: each.heroId, value: longRates.get(each.heroId) ?? 0 }));
    return [
      { group: 'Быстрые игры: до 30 минут' },
      ...tilesOf(ctx, short, pct),
      { group: 'Затяжные игры: после 35 минут' },
      ...tilesOf(ctx, long, pct)
    ];
  });
  for (const [index, column] of columns.entries()) {
    if (column.length < PER_ROLE + 2) {
      // Which length values STRATZ sent, so a unit mismatch (seconds, bins) shows in the note.
      const minutes = [...new Set(rows.map((row) => row.minute))].sort((a, b) => a - b);
      throw noData(
        `игры по длине: ${ROLES[index]} (строк ${rows.length}, длины ${minutes.slice(0, 6).join(',')}…${minutes.slice(-3).join(',')})`
      );
    }
  }
  return { title: 'Кто силён<br><b>рано</b>,<br>а кто<br><b>поздно</b>', columns };
}

// Scale (owner-approved mock-ups S-*-r4): type 120 (title max)/32/26, margins 72 side, 44 top and bottom. Left block
// 72…492, grid 526…1464: five columns of 178 with 12 between, 680 tall. A tile keeps Valve's portrait framing (≈1.5:1)
// over a 38 px number strip. The house «ALEXEEV» mark stays visible at top 34 / left 56.
const CSS = `body{display:block;padding:0;background:#101216}body::before,body::after{content:none}.mark{top:34px;left:56px}
.left{position:absolute;left:72px;top:44px;width:420px;height:680px;display:flex;flex-direction:column;justify-content:center;gap:40px}
.title{margin:0;font-family:Oswald,sans-serif;font-weight:700;font-size:120px;line-height:1.08;text-transform:uppercase;letter-spacing:-.005em;
white-space:nowrap;color:#f1ebe0;align-self:flex-start}
.title::after{content:none}.title b{color:var(--red)}
.medal{width:240px;height:240px;margin-left:-20px;flex:none}
.grid{position:absolute;left:526px;top:44px;display:flex;gap:12px}
.col{width:178px;height:680px;padding:6px;border-radius:14px;background:var(--red);display:flex;flex-direction:column;gap:6px}
.tab{height:48px;flex:none;display:flex;align-items:center;justify-content:center;font-family:Oswald,sans-serif;font-weight:700;
font-size:32px;line-height:1;text-transform:uppercase;color:#0b0c0e}
.grid.rows{left:532px;top:50px;width:926px;height:668px;display:grid;grid-template-columns:repeat(5,166px);column-gap:24px;row-gap:6px}
.bg{margin:-6px;border-radius:14px;background:var(--red)}
.band{margin:0 -6px;border-radius:8px;background:#ffffff;display:flex;align-items:center;justify-content:center;
font-family:Oswald,sans-serif;font-weight:700;font-size:30px;line-height:1;letter-spacing:.06em;text-transform:uppercase;color:#0b0c0e}
.tile{flex:1 1 0;min-height:0;border-radius:8px;overflow:hidden;background:#0b0c0e;display:flex;flex-direction:column;position:relative}
.tile img{flex:1 1 0;min-height:0;width:100%;object-fit:cover;object-position:50% 30%;display:block}
.num{height:38px;flex:none;display:flex;align-items:center;justify-content:center;font-family:Oswald,sans-serif;font-weight:700;
font-size:34px;line-height:1;font-variant-numeric:tabular-nums;color:#fff;background:#0b0c0e}
.tri{width:.62em;height:.56em;margin-right:.14em;fill:currentColor;flex:none}
.up,.down{display:inline-flex;align-items:center}.down{color:#ff5a3c}
.tile.fall img{filter:grayscale(.85) brightness(.8)}`;
// The title starts at 150 px and shrinks until its widest line fits the left block and the whole block fits the height;
const FIT = `<script>document.fonts.ready.then(()=>{const l=document.querySelector('.left'),t=l.firstElementChild;
const h=()=>[...l.children].reduce((a,c)=>a+c.getBoundingClientRect().height,0)+40*(l.children.length-1);
let s=150;t.style.fontSize=s+'px';while((t.getBoundingClientRect().width>420||h()>640)&&s>60){s-=2;t.style.fontSize=s+'px'}})</script>`;
const FONT = `<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@700&amp;display=block&amp;subset=cyrillic" rel="stylesheet">`;

const tileHtml = (tile: Tile) =>
  `<div class="tile${tile.fall === true ? ' fall' : ''}"><img src="${heroPortraitImage(`npc_dota_hero_${tile.hero}`)}" alt=""><div class="num">${tile.num}</div></div>`;

function lookPage(look: Look): string {
  const medal = look.medal === undefined ? '' : `<img class="medal" src="${rankMedalImage(look.medal)}" alt="">`;
  const head = `${FONT}<div class="left"><div class="title">${look.title}</div>${medal}</div>${FIT}`;
  const first = look.columns[0] ?? [];
  if (!first.some((cell) => 'group' in cell)) {
    const columns = look.columns
      .map(
        (column, index) =>
          `<div class="col"><div class="tab">${escapeHtml(ROLES[index] ?? '')}</div>${column
            .map((cell) => ('group' in cell ? '' : tileHtml(cell)))
            .join('')}</div>`
      )
      .join('');
    return picturePage(`${head}<div class="grid">${columns}</div>`, CSS);
  }
  // Blocks (Рекруты / Божества, short / long games): one band across all five columns names each block (owner,
  // 28.10.2026: the same label in every column read as noise). The columns share rows, so a band lines up with them.
  const rows = ['48px', ...first.map((cell) => ('group' in cell ? '44px' : 'minmax(0,1fr)'))].join(' ');
  const at = (column: number, row: number) => `style="grid-column:${column};grid-row:${row}"`;
  const backs = look.columns.map((_, index) => `<div class="bg" style="grid-column:${index + 1};grid-row:1/-1"></div>`);
  const tabs = look.columns.map(
    (_, index) => `<div class="tab" ${at(index + 1, 1)}>${escapeHtml(ROLES[index] ?? '')}</div>`
  );
  const bands = first.flatMap((cell, row) =>
    'group' in cell
      ? [`<div class="band" style="grid-column:1/-1;grid-row:${row + 2}">${escapeHtml(cell.group)}</div>`]
      : []
  );
  const tiles = look.columns.flatMap((column, index) =>
    column.flatMap((cell, row) =>
      'group' in cell ? [] : [tileHtml(cell).replace('<div class="tile', `<div ${at(index + 1, row + 2)} class="tile`)]
    )
  );
  return picturePage(
    `${head}<div class="grid rows" style="grid-template-rows:${rows}">${[...backs, ...tabs, ...bands, ...tiles].join('')}</div>`,
    CSS
  );
}

type LookName = 'best' | 'worst' | 'easy' | 'swing' | 'ranks' | 'length';
// The order of the turns: the looks the owner hasn't seen yet come first (worst and swing approved, 28.10.2026).
const LOOKS: readonly LookName[] = ['best', 'easy', 'ranks', 'length', 'worst', 'swing'];
const buildLook = (name: LookName, ctx: Ctx, random: () => number): Promise<Look> => {
  switch (name) {
    case 'best':
    case 'worst':
      return rankLook(ctx, random, name);
    case 'easy':
      return easyLook(ctx);
    case 'swing':
      return swingLook(ctx);
    case 'ranks':
      return ranksLook(ctx);
    case 'length':
      return lengthLook(ctx);
  }
};

const codeOf = (error: unknown) =>
  error instanceof Error && 'code' in error ? String((error as { code: unknown }).code) : 'ошибка';
const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message.replace(/^No data for the rubric: /, '') : 'ошибка';

// One look per post, picked at random, and no trying the next when it fails: falling through the looks fired dozens
// of STRATZ reads in one sample and STRATZ refused the bot's address (DEV, 28.10.2026). A look that can't be filled
// is reported by name and code, so the owner sees which one; key, address and rate refusals go up as they are.
export async function tierList(context: RubricContext): Promise<RubricSample> {
  const stats = needStats(context);
  const heroes = await context.sources.heroes();
  const ctx: Ctx = { stats, names: new Map(heroes.map((hero) => [hero.id, hero.name.replace(/^npc_dota_hero_/, '')])) };
  // The looks take turns, one per post, the count kept between posts (owner, 28.10.2026: by the minute kept giving
  // the same two).
  const turn = await context.sources.turns?.next('tier_list');
  const name =
    turn === undefined ? pick(LOOKS, context.random) : (LOOKS[turn % LOOKS.length] ?? pick(LOOKS, context.random));
  try {
    const look = await buildLook(name, ctx, context.random);
    return { picture: { html: lookPage(look), ...PICTURE_SIZE }, text: '', ownText: true, poll: null };
  } catch (error) {
    const code = codeOf(error);
    if (code === 'STRATZ_TOKEN' || code === 'STRATZ_BLOCKED' || code === 'STRATZ_RATE') throw error;
    // The source's own detail (which STRATZ fields failed, its message) rides along, already bounded and redacted.
    const detail =
      error instanceof Error && 'detail' in error && typeof error.detail === 'string' && error.detail !== ''
        ? ` — ${error.detail}`
        : '';
    throw noData(`вид «${name}» (${code === 'UNAVAILABLE' ? reasonOf(error) : code}${detail})`);
  }
}
