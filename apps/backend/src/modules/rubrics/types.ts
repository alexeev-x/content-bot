import { AppError } from '../../shared/app-error';

// What a rubric sample reads and what it becomes. `app/` wires the sources: dotaconstants on GitHub (every hero and
// item), Valve's Russian datafeed (abilities, patch notes), Steam, the game-files tracker and, once its token is set,
// STRATZ for pick and win rates.

export type PrimaryAttr = 'str' | 'agi' | 'int' | 'all';

export interface HeroInfo {
  id: number;
  /** `npc_dota_hero_…`: names Valve's image. */
  name: string;
  localizedName: string;
  primaryAttr: PrimaryAttr;
  attackType: 'Melee' | 'Ranged';
  roles: string[];
  moveSpeed: number;
  attackRange: number;
  baseAttackTime: number;
  baseArmor: number;
  baseHealth: number;
  turnRate: number | null;
  legs: number;
  dayVision: number;
  nightVision: number;
  projectileSpeed: number;
}

export interface ItemInfo {
  id: number;
  key: string;
  name: string;
  cost: number;
  components: string[];
  /** 1–5 for a neutral item, else null. */
  neutralTier: number | null;
}

export interface AbilityDetail {
  id: number;
  key: string;
  name: string;
  isUltimate: boolean;
  cooldowns: number[];
  manaCosts: number[];
  /** `name` is Valve's value name (`damage`), `heading` its Russian label. */
  values: { name: string; heading: string; values: number[] }[];
}

/** A talent as Valve's text has it, `{s:bonus_radius}` placeholders unfilled; `bonuses` hold what it adds, by value name. */
export interface TalentDetail {
  id: number;
  key: string;
  name: string;
  bonuses: { name: string; value: number }[];
}

export interface HeroDetail {
  id: number;
  name: string;
  localizedName: string;
  abilities: AbilityDetail[];
  /** The eight talents: the level 10 pair first, then 15, 20 and 25. */
  talents: TalentDetail[];
}

export interface PatchNotes {
  version: string;
  timestamp: number;
  heroes: { heroId: number; notes: { abilityId: number | null; note: string }[] }[];
}

/** Pick and win counts of one hero in one rank bracket (1 Рекрут … 8 Титан). */
export interface HeroBracketStat {
  heroId: number;
  bracket: number;
  matches: number;
  wins: number;
}

/** One match of a guide sample: the player's own outcome, final inventory, buys and ability learning. */
export interface GuideMatch {
  victory: boolean;
  /** Match start, UTC seconds. */
  startedAt: number | null;
  /** STRATZ's game version (patch) id: grows with each patch. */
  patch: number | null;
  /** The match's length in minutes (the late-game inventories); null or absent when unknown. */
  minutes?: number | null;
  /** The six inventory slots at the end of the match. */
  items: number[];
  /** The neutral item slot at the end of the match. */
  neutral?: number | null;
  /** Every neutral item the slot held during the match (STRATZ's minute-by-minute inventory); absent when unknown. */
  neutralsHeld?: number[];
  /** Every purchase with its minute (negative: before the horn); null when the sample does not carry them. */
  purchases: { itemId: number; minute: number }[] | null;
  /** Every ability point spent. */
  abilities: { abilityId: number; time: number; level: number }[];
}

/** The matches STRATZ returned that were played at the asked position (`fetched`: every row it sent; `total`: all it holds). */
export interface GuideSample {
  fetched: number;
  total: number;
  matches: GuideMatch[];
  /** The positions the rows came with (`POSITION_4` → count), for the owner's note when none matched. */
  positions?: Record<string, number>;
}

export interface StatsSource {
  /** Every hero's matches and wins in the bracket over the last days. */
  heroBracketStats(bracket: number): Promise<HeroBracketStat[]>;
  /** A hero's most bought late items (item ids, most bought first). */
  heroLateItems(heroId: number): Promise<number[]>;
  /** A hero's item purchases by minute with the wins of those matches. */
  heroPurchases(heroId: number): Promise<{ itemId: number; minute: number; matches: number; wins: number }[]>;
  /** A hero's matches and wins at one position on each of the newest days counted. */
  heroPositionDays(
    heroId: number,
    position: number,
    days: number
  ): Promise<{ day: number; matches: number; wins: number }[]>;
  /** A hero's starting buys at a position (1–5). */
  heroStartingItems(
    heroId: number,
    position: number
  ): Promise<{ itemId: number; instance: number; matches: number; wins: number }[]>;
  /** A hero's item purchases by minute at a position. */
  heroPositionPurchases(
    heroId: number,
    position: number
  ): Promise<{ itemId: number; minute: number; matches: number; wins: number }[]>;
  /** The neutral items held at a position; `tier` is STRATZ's own (null when it names none). */
  heroNeutralItems(
    heroId: number,
    position: number
  ): Promise<{ itemId: number; tier: number | null; matches: number; wins: number }[]>;
  heroTalents(heroId: number, position: number): Promise<{ abilityId: number; matches: number; wins: number }[]>;
  /** A hero's matches and wins against each other hero. */
  heroMatchups(heroId: number): Promise<{ heroId: number; matches: number; wins: number }[]>;
  /** The hero's recent matches at one position, one row per match (the guide's sample). */
  heroGuideSample(heroId: number, position: number, withPurchases: boolean): Promise<GuideSample>;
  /** Every hero's matches and wins at one position for the last `weeks` weeks in a bracket (null: all), newest first. */
  positionWeeks(
    bracket: number | null,
    position: number,
    weeks: number
  ): Promise<{ heroId: number; week: number; matches: number; wins: number }[]>;
  /** Every hero's matches and wins by position and match length; `minute` is the length bin's start (Divine+). */
  lengthRates(
    position: number
  ): Promise<{ heroId: number; position: number; minute: number; matches: number; wins: number }[]>;
  /** Every hero's matches and wins by position 1–5. */
  positions(): Promise<{ heroId: number; position: number; matches: number; wins: number }[]>;
  /** Every hero's last two weeks in a bracket (null: every bracket together), newest first. */
  twoWeeks(bracket: number | null): Promise<{ heroId: number; week: number; matches: number; wins: number }[]>;
}

/** OpenDota's hero reads: the guide's fallback when STRATZ fails or comes back empty. Counts only, no minutes. */
export interface FallbackStatsSource {
  /** Item purchases by stretch of the match (item id → matches). */
  heroItemPopularity(heroId: number): Promise<{
    start: { itemId: number; matches: number }[];
    early: { itemId: number; matches: number }[];
    mid: { itemId: number; matches: number }[];
    late: { itemId: number; matches: number }[];
  }>;
  heroMatchups(heroId: number): Promise<{ heroId: number; matches: number; wins: number }[]>;
  /** Matches and wins by match length; `from` is the bin's start in seconds. */
  heroDurations(heroId: number): Promise<{ from: number; matches: number; wins: number }[]>;
}

export interface RubricSources {
  heroes(): Promise<HeroInfo[]>;
  items(): Promise<ItemInfo[]>;
  /** An item's own numbers from Valve by value name, or null when Valve has no such item (`item_blink`). */
  itemValues(itemKey: string): Promise<{ name: string; values: number[] }[] | null>;
  /** Valve's Russian item names keyed by `item_<key>`; absent in tests (the key shows instead). */
  itemNames?(): Promise<Map<string, string>>;
  heroDetail(heroId: number): Promise<HeroDetail>;
  patches(): Promise<{ version: string; timestamp: number }[]>;
  patchNotes(version: string): Promise<PatchNotes>;
  /** The newest Steam announcements of Dota 2 with their first picture. */
  steamNews(): Promise<{ title: string; text: string; imageUrl: string | null; publishedAt: number }[]>;
  /** The finds in the game's files committed since `since` (UTC ms), newest first, at most a few. */
  gameFinds(since: number): Promise<{ build: string; committedAt: number; note: string | null; text: string | null }[]>;
  /** A set rising in the Steam Workshop this week. */
  /** This week's trending Workshop sets, ids in trend order. */
  workshopTrendingIds(): Promise<string[]>;
  workshopItem(id: string): Promise<{
    title: string;
    previewUrl: string;
    url: string;
    screenshots: string[];
    /** The description's GIFs as MP4 clips. */
    clips: string[];
    /** The Workshop's tags; the hero's English name is one of them. */
    tags: string[];
  } | null>;
  /** A hero's talents with the tier the game puts them at (1–4: levels 10, 15, 20, 25), two to a tier. */
  talentLevels(heroName: string): Promise<{ name: string; level: number }[]>;
  /** Null until STRATZ_TOKEN is set. */
  stats: StatsSource | null;
  /** OpenDota through the stats bridge; null without the bridge. */
  fallback?: FallbackStatsSource | null;
  /** The bot's own base of high-rank matches (14 days); absent outside the Worker. */
  heroMatches?: HeroMatchSource | null;
  /** The horoscope's fortune-tellers so far this round; absent outside the Worker (any hero may come then). */
  tellers?: { used(): Promise<number[]>; remember(heroIds: number[]): Promise<void> } | null;
  /** The heroes of the last «Пидорок дня» winners (the next winner's hero differs); absent: any hero may come. */
  shameHeroes?: { used(): Promise<number[]>; remember(heroId: number): Promise<void> } | null;
  /** A rubric's own counter of turns (0, 1, 2…), kept between posts; absent outside the Worker. */
  turns?: { next(name: string): Promise<number> } | null;
}

/** The bot's own high-rank matches, one row per player, the last 14 days (migration 0116). */
export interface HeroMatchSource {
  /** Every game of the hero at the position: outcome, length in minutes and the opponents' hero ids. */
  games(heroId: number, position: number): Promise<{ won: boolean; minutes: number; enemies: number[] }[]>;
  /** The newest `limit` games of the hero at the position as guide matches (purchases, skills, items). */
  sample(heroId: number, position: number, limit: number): Promise<GuideMatch[]>;
  /**
   * Yesterday's worst lost games of players nobody follows (`[sinceMs, untilMs)`, the deadliest `limit`), the day's
   * match count and per-position medians. It never carries a player's account, a match id or a time (owner, 30.10.2026).
   */
  worstGames(
    sinceMs: number,
    untilMs: number,
    limit: number,
    wide?: boolean
  ): Promise<{
    dayMatches: number;
    games: ShameGame[];
    medians: { position: number; deaths: number; kills: number; assists: number; nw20: number | null }[];
  }>;
}

/** One lost game as «Пидорок дня» scores it: the hero, the position and the numbers, nobody's identity. */
export interface ShameGame {
  heroId: number;
  position: number;
  minutes: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number | null;
  nw20: number | null;
  lane: -1 | 0 | 1 | null;
  /** [item id, minute]. */
  purchases: [number, number][];
  /** Final items (item ids). */
  items: number[];
  /** The neutral item (id), when the player had one. */
  neutral: number | null;
  /** The four team-mates' net worth at 20 minutes. */
  allyNw20: { position: number; nw20: number }[];
  /** Damage of all ten players, the player's own included. */
  damages: number[];
}
export interface RubricSample {
  picture: { html: string; width: number; height: number } | null;
  /** Plain text: the caption under the picture, or the message itself. */
  text: string;
  /** The rubric is one poll message with the picture inside it: no text post, no AI caption. */
  pictureInPoll?: boolean;
  /** A source's own picture sent as its file, not drawn into a page (`picture` is then null). */
  photo?: { url: string };
  /** A source's own photos and video clips sent as one album, the caption on the first (`picture` is then null). */
  album?: {
    photos: string[];
    clips: string[];
    /** A still to open the album with when every photo turns out animated. */
    cover?: string;
  };
  /** Lines for the owner's sample only: what the rubric had to leave out. */
  notes?: string[];
  /** More pages of the same post: the picture and these are one carousel in one rich message. */
  slides?: { html: string; width: number; height: number }[];
  /** Links shown as words in the caption, never a bare address (owner, 27.10.2026: «ссылки прятать в текст»). */
  links?: { text: string; url: string }[];
  /** A fixed last line under the AI's caption, kept word for word (a reactions verdict). */
  footer?: string;
  /** Background for the AI writer that the caption need not repeat number by number. */
  reference?: string;
  /** The text is final as written (fixed captions): no AI caption. */
  ownText?: boolean;
  /** The image model puts this hero (Valve's render) into the picture's scene; the page shows it as `--scene`. */
  heroScene?: {
    renderUrl: string;
    heroName: string;
    /** Whose scene: «Анкета» (default), «Забытый герой» or «Подозреваемый». */ scene?:
      'anketa' | 'forgotten' | 'suspect';
  };
  /** «Гороскоп»: the model seats the fortune-teller and puts the ball's hero into the owner's scene. */
  fortuneScene?: { teller: { renderUrl: string; heroName: string }; ball: { renderUrl: string; heroName: string } };
  /** The post as a rich message (tables, bold, italics) in place of the plain text; `text` stays its plain form. */
  rich?: string;
  /** The rubric posts no picture at all, not even the drawn title scene (a text joke or a bare poll). */
  noPicture?: boolean;
  /** The text's first line is bold: a setup or a heading that must stand out in the feed. */
  boldLead?: boolean;
  /**
   * A second post of the rubric that follows the first after a while (e.g. a riddle's answer); `afterMinutes: null`
   * waits for the next patch, and the sample reads the latest one in its place.
   */
  followUp?: {
    afterMinutes: number | null;
    picture: { html: string; width: number; height: number } | null;
    text: string;
  };
  poll: {
    question: string;
    options: string[];
    type: 'regular' | 'quiz';
    correctOption: number | null;
    explanation: string | null;
  } | null;
}

export interface RubricContext {
  sources: RubricSources;
  random: () => number;
  now: number;
}

export function noData(what: string): AppError {
  return new AppError('UNAVAILABLE', `No data for the rubric: ${what}`, { reason: 'NO_DATA' });
}

export function pick<T>(list: readonly T[], random: () => number): T {
  const item = list[Math.floor(random() * list.length)];
  if (item === undefined) throw noData('empty list');
  return item;
}

export function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
  }
  return copy;
}

export const percent = (value: number) => `${(value * 100).toFixed(1).replace('.', ',')}%`;

export function needStats(context: RubricContext): StatsSource {
  if (context.sources.stats === null) {
    throw new AppError('UNAVAILABLE', 'STRATZ is not connected', { reason: 'STATS_NOT_CONFIGURED' });
  }
  return context.sources.stats;
}

export const quiz = (
  question: string,
  options: string[],
  correctOption: number,
  explanation: string
): RubricSample['poll'] => ({
  question: question.slice(0, 300),
  options: options.map((option) => option.slice(0, 100)),
  type: 'quiz',
  correctOption,
  explanation: explanation.slice(0, 200)
});

// A rubric's regular poll gets one joke option in the owner's own words (owner, 26.10.2026: «рубрики должны весёлые
// ещё быть», «только 1 из этого»). Never for a quiz: it would break the correct answer.
const JOKE_OPTIONS = [
  'Ой, да пошёл ты нахуй',
  'Нахуй мне эта инфа',
  'Ты что, уебан?',
  'Пиздёж',
  'У тебя хуй воняет',
  'Покажи член',
  'Мне похуй, я на Пудже',
  'Имба тут только я',
  'Удали доту'
] as const;

/** «Нерф или баф?»'s third option (owner, 26.10.2026: «не еби мозги, не заёбывай и т. д. в этом русле»). */
export const DONT_BOTHER_JOKES = [
  'Не еби мозги',
  'Не заёбывай',
  'Отъебись со своим патчем',
  'Да мне похуй, я на нём не играю',
  'Иди нахуй со своими цифрами'
] as const;

/** The options with one random joke option added at the end (the poll is shuffled for each voter). */
export const withJoke = (
  options: string[],
  random: () => number,
  jokes: readonly string[] = JOKE_OPTIONS
): string[] => [...options, jokes[Math.floor(random() * jokes.length)] ?? JOKE_OPTIONS[0]];

export const poll = (question: string, options: string[]): RubricSample['poll'] => ({
  question: question.slice(0, 300),
  options: options.map((option) => option.slice(0, 100)),
  type: 'regular',
  correctOption: null,
  explanation: null
});

/** «1 день», «3 дня», «5 дней». */
export function plural(value: number, one: string, few: string, many: string): string {
  const tens = Math.abs(value) % 100;
  const units = tens % 10;
  if (tens > 10 && tens < 20) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
}
