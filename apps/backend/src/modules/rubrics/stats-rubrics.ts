import {
  BUILD_SAMPLE_MIN,
  fallbackPurchases,
  guideFromSample,
  lengthWinRatesFromBins,
  matchupRows,
  medianMinutes,
  OPENDOTA_MATCHUP_MIN_MATCHES,
  neutralPicks,
  sampleNeutrals,
  pairTalents,
  rankPurchases,
  roleOf,
  splitBuild,
  startItems,
  talentRows,
  GUIDE_DAYS
} from './guide-data';
import { type RubricNote } from './degradations';
import { type GuideItem, guideAltPicture, guideItemsPicture, guidePicture, type HeroGuideCard } from './guide-pictures';
import { PICTURE_SIZE } from './picture';
import { type PatchOutcome, patchOutcomes } from './patch-rubrics';
import { NERF_LOOKS, nerfQuestionPicture, nerfResultPicture } from './nerf-pictures';
import { VERSUS_LOOKS, VERSUS_TITLES, versusPicture } from './versus-pictures';
import {
  type FallbackStatsSource,
  type StatsSource,
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

const STRETCHES = ['до 35 минут', 'от 35 до 50 минут', 'после 50 минут'];
const ROLE_NAMES = { carry: 'керри', mid: 'мид', offlane: 'оффлейн', support: 'саппорт' } as const;

// «Гайд на героя»: one card (and a second slide for an alternative build) from the hero's own numbers at its main
// position. The build, the starting set, the skill order and the alternative are counted from a sample of the hero's
// individual matches at that position (STRATZ `heroStats.guide`), the way Dota2ProTracker does; talents, neutrals,
// matchups and win rate by length are STRATZ's aggregates. Every STRATZ read is one call after another and every block
// is optional: a read that fails or comes back thin leaves its block out of the card and puts a line, with its error
// code, in the owner's notes; only the core build is required.
const GUIDE_POPULAR = 30;
/** The base's games of a hero at a position the guide counts from instead of STRATZ's sample. */
const BASE_MIN_GAMES = 150;
/** The newest games whose builds are counted: enough for the alternative's 15%, within the Free plan's CPU. */
const BASE_SAMPLE = 150;
/** Games against one opponent before it counts as a matchup. */
const BASE_MATCHUP_MIN = 25;
const BASE_DAYS = 14;

/** The base's games as matchup rows: per opponent, the games against it and the wins. */
function enemyRows(games: { won: boolean; enemies: number[] }[]): { heroId: number; matches: number; wins: number }[] {
  const rows = new Map<number, { heroId: number; matches: number; wins: number }>();
  for (const game of games)
    for (const heroId of game.enemies) {
      const row = rows.get(heroId) ?? { heroId, matches: 0, wins: 0 };
      row.matches += 1;
      if (game.won) row.wins += 1;
      rows.set(heroId, row);
    }
  return [...rows.values()];
}

const codeOf = (error: unknown) =>
  error instanceof Error && 'code' in error ? String((error as { code: unknown }).code) : 'ошибка';

export async function heroGuide(context: RubricContext): Promise<RubricSample> {
  const popular = (await shares(context, 7)).sort((a, b) => b.pickRate - a.pickRate).slice(0, GUIDE_POPULAR);
  const hero = pick(popular, context.random).hero;
  const stats = needStats(context);
  const positionRows = await stats.positions();
  const position = mainPositions(positionRows).get(hero.id)?.position;
  if (position === undefined) throw noData('hero positions');
  const [known, heroes] = await Promise.all([context.sources.items(), context.sources.heroes()]);
  const items = new Map(known.map((item) => [item.id, item]));
  const notes: RubricNote[] = [];
  const note = (code: RubricNote['code'], text: string) => notes.push({ code, text });
  // A block OpenDota can stand in for fails quietly: its note is written once the fallback has had its turn.
  const failures = new Map<string, string>();
  const attempt = async <T>(block: string, read: () => Promise<T>, quiet = false): Promise<T | null> => {
    try {
      return await read();
    } catch (error) {
      // The error's code tells a wrong STRATZ argument (STRATZ_SHAPE) from a refusal or a timeout.
      const code = codeOf(error);
      if (quiet) failures.set(block, code);
      else note('GUIDE_BLOCK_MISSING', `Нет данных: ${block} (${code})`);
      return null;
    }
  };
  const fallback = context.sources.fallback ?? null;
  const quiet = fallback !== null;
  const missing = (block: string, openDotaBlock = `${block} OpenDota`) => {
    const codes = [failures.get(block), failures.get(openDotaBlock)].filter((code) => code !== undefined);
    note('GUIDE_BLOCK_MISSING', `Нет данных: ${block}${codes.length === 0 ? '' : ` (${codes.join(', ')})`}`);
  };
  // One OpenDota read serves both the start items and the core.
  let popularity: Promise<Awaited<ReturnType<FallbackStatsSource['heroItemPopularity']>> | null> | undefined;
  const openDotaItems = () =>
    (popularity ??=
      fallback === null
        ? Promise.resolve(null)
        : attempt('предметы OpenDota', () => fallback.heroItemPopularity(hero.id), true));
  const detail = await attempt('способности и таланты', () => context.sources.heroDetail(hero.id));
  // Positions 4 and 5 buy cheap: their item floors are lower.
  const support = position >= 4;
  const levels =
    detail === null ? null : await attempt('уровни талантов', () => context.sources.talentLevels(hero.name));
  const talentList = detail === null ? [] : levels === null ? detail.talents : pairTalents(detail.talents, levels);

  // The bot's own base first (owner, 28.10.2026: «по любому герою»): every high-rank game of the hero at the position,
  // won and lost, so its win rate, builds, matchups and game lengths are the hero's own. Too few games there (the base
  // fills over two weeks) and STRATZ's winners-only sample stands in.
  const base = context.sources.heroMatches ?? null;
  const baseGames = base === null ? null : await attempt('своя база матчей', () => base.games(hero.id, position));
  const games = baseGames !== null && baseGames.length >= BASE_MIN_GAMES ? baseGames : null;
  if (baseGames !== null && games === null)
    note(
      'GUIDE_BASE_TOO_SMALL',
      `Своя база: ${baseGames.length} матчей на позиции, нужно ${BASE_MIN_GAMES}: данные STRATZ`
    );
  if (games !== null) note('INFO', `Своя база: ${games.length} матчей на позиции за 14 дней`);
  // The sample: with the purchases (minutes, the starting set); without them when STRATZ refuses that field.
  const sample = await attempt('выборка матчей', async () => {
    if (games !== null && base !== null) {
      const matches = await base.sample(hero.id, position, BASE_SAMPLE);
      return { fetched: matches.length, total: games.length, matches };
    }
    try {
      return await stats.heroGuideSample(hero.id, position, true);
    } catch (error) {
      if (codeOf(error) !== 'STRATZ_SHAPE') throw error;
      note('GUIDE_SOURCE_FALLBACK', 'Покупки по минутам не пришли (STRATZ_SHAPE): выборка без них');
      return await stats.heroGuideSample(hero.id, position, false);
    }
  });
  const counted = (fallbackMinutes?: Map<number, number>) =>
    sample === null
      ? null
      : guideFromSample({
          matches: sample.matches,
          items,
          detail,
          talents: talentList,
          support,
          ...(fallbackMinutes === undefined ? {} : { fallbackMinutes })
        });
  let built = counted();
  // STRATZ's per-minute purchase totals at the position: read once, for missing minutes and the builds' win rates.
  let purchaseTotals: Promise<Awaited<ReturnType<StatsSource['heroPositionPurchases']>> | null> | undefined;
  const totals = () =>
    (purchaseTotals ??= attempt('покупки на позиции', () => stats.heroPositionPurchases(hero.id, position)));
  if (built !== null && built.core.some((item) => item.minute === undefined)) {
    // Buyers' times missing: the order and the minutes come from STRATZ's per-minute totals.
    const rows = await totals();
    if (rows !== null) built = counted(medianMinutes(rows));
  }
  if (sample !== null) {
    note(
      'INFO',
      `Выборка: ${sample.matches.length} матчей на позиции ${position} из ${sample.fetched}, окно ${built?.days ?? '?'} дн.` +
        (built === null ? ` (мало для сборки: нужно ${BUILD_SAMPLE_MIN})` : `, посчитано ${built.matches}`)
    );
    if (sample.matches.length === 0 && sample.positions !== undefined)
      note(
        'INFO',
        `Позиции в ответе STRATZ: ${
          Object.entries(sample.positions)
            .map(([name, count]) => `${name}×${count}`)
            .join(', ') || 'нет'
        }`
      );
  }

  let core: GuideItem[] = built?.core ?? [];
  let situational: GuideItem[] = built?.situational ?? [];
  if (core.length === 0) {
    // No usable sample: the per-item totals (and OpenDota behind them) give the build.
    const purchases = await attempt('предметы', () => stats.heroPositionPurchases(hero.id, position), quiet);
    if (purchases !== null) ({ core, situational } = splitBuild(rankPurchases(purchases, items, support)));
    if (core.length > 0) note('GUIDE_SOURCE_FALLBACK', 'Предметы — суммы по предметам, не по матчам');
    if (core.length === 0 && fallback !== null) {
      const bought = await openDotaItems();
      const fromOpenDota =
        bought === null ? null : splitBuild(rankPurchases(fallbackPurchases(bought), items, support));
      if (fromOpenDota !== null && fromOpenDota.core.length > 0) {
        // No minutes: OpenDota counts stretches of the match, not buy times.
        core = fromOpenDota.core.map((item) => ({ key: item.key }));
        situational = fromOpenDota.situational;
        note('GUIDE_SOURCE_FALLBACK', 'Предметы — из OpenDota (без минут покупки)');
      }
    }
    if (core.length === 0) throw noData('hero purchases');
  }

  let start = built?.start ?? [];
  if (start.length === 0) {
    if (built !== null)
      note(
        'GUIDE_BLOCK_MISSING',
        `Нет данных: стартовый набор из матчей (${built.withPurchases ? 'ни один набор не повторился' : 'покупки не пришли'})`
      );
    const startRows = await attempt('стартовый закуп', () => stats.heroStartingItems(hero.id, position), quiet);
    start = startRows === null ? [] : startItems(startRows, items);
    if (start.length === 0 && fallback !== null) {
      const bought = await openDotaItems();
      start = bought === null ? [] : startItems(bought.start, items);
      if (start.length > 0) note('GUIDE_SOURCE_FALLBACK', 'Стартовый закуп — из OpenDota');
    }
    if (start.length === 0 && (startRows !== null || quiet)) missing('стартовый закуп', 'предметы OpenDota');
  }
  const neutralRows = await attempt('нейтралки', () => stats.heroNeutralItems(hero.id, position));
  let neutrals = neutralRows === null ? [] : neutralPicks(neutralRows, items);
  if (neutrals.length === 0 && sample !== null) {
    neutrals = sampleNeutrals(sample.matches, items);
    if (neutrals.length > 0) note('GUIDE_SOURCE_FALLBACK', 'Нейтралки — из матчей выборки');
  }
  if (neutrals.length === 0 && neutralRows !== null)
    note(
      'GUIDE_BLOCK_MISSING',
      `Нет данных: нейтралки (STRATZ вернул ${neutralRows.length} строк, из них с уровнем ${neutralRows.filter((row) => row.tier !== null).length})`
    );

  const talentStats = await attempt('таланты', () => stats.heroTalents(hero.id, position));
  const talents = detail === null || talentStats === null ? [] : talentRows(talentList, talentStats);
  if (talents.length === 0 && detail !== null && talentStats !== null)
    note('GUIDE_BLOCK_MISSING', 'Нет данных: таланты');
  const order = built?.plan ?? null;
  if (built !== null && order === null && detail !== null)
    note('GUIDE_BLOCK_MISSING', 'Нет данных: прокачка (ни одна последовательность не повторилась или не видна ульта)');
  const heroById = new Map(heroes.map((each) => [each.id, each]));
  const versus = games !== null ? enemyRows(games) : await attempt('матчапы', () => stats.heroMatchups(hero.id), quiet);
  // The base's are the hero at its position against each opponent, like Dota2ProTracker's.
  let matchups = versus === null ? [] : matchupRows(versus, heroById, games === null ? undefined : BASE_MATCHUP_MIN);
  if (matchups.length === 0 && fallback !== null) {
    const rows = await attempt('матчапы OpenDota', () => fallback.heroMatchups(hero.id), true);
    matchups = rows === null ? [] : matchupRows(rows, heroById, OPENDOTA_MATCHUP_MIN_MATCHES);
    if (matchups.length > 0) note('GUIDE_SOURCE_FALLBACK', 'Матчапы — из OpenDota');
  }
  if (matchups.length === 0 && (versus !== null || quiet)) missing('матчапы');
  // Win rate by length from OpenDota alone: STRATZ's per-minute counts lean to wins (Techies: 76% under 35 minutes,
  // 49% on OpenDota, 28.10.2026).
  const bins =
    games !== null
      ? games.map((game) => ({ from: game.minutes * 60, matches: 1, wins: game.won ? 1 : 0 }))
      : fallback === null
        ? null
        : await attempt('винрейт по длине матча', () => fallback.heroDurations(hero.id));
  const byLength = bins === null ? null : lengthWinRatesFromBins(bins);
  if (bins !== null && byLength === null)
    note('GUIDE_BLOCK_MISSING', 'Нет данных: винрейт по длине матча (мало матчей)');

  const alt = built?.alt ?? null;
  if (built !== null && alt === null)
    note('GUIDE_BLOCK_MISSING', 'Нет данных: альтернативная сборка (нет другого набора в 15% матчей)');
  // The win rate at the position from STRATZ's counts by day, which agree with Dota2ProTracker (Techies support 50.7%
  // against its 50%, 28.10.2026). The sample holds winners only, and an item's buyers win more the later it comes
  // (55.7% for Techies), so neither tells how a build does.
  const days =
    games !== null
      ? null
      : await attempt('винрейт на позиции', () => stats.heroPositionDays(hero.id, position, GUIDE_DAYS));
  const played = games?.length ?? (days ?? []).reduce((sum, day) => sum + day.matches, 0);
  const won = games?.filter((game) => game.won).length ?? (days ?? []).reduce((sum, day) => sum + day.wins, 0);
  const ownRate =
    played === 0
      ? {}
      : {
          buildWinRate: won / played,
          buildMatches: played,
          buildRateOfRole: true,
          buildDays: games !== null ? BASE_DAYS : (days?.length ?? GUIDE_DAYS)
        };

  const card: HeroGuideCard = {
    hero: { name: hero.name, localizedName: hero.localizedName },
    role: roleOf(position),
    buildDays: GUIDE_DAYS,
    ...ownRate,
    // The alternative counts the newest games only: a popular hero's 150 span a few days, not the base's 14.
    ...(games !== null && built?.days != null ? { altDays: Math.max(1, built.days) } : {}),
    start,
    core,
    situational,
    neutrals,
    matchups,
    ...(byLength === null ? {} : { byLength }),
    abilities: order?.abilities ?? [],
    skills: order?.skills ?? [],
    ...(talents.length === 0 ? {} : { talents }),
    ...(alt === null ? {} : { alt }),
    ...(built === null || built.late.length === 0 ? {} : { late: built.late })
  };
  const itemName = (each: GuideItem) => known.find((item) => item.key === each.key)?.name ?? each.key;
  const heroNames = (sign: 1 | -1) =>
    matchups
      .filter((each) => Math.sign(each.delta) === sign)
      .map((each) => heroes.find((other) => other.name === each.hero.name)?.localizedName ?? '');
  const fears = heroNames(-1);
  const beats = heroNames(1);
  const strongest = byLength === null ? null : STRETCHES[byLength.indexOf(Math.max(...byLength))];
  // The carousel: the card, then the items in detail, then the alternative (owner, 27.10.2026).
  const slides = [guideItemsPicture(card), guideAltPicture(card)].filter((each) => each !== null);
  return {
    picture: guidePicture(card),
    ...(slides.length === 0 ? {} : { slides }),
    notes,
    text: `Гайд на ${hero.localizedName}: что покупать, как качать и кого бояться — всё на картинке.`,
    reference: [
      `${hero.localizedName}, роль: ${ROLE_NAMES[roleOf(position)]}.`,
      `Основа по порядку: ${core.map(itemName).join(', ')}.`,
      fears.length === 0 ? '' : `Тяжело против: ${fears.join(', ')}.`,
      beats.length === 0 ? '' : `Легко против: ${beats.join(', ')}.`,
      strongest === null ? '' : `Сильнее всего в играх ${strongest}.`,
      alt === null ? '' : `Есть вторая сборка: через ${alt.keyItem}.`
    ]
      .filter((line) => line !== '')
      .join('\n'),
    poll: null
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
const VALVE_DONT_CARE = [
  'Никого, Valve похуй',
  'Никого, Valve опять спит',
  'Valve похуй, они делают кейсы',
  'Никого, Габен в отпуске до следующего TI',
  'Понерфят меня, я на нём играю',
  'Всех, кроме того, кто реально имба, суки',
  'Понерфят Пуджа. Просто так, по традиции',
  'Того, кого я только выучил, блять',
  'Никого, бафнут ещё сильнее, Valve рофлят',
  'Рошана. Опять. Ему уже похуй, как и нам',
  'Мой винрейт. Он и так в жопе',
  'Никого, в Valve все на них и играют',
  'Стримеров. Героев оставят',
  'Никого, Valve пересчитывает бабки с арканы',
  'Твою мамку, а героев — нет'
] as const;

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
  'Никого не тронули: в Valve, видимо, все на них и играют.',
  'Никого не понерфили. Мы гадали, а Valve просто ушла бухать.',
  'Ноль нерфов. Вся наша ставка в помойке, как и баланс.',
  'Никого не тронули. Valve решила, что 56% — это нормально. Ну окей, блять.',
  'Нерфов нет. Зато новый сет на Пуджа за три косаря. Спасибо, Габен, сука.',
  'Ни одного нерфа. В Valve их тоже пикают, это теперь доказано.',
  'Никого не понерфили. Мы проиграли ставку, Valve выиграла бабки.',
  'Никого не тронули. Ждём следующий патч, ничего не ожидая и всех ненавидя.',
  'Нерфов ноль. Имба осталась имбой, а ты остался на Рекрутах.',
  'Никого. Valve, вы там вообще в доту играете или только в бухгалтерию?',
  'Никого не тронули. Кто ставил на нерф — идите нахуй вместе со мной.',
  'Ноль нерфов. Баланс по-вальвовски: тихо, с похуизмом и за ваши деньги.',
  'Никого не понерфили. Пикаем их дальше и ноем дальше, вы знаете правила.'
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
