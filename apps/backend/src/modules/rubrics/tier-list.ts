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
  { bracket: 4, on: 'Героях' },
  { bracket: 5, on: 'Легендах' }
];
const RECRUIT = 1;
const DIVINE_MEDAL = 7;

/** Matches a hero needs at a position in the stretch counted before its rate says anything (the card: 300 a week). */
const MIN_WEEK_MATCHES = 300;
/**
 * The swing look reads every rank at once, where 300 games a week is a hero's rare off-role picks and their win rate
 * jumps by chance (DEV, 28.10.2026: one hero «fell» on mid, four and five); a role needs this many games both weeks.
 */
const MIN_SWING_MATCHES = 2000;
/** The easy heroes sit on the low ranks with few games each: a lower floor. */
const MIN_EASY_MATCHES = 100;
const MIN_LANE_MATCHES = 300;
const MIN_LENGTH_MATCHES = 100;
const SHORT_MINUTES = 30;
const LONG_MINUTES = 50;
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
type Cell = Tile | { group: string; medal?: number };
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
  const columns: Column[] = [];
  for (const position of POSITIONS) {
    const rates = await weekRates(ctx, rank.bracket, position, MIN_WEEK_MATCHES);
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
  const byRole: Scored[][] = [];
  for (const position of POSITIONS) {
    const weeks = settledWeeks(await ctx.stats.positionWeeks(null, position, 4));
    const [now, before] = weeks;
    if (now === undefined || before === undefined) throw noData('two weeks');
    const moves: Scored[] = [...now.entries()].flatMap(([heroId, each]) => {
      const earlier = before.get(heroId);
      if (earlier === undefined || each.matches < MIN_SWING_MATCHES || earlier.matches < MIN_SWING_MATCHES) return [];
      return [{ heroId, value: rate(each.matches, each.wins) - rate(earlier.matches, earlier.wins) }];
    });
    byRole.push(moves);
  }
  const strongest = new Map<number, number>();
  byRole.forEach((moves, index) => {
    for (const each of moves) {
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
  const recruits: Scored[][] = [];
  for (const position of POSITIONS) recruits.push(await weekRates(ctx, RECRUIT, position, MIN_WEEK_MATCHES));
  const divine = await ctx.stats.positions();
  const columns: Column[] = POSITIONS.map((position) => {
    const low = best(recruits[position - 1] ?? [], PER_ROLE / 2);
    const taken = new Set(low.map((each) => each.heroId));
    const high = best(
      divine
        .filter((each) => each.position === position && each.matches >= MIN_WEEK_MATCHES && !taken.has(each.heroId))
        .map((each) => ({ heroId: each.heroId, value: rate(each.matches, each.wins) })),
      PER_ROLE / 2
    );
    return [
      { group: 'Рекруты', medal: RECRUIT },
      ...tilesOf(ctx, low, pct),
      { group: 'Божества', medal: DIVINE_MEDAL },
      ...tilesOf(ctx, high, pct)
    ];
  });
  for (const [index, column] of columns.entries()) {
    if (column.length < PER_ROLE + 2) throw noData(`Рекруты и Божества: ${ROLES[index]}`);
  }
  return { title: '<b>Лучшие</b><br>герои:<br>Рекруты<br>и Божества', columns };
}

async function laneLook(ctx: Ctx): Promise<Look> {
  const rows = await ctx.stats.laneRates();
  const columns = POSITIONS.map((position) =>
    full(
      `линия: ${ROLES[position - 1]}`,
      tilesOf(
        ctx,
        best(
          rows
            .filter((each) => each.position === position && each.matches >= MIN_LANE_MATCHES)
            .map((each) => ({ heroId: each.heroId, value: rate(each.matches, each.wins) })),
          PER_ROLE
        ),
        pct
      )
    )
  );
  return { title: 'Кто чаще<br><b>выигрывает</b><br>линию', columns };
}

async function lengthLook(ctx: Ctx): Promise<Look> {
  const rows = await ctx.stats.lengthRates();
  // A hero's games of one length group are summed over its length bins.
  const group = (position: number, inGroup: (minute: number) => boolean): Scored[] => {
    const sums = new Map<number, { matches: number; wins: number }>();
    for (const row of rows) {
      if (row.position !== position || !inGroup(row.minute)) continue;
      const own = sums.get(row.heroId) ?? { matches: 0, wins: 0 };
      sums.set(row.heroId, { matches: own.matches + row.matches, wins: own.wins + row.wins });
    }
    return [...sums]
      .filter(([, each]) => each.matches >= MIN_LENGTH_MATCHES)
      .map(([heroId, each]) => ({ heroId, value: rate(each.matches, each.wins) }));
  };
  const columns: Column[] = POSITIONS.map((position) => {
    const short = best(
      group(position, (minute) => minute < SHORT_MINUTES),
      PER_ROLE / 2
    );
    const taken = new Set(short.map((each) => each.heroId));
    const long = best(
      group(position, (minute) => minute >= LONG_MINUTES).filter((each) => !taken.has(each.heroId)),
      PER_ROLE / 2
    );
    return [
      { group: 'До 30 минут' },
      ...tilesOf(ctx, short, pct),
      { group: 'После 50 минут' },
      ...tilesOf(ctx, long, pct)
    ];
  });
  for (const [index, column] of columns.entries()) {
    if (column.length < PER_ROLE + 2) throw noData(`игры по длине: ${ROLES[index]}`);
  }
  return { title: '<b>Лучшие</b><br>в коротких<br>и долгих<br>играх', columns };
}

async function bansLook(ctx: Ctx): Promise<Look> {
  const bans = await ctx.stats.banRates();
  const positions = await ctx.stats.positions();
  const roleOf = mainRole(positions);
  // Ten players a match: the games counted are a tenth of the heroes' pick counts.
  const games = bans.reduce((sum, each) => sum + each.matches, 0) / 10;
  if (games === 0) throw noData('bans');
  const columns = POSITIONS.map((position) =>
    full(
      `баны: ${ROLES[position - 1]}`,
      tilesOf(
        ctx,
        best(
          bans
            .filter((each) => roleOf.get(each.heroId) === position)
            .map((each) => ({ heroId: each.heroId, value: (each.bans / games) * 100 })),
          PER_ROLE
        ),
        pct
      )
    )
  );
  return { title: 'Кого<br>чаще всех<br><b>банят</b>', columns };
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
.grp{height:44px;flex:none;border-radius:8px;background:#f1ebe0;display:flex;align-items:center;justify-content:center;gap:4px;
font-family:Oswald,sans-serif;font-weight:700;font-size:28px;line-height:1;text-transform:uppercase;color:#0b0c0e;white-space:nowrap;overflow:hidden}
.grp img{width:40px;height:40px;margin-left:-6px;flex:none}
.tile{flex:1 1 0;min-height:0;border-radius:8px;overflow:hidden;background:#0b0c0e;display:flex;flex-direction:column;position:relative}
.tile img{flex:1 1 0;min-height:0;width:100%;object-fit:cover;object-position:50% 30%;display:block}
.num{height:38px;flex:none;display:flex;align-items:center;justify-content:center;font-family:Oswald,sans-serif;font-weight:700;
font-size:34px;line-height:1;font-variant-numeric:tabular-nums;color:#fff;background:#0b0c0e}
.tri{width:.62em;height:.56em;margin-right:.14em;fill:currentColor;flex:none}
.up,.down{display:inline-flex;align-items:center}.down{color:#ff5a3c}
.tile.fall img{filter:grayscale(.85) brightness(.8)}`;
// The title starts at 150 px and shrinks until its widest line fits the left block and the whole block fits the height;
// group bars shrink their own text until it fits the tile width.
const FIT = `<script>document.fonts.ready.then(()=>{const l=document.querySelector('.left'),t=l.firstElementChild;
const h=()=>[...l.children].reduce((a,c)=>a+c.getBoundingClientRect().height,0)+40*(l.children.length-1);
let s=150;t.style.fontSize=s+'px';while((t.getBoundingClientRect().width>420||h()>640)&&s>60){s-=2;t.style.fontSize=s+'px'}
for(const e of document.querySelectorAll('.grp')){let f=parseFloat(getComputedStyle(e).fontSize);
while(e.scrollWidth>e.clientWidth&&f>16){f-=1;e.style.fontSize=f+'px'}}})</script>`;
const FONT = `<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@700&amp;display=block&amp;subset=cyrillic" rel="stylesheet">`;

const tileHtml = (tile: Tile) =>
  `<div class="tile${tile.fall === true ? ' fall' : ''}"><img src="${heroPortraitImage(`npc_dota_hero_${tile.hero}`)}" alt=""><div class="num">${tile.num}</div></div>`;

function lookPage(look: Look): string {
  const medal = look.medal === undefined ? '' : `<img class="medal" src="${rankMedalImage(look.medal)}" alt="">`;
  const columns = look.columns
    .map(
      (column, index) =>
        `<div class="col"><div class="tab">${escapeHtml(ROLES[index] ?? '')}</div>${column
          .map((cell) =>
            'group' in cell
              ? `<div class="grp">${cell.medal === undefined ? '' : `<img src="${rankMedalImage(cell.medal)}" alt="">`}${escapeHtml(cell.group)}</div>`
              : tileHtml(cell)
          )
          .join('')}</div>`
    )
    .join('');
  return picturePage(
    `${FONT}<div class="left"><div class="title">${look.title}</div>${medal}</div>${FIT}<div class="grid">${columns}</div>`,
    CSS
  );
}

type LookName = 'best' | 'worst' | 'easy' | 'swing' | 'ranks' | 'lane' | 'length' | 'bans';
const LOOKS: readonly LookName[] = ['best', 'worst', 'easy', 'swing', 'ranks', 'lane', 'length', 'bans'];
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
    case 'lane':
      return laneLook(ctx);
    case 'length':
      return lengthLook(ctx);
    case 'bans':
      return bansLook(ctx);
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
  const name = pick(LOOKS, context.random);
  try {
    const look = await buildLook(name, ctx, context.random);
    return { picture: { html: lookPage(look), ...PICTURE_SIZE }, text: '', ownText: true, poll: null };
  } catch (error) {
    const code = codeOf(error);
    if (code === 'STRATZ_TOKEN' || code === 'STRATZ_BLOCKED' || code === 'STRATZ_RATE') throw error;
    throw noData(`вид «${name}» (${code === 'UNAVAILABLE' ? reasonOf(error) : code})`);
  }
}
