import { AppError } from '../../shared/app-error';
import { heroImage, PICTURE_SIZE, picturePage } from './picture';
import { type PatchOutcome, patchOutcomes } from './patch-rubrics';
import { NERF_LOOKS, nerfQuestionPicture, nerfResultPicture } from './nerf-pictures';
import { VERSUS_LOOKS, VERSUS_TITLES, versusPicture } from './versus-pictures';
import {
  type HeroInfo,
  type ItemInfo,
  needStats,
  noData,
  percent,
  pick,
  poll,
  type RubricContext,
  type RubricSample,
  shuffled,
  withJoke
} from './types';

// Rubrics over pick and win rates by rank (STRATZ, once its token is set). Without it each answers
// STATS_NOT_CONFIGURED, so the studio shows what is waiting for the token.

const RANKS: Record<number, { name: string; on: string }> = {
  1: { name: 'Рекрут', on: 'Рекрутах' },
  2: { name: 'Страж', on: 'Стражах' },
  3: { name: 'Рыцарь', on: 'Рыцарях' },
  4: { name: 'Герой', on: 'Героях' },
  5: { name: 'Легенда', on: 'Легендах' },
  6: { name: 'Властелин', on: 'Властелинах' },
  7: { name: 'Божество', on: 'Божествах' },
  8: { name: 'Титан', on: 'Титанах' }
};
const BRACKETS = [1, 2, 3, 4, 5, 6, 7, 8];
const rank = (bracket: number) => RANKS[bracket] ?? { name: 'ранг', on: 'ранге' };

interface Share {
  hero: HeroInfo;
  matches: number;
  pickRate: number;
  winRate: number;
}

async function shares(context: RubricContext, bracket: number): Promise<Share[]> {
  const [stats, heroes] = await Promise.all([needStats(context).heroBracketStats(bracket), context.sources.heroes()]);
  const byId = new Map(heroes.map((hero) => [hero.id, hero]));
  const total = stats.reduce((sum, each) => sum + each.matches, 0);
  if (total === 0) throw noData('bracket stats');
  return stats
    .map((each) => ({
      hero: byId.get(each.heroId),
      matches: each.matches,
      // Ten heroes a match: a hero's share of matches is ten times its share of picks.
      pickRate: (each.matches / total) * 10,
      winRate: each.matches === 0 ? 0 : each.wins / each.matches
    }))
    .filter((each): each is Share => each.hero !== undefined);
}

export async function forgottenHero(context: RubricContext): Promise<RubricSample> {
  const list = await shares(context, 7);
  const candidates = list.filter((each) => each.pickRate < 0.03 && each.winRate > 0.51 && each.matches >= 100);
  const hero = candidates.sort((a, b) => b.winRate - a.winRate)[0];
  if (hero === undefined) throw noData('heroes');
  return {
    picture: null,
    text: `🕸 Забытый герой: ${hero.hero.localizedName}.\nЕго берут в ${percent(hero.pickRate)} игр, а он выигрывает ${percent(hero.winRate)}. Почему вы его не пикаете? Пишите в комментарии.`,
    poll: null
  };
}

const TIERS = [
  { name: 'ЛЕГ', min: 0.53, color: 'var(--tier-s)' },
  { name: 'НОРМ', min: 0.5, color: 'var(--tier-a)' },
  { name: 'НОЛЬ', min: 0.47, color: 'var(--tier-b)' },
  { name: 'РАК', min: 0, color: 'var(--tier-c)' }
];

export async function tierList(context: RubricContext): Promise<RubricSample> {
  const bracket = pick(BRACKETS, context.random);
  const list = (await shares(context, bracket)).filter((each) => each.matches >= 500);
  const rows = TIERS.map((tier, index) => {
    const upper = index === 0 ? Number.POSITIVE_INFINITY : (TIERS[index - 1]?.min ?? 1);
    const heroes = list
      .filter((each) => each.winRate >= tier.min && each.winRate < upper)
      .sort((a, b) => b.pickRate - a.pickRate)
      .slice(0, 6);
    return { tier, heroes };
  });
  const html = picturePage(
    `<div class="title">Тир-лист на <b>${rank(bracket).on}</b></div><div class="tiers">${rows
      .map(
        (row) => `<div class="tier"><div class="label" style="background:${row.tier.color}">${row.tier.name}</div>
${row.heroes.map((each) => `<img class="portrait small" src="${heroImage(each.hero.name)}" alt="">`).join('')}</div>`
      )
      .join('')}</div>`,
    `.tiers{display:flex;flex-direction:column;gap:12px;margin-top:28px}
.tier{display:flex;align-items:center;gap:12px}
.label{width:150px;height:88px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:34px;color:#0b0e13}
.portrait.small{width:156px;height:88px;border-width:2px}`
  );
  return {
    picture: { html, ...PICTURE_SIZE },
    text: `Тир-лист на ${rank(bracket).on} по реальному винрейту: лег, норм, ноль и рак.\nСогласен? Кого бы переставил — в комментарии.`,
    poll: null
  };
}

async function lateBuild(context: RubricContext, heroId: number, items: Map<number, ItemInfo>): Promise<ItemInfo[]> {
  const ids = await needStats(context).heroLateItems(heroId);
  return ids
    .map((id) => items.get(id))
    .filter((item): item is ItemInfo => item !== undefined && item.cost >= 2000)
    .slice(0, 6);
}

// «Кто кого перебьёт?» (owner, 27.10.2026): two heroes face to face, the picture alone — no text, no poll, no answer:
// «пусть люди сами в комментах спорят». Half the time their real late builds; half a joke, and a smart one (owner: «не
// просто все 6 одинаковых… вич доктор с радиком»): a role swap, a hero's own meme, a beggar against a rich man, or an
// absurd set.
type Build = { key: string }[];
const items = (...keys: string[]): Build => keys.map((key) => ({ key }));
const SIX = (key: string) => items(key, key, key, key, key, key);
/** What a support carries: wards, dust, smoke, saves and auras. */
const SUPPORT_KITS: readonly Build[] = [
  items('ward_observer', 'ward_sentry', 'dust', 'smoke_of_deceit', 'tango', 'flask'),
  items('arcane_boots', 'glimmer_cape', 'force_staff', 'mekansm', 'guardian_greaves', 'ward_observer')
];
/** A broke support's whole inventory late in the game (owner, 27.10.2026: «шаман с танго, арканами… нищий»). */
const POOR_SUPPORT = items('tango', 'arcane_boots', 'branches', 'ward_observer', 'magic_stick', 'wind_lace');
const CHEAP = items('branches', 'tango', 'boots', 'magic_stick', 'faerie_fire', 'enchanted_mango');
const RICH = items('rapier', 'greater_crit', 'heart', 'butterfly', 'skadi', 'abyssal_blade');
const ABSURD: readonly Build[] = [
  items('phase_boots', 'power_treads', 'arcane_boots', 'tranquil_boots', 'travel_boots', 'guardian_greaves'),
  items('hand_of_midas', 'branches', 'branches', 'branches', 'branches', 'branches'),
  SIX('rapier'),
  SIX('tango'),
  SIX('recipe')
];
/** A hero's own running joke (owner, 27.10.2026; more from the community's meme builds). */
const HERO_MEMES: Record<string, Build> = {
  npc_dota_hero_pudge: items('blink', 'dagon_5', 'dagon_5', 'dagon_5', 'dagon_5', 'dagon_5'),
  npc_dota_hero_antimage: SIX('bfury'),
  npc_dota_hero_techies: SIX('rapier'),
  npc_dota_hero_witch_doctor: items('radiance', 'hand_of_midas', 'butterfly', 'greater_crit', 'satanic', 'rapier'),
  npc_dota_hero_crystal_maiden: items('radiance', 'butterfly', 'greater_crit', 'satanic', 'skadi', 'rapier'),
  // Sunder and a Dagon one-shot (Sportskeeda, «best meme builds», 7.36).
  npc_dota_hero_terrorblade: items('armlet', 'blink', 'silver_edge', 'dagon_5', 'black_king_bar', 'ultimate_scepter'),
  // A mid hero that never left the fountain's shopping list.
  npc_dota_hero_invoker: items('ward_observer', 'tango', 'branches', 'magic_stick', 'boots', 'tpscroll')
};
type Side = { hero: HeroInfo; items: Build };
type JokeKind = 'role_swap' | 'poor_support' | 'hero_meme' | 'beggar_rich' | 'absurd';
const JOKE_KINDS: readonly JokeKind[] = ['role_swap', 'poor_support', 'hero_meme', 'beggar_rich', 'absurd'];

async function versusSides(context: RubricContext, heroes: HeroInfo[], known: Map<number, ItemInfo>) {
  const realBuild = async (hero: HeroInfo) =>
    (await lateBuild(context, hero.id, known)).map((item) => ({ key: item.key }));
  const carries = shuffled(
    heroes.filter((hero) => hero.roles.includes('Carry')),
    context.random
  );
  const supports = shuffled(
    heroes.filter((hero) => hero.roles.includes('Support') && !hero.roles.includes('Carry')),
    context.random
  );
  const [carry, other] = carries;
  if (carry === undefined || other === undefined) throw noData('carries');
  if (context.random() < 0.5)
    return [
      { hero: carry, items: await realBuild(carry) },
      { hero: other, items: await realBuild(other) }
    ] satisfies [Side, Side];
  const kind = pick(JOKE_KINDS, context.random);
  if (kind === 'role_swap') {
    // The support gets the carry's real late build, the carry a support's kit.
    const support = supports[0];
    if (support === undefined) throw noData('supports');
    return [
      { hero: support, items: await realBuild(carry) },
      { hero: carry, items: pick(SUPPORT_KITS, context.random) }
    ] satisfies [Side, Side];
  }
  if (kind === 'poor_support') {
    // A carry with full slots against a support who still lives on tango.
    const support = supports[0];
    if (support === undefined) throw noData('supports');
    return [
      { hero: carry, items: await realBuild(carry) },
      { hero: support, items: POOR_SUPPORT }
    ] satisfies [Side, Side];
  }
  if (kind === 'hero_meme') {
    const memes = shuffled(
      heroes.filter((hero) => HERO_MEMES[hero.name] !== undefined),
      context.random
    );
    const [first, second] = memes;
    if (first === undefined || second === undefined) throw noData('meme heroes');
    return [
      { hero: first, items: HERO_MEMES[first.name] ?? [] },
      { hero: second, items: HERO_MEMES[second.name] ?? [] }
    ] satisfies [Side, Side];
  }
  if (kind === 'beggar_rich')
    return [
      { hero: carry, items: CHEAP },
      { hero: other, items: RICH }
    ] satisfies [Side, Side];
  const [first, second] = shuffled(ABSURD, context.random);
  return [
    { hero: carry, items: first ?? CHEAP },
    { hero: other, items: second ?? RICH }
  ] satisfies [Side, Side];
}

export async function whoBeatsWhom(context: RubricContext): Promise<RubricSample> {
  const [heroes, itemList] = await Promise.all([context.sources.heroes(), context.sources.items()]);
  const known = new Map(itemList.map((item) => [item.id, item]));
  const [a, b] = await versusSides(context, heroes, known);
  if (a.items.length < 6 || b.items.length < 6) throw noData('builds');
  const look = pick(VERSUS_LOOKS, context.random);
  return {
    picture: {
      html: versusPicture(look, a, b, pick(VERSUS_TITLES, context.random)),
      ...PICTURE_SIZE
    },
    text: '',
    ownText: true,
    poll: null
  };
}

// «Криминальная хроника» (owner, 27.10.2026): the week's record of per-match averages told as a tabloid crime note;
// each record has its «статья».
const RECORDS = [
  {
    crime: 'отмывание золота в особо крупных размерах',
    value: (row: Average) => row.networth,
    unit: 'золота к концу игры',
    digits: 0
  },
  {
    crime: 'причинение тяжких телесных',
    value: (row: Average) => row.heroDamage,
    unit: 'урона по героям за игру',
    digits: 0
  },
  { crime: 'серийные убийства', value: (row: Average) => row.kills, unit: 'убийств за игру', digits: 1 },
  { crime: 'систематическая сдача себя врагу', value: (row: Average) => row.deaths, unit: 'смертей за игру', digits: 1 }
];
type Average = { heroId: number; matches: number; networth: number; heroDamage: number; kills: number; deaths: number };

export async function crimeNews(context: RubricContext): Promise<RubricSample> {
  const [rows, heroes] = await Promise.all([needStats(context).averages(), context.sources.heroes()]);
  const record = pick(RECORDS, context.random);
  const best = rows.filter((row) => row.matches >= 500).sort((a, b) => record.value(b) - record.value(a))[0];
  const hero = heroes.find((each) => each.id === best?.heroId);
  if (best === undefined || hero === undefined) throw noData('averages');
  const value =
    record.digits === 0
      ? Math.round(record.value(best)).toLocaleString('ru-RU')
      : record.value(best).toFixed(record.digits).replace('.', ',');
  return {
    picture: null,
    text: `Задержан ${hero.localizedName}. Статья: ${record.crime}.\nВ среднем ${value} ${record.unit} на Божествах и Титанах за неделю — больше всех героев.`,
    poll: null
  };
}

// «Что брать рекруту» (owner, 27.10.2026): the newbie author's side, «бери и побеждай» — the heroes that win most on
// Рекрут with enough matches to trust.
const RECRUIT_MIN_MATCHES = 500;
const RECRUIT_TOP = 5;

export async function recruitPicks(context: RubricContext): Promise<RubricSample> {
  const top = (await shares(context, 1))
    .filter((each) => each.matches >= RECRUIT_MIN_MATCHES)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, RECRUIT_TOP);
  if (top.length < 3) throw noData('recruit heroes');
  return {
    picture: null,
    text: [
      'Кого брать на Рекрутах, чтобы побеждать:',
      ...top.map((each) => `${each.hero.localizedName} — ${percent(each.winRate)} побед`)
    ].join('\n'),
    poll: null
  };
}

// «Гайд на героя» (owner, 27.10.2026): a popular hero's build by stage from what players really buy — the start
// (bought before the horn or in the first minute), the core (10–25 minutes, the bigger items) and the late game.
const GUIDE_POPULAR = 30;
const GUIDE_ITEMS_MAX = 5;

/** Items bought in the rows, most matches first, each once. */
function topItems(rows: { itemId: number; matches: number }[], items: Map<number, ItemInfo>): ItemInfo[] {
  const totals = new Map<number, number>();
  for (const row of rows) totals.set(row.itemId, (totals.get(row.itemId) ?? 0) + row.matches);
  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .map(([itemId]) => items.get(itemId))
    .filter((item): item is ItemInfo => item !== undefined);
}

export async function heroGuide(context: RubricContext): Promise<RubricSample> {
  const popular = (await shares(context, 7)).sort((a, b) => b.pickRate - a.pickRate).slice(0, GUIDE_POPULAR);
  const hero = pick(popular, context.random).hero;
  const known = new Map((await context.sources.items()).map((item) => [item.id, item]));
  // One stats call after another: the bridge serialises them anyway, and a burst got STRATZ_BLOCKED (27.10.2026).
  const purchases = await needStats(context).heroPurchases(hero.id);
  const late = await lateBuild(context, hero.id, known);
  const start = topItems(
    purchases.filter((row) => row.minute <= 1),
    known
  ).slice(0, GUIDE_ITEMS_MAX);
  const core = topItems(
    purchases.filter((row) => row.minute >= 10 && row.minute <= 25),
    known
  )
    .filter((item) => item.cost >= 1000)
    .slice(0, GUIDE_ITEMS_MAX);
  const coreKeys = new Set(core.map((item) => item.key));
  const lateOnly = late.filter((item) => !coreKeys.has(item.key)).slice(0, GUIDE_ITEMS_MAX);
  if (start.length === 0 || core.length === 0 || lateOnly.length === 0) throw noData('hero purchases');
  const names = (list: ItemInfo[]) => list.map((item) => item.name).join(', ');
  return {
    picture: null,
    text: [
      `Гайд на ${hero.localizedName}: что покупают те, кто на нём побеждает.`,
      `Старт: ${names(start)}`,
      `Кор: ${names(core)}`,
      `Поздняя игра: ${names(lateOnly)}`
    ].join('\n'),
    poll: null
  };
}

// «Суд» (owner, 27.10.2026): a hero on trial with this week's numbers on Божество; the subscribers give the verdict.
const TRIAL_MIN_MATCHES = 500;
const TRIAL_JOKES = ['Расстрелять, патч не ждать', 'Судья тоже на нём играет', 'Мне похуй, я на Пудже'] as const;

export async function heroTrial(context: RubricContext): Promise<RubricSample> {
  const list = (await shares(context, 7)).filter((each) => each.matches >= TRIAL_MIN_MATCHES);
  const accused = pick(list, context.random);
  return {
    picture: null,
    text: `На скамье подсудимых — ${accused.hero.localizedName}.`,
    reference: `${accused.hero.localizedName} на Божествах за неделю: ${percent(accused.winRate)} побед, берут в ${percent(accused.pickRate)} игр, ${accused.matches.toLocaleString('ru-RU')} матчей.`,
    poll: poll('Приговор', withJoke(['Виновен — в нерф', 'Оправдан'], context.random, TRIAL_JOKES))
  };
}

type PositionRow = { heroId: number; position: number; matches: number; wins: number };

/** Each hero's main position by its own matches (STRATZ), not by the roles the game lists. */
function mainPositions(rows: PositionRow[]): Map<number, { position: number; share: number; total: number }> {
  const byHero = new Map<number, PositionRow[]>();
  for (const row of rows) byHero.set(row.heroId, [...(byHero.get(row.heroId) ?? []), row]);
  const main = new Map<number, { position: number; share: number; total: number }>();
  for (const [heroId, own] of byHero) {
    const total = own.reduce((sum, row) => sum + row.matches, 0);
    const top = [...own].sort((a, b) => b.matches - a.matches)[0];
    if (top !== undefined && total > 0) main.set(heroId, { position: top.position, share: top.matches / total, total });
  }
  return main;
}

const SIGNS: Record<number, string> = { 1: 'Керри', 2: 'Мидеры', 3: 'Хардлайнеры', 4: 'Четвёрки', 5: 'Пятёрки' };

export async function horoscope(context: RubricContext): Promise<RubricSample> {
  const stats = needStats(context);
  const [rows, positions, heroes] = await Promise.all([stats.twoWeeks(7), stats.positions(), context.sources.heroes()]);
  const main = mainPositions(positions);
  const weeks = [...new Set(rows.map((row) => row.week))].sort((a, b) => b - a);
  const [current, previous] = weeks;
  if (current === undefined || previous === undefined) throw noData('two weeks');
  const rate = (heroId: number, week: number) => {
    const row = rows.find((each) => each.heroId === heroId && each.week === week);
    return row === undefined || row.matches < 200 ? null : row.wins / row.matches;
  };
  const lines = [1, 2, 3, 4, 5]
    .map((position) => {
      const up = heroes
        .filter((hero) => main.get(hero.id)?.position === position)
        .map((hero) => {
          const now = rate(hero.id, current);
          const before = rate(hero.id, previous);
          return now === null || before === null ? null : { hero, delta: now - before };
        })
        .filter((each): each is { hero: HeroInfo; delta: number } => each !== null)
        .sort((a, b) => b.delta - a.delta)[0];
      if (up === undefined || up.delta <= 0) return null;
      const points = (up.delta * 100).toFixed(1).replace('.', ',');
      return `${SIGNS[position] ?? 'Все'}: звёзды за ${up.hero.localizedName} — +${points}% побед за неделю.`;
    })
    .filter((line): line is string => line !== null);
  if (lines.length === 0) throw noData('moves');
  return {
    picture: null,
    text: `🔮 Дота-гороскоп на неделю (Божества):\n${lines.join('\n')}`,
    poll: null
  };
}

/** Rubrics that still lack a data source. */
export function notBuiltYet(what: string): Promise<RubricSample> {
  return Promise.reject(
    new AppError('UNAVAILABLE', `The rubric has no data source yet: ${what}`, { reason: 'NOT_BUILT_YET' })
  );
}

// «Кого понерфят?» (owner, 27.10.2026: «эти герои слишком сильные — понерфят ли, или Valve вообще похуй»): a bet on the
// next patch. The heroes strongest this week over every rank together (owner, 27.10.2026: «просто без рангов») whose
// win rate also went up against the week before; neither the patch's buffs («Кто теперь имба?») nor one rank's plain
// meta («Мета по рангам», «Тир-лист») picks them.
const NERF_MIN_MATCHES = 2000;
const NERF_HEROES_MAX = 5;
/**
 * A rise is told only from half a percent (owner, 27.10.2026): over all ranks most heroes move by 0,1–0,2% a week, and
 * «прибавил 0,1%» read as a stretch.
 */
const shownGrowth = (growth: number) => growth >= 0.005;
const VALVE_DONT_CARE = ['Никого, Valve похуй', 'Никого, Valve опять спит', 'Valve похуй, они делают кейсы'] as const;

export async function whoGetsNerfed(context: RubricContext): Promise<RubricSample> {
  const stats = needStats(context);
  const [rows, heroes] = await Promise.all([
    // Every rank in one request: eight at once got STRATZ_BLOCKED (27.10.2026).
    stats.twoWeeks(null),
    context.sources.heroes()
  ]);
  const weeks = [...new Set(rows.map((row) => row.week))].sort((a, b) => b - a);
  const [current, previous] = weeks;
  if (current === undefined || previous === undefined) throw noData('two weeks');
  // Summed per hero and week, whether STRATZ returns one row per bracket or one for all.
  const week = (heroId: number, which: number) =>
    rows
      .filter((row) => row.heroId === heroId && row.week === which)
      .reduce((sum, row) => ({ matches: sum.matches + row.matches, wins: sum.wins + row.wins }), {
        matches: 0,
        wins: 0
      });
  const top = heroes
    .map((hero) => {
      const now = week(hero.id, current);
      const before = week(hero.id, previous);
      if (now.matches < NERF_MIN_MATCHES || before.matches < NERF_MIN_MATCHES) return null;
      const winRate = now.wins / now.matches;
      return { hero, winRate, growth: winRate - before.wins / before.matches };
    })
    .filter((each): each is { hero: HeroInfo; winRate: number; growth: number } => each !== null)
    .filter((each) => each.winRate > 0.5 && each.growth > 0)
    // By win rate alone, the same order as on the picture (owner's sample, 27.10.2026).
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, NERF_HEROES_MAX);
  if (top.length < 3) throw noData('strong rising heroes');
  // No arrow: the AI writer retells each line in words, the rich message makes no table of it.
  const lines = top.map(
    (each) =>
      `${each.hero.localizedName}: ${percent(each.winRate)} побед${shownGrowth(each.growth) ? `, за неделю винрейт вырос на ${percent(each.growth)}` : ''}`
  );
  const result = await patchOutcomes(
    context,
    top.map((each) => each.hero.id)
  );
  const verdicts = top.map((each) => ({ ...each, outcome: result.outcomes.get(each.hero.id) ?? 'untouched' }));
  // The question and its result keep one look; A and B take turns at random (owner, 27.10.2026).
  const look = pick(NERF_LOOKS, context.random);
  return {
    picture: { html: nerfQuestionPicture(look, top), ...PICTURE_SIZE },
    text: ['Эти герои сейчас слишком сильные:', ...lines].join('\n'),
    followUp: {
      afterMinutes: null,
      picture: { html: nerfResultPicture(look, verdicts, result.version), ...PICTURE_SIZE },
      text: nerfResultText(
        result.version,
        verdicts.map((each) => ({ name: each.hero.localizedName, outcome: each.outcome })),
        context.random
      )
    },
    poll: poll(
      'Кого понерфят в следующем патче?',
      withJoke(
        top.map((each) => each.hero.localizedName),
        context.random,
        VALVE_DONT_CARE
      )
    )
  };
}

const OUTCOME_WORDS: Record<PatchOutcome, string> = {
  nerfed: 'понерфили',
  buffed: 'апнули ещё сильнее',
  changed: 'переделали',
  untouched: 'не тронули'
};
const NOBODY_NERFED = [
  'Никого не понерфили. Valve, как обычно, похуй.',
  'Ноль нерфов. Valve смотрит на эти винрейты и кивает.',
  'Никого не тронули: в Valve, видимо, все на них и играют.'
] as const;

/** «Угадали?»: the second post, after the next patch — what Valve did to each hero of the bet. */
function nerfResultText(
  version: string,
  heroes: { name: string; outcome: PatchOutcome }[],
  random: () => number
): string {
  const nerfed = heroes.filter((each) => each.outcome === 'nerfed').length;
  const verdict =
    nerfed === 0
      ? pick(NOBODY_NERFED, random)
      : nerfed === heroes.length
        ? 'Порезали всех. Кто ставил на нерф — красавчик.'
        : `Понерфили ${nerfed} из ${heroes.length}. Кто угадал — красавчик.`;
  return [
    // The post stands alone (owner: never point to another post): the heroes are named, the bet is not.
    `Вышел патч ${version}. Что Valve сделала с самыми сильными героями:`,
    ...heroes.map((each) => `${each.name} — ${OUTCOME_WORDS[each.outcome]}`),
    verdict
  ].join('\n');
}
