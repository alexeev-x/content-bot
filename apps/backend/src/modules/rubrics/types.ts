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
}

export interface AbilityDetail {
  id: number;
  key: string;
  name: string;
  isUltimate: boolean;
  cooldowns: number[];
  manaCosts: number[];
  values: { heading: string; values: number[] }[];
}

export interface HeroDetail {
  id: number;
  name: string;
  localizedName: string;
  abilities: AbilityDetail[];
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

export interface StatsSource {
  /** Every hero's matches and wins in the bracket over the last days. */
  heroBracketStats(bracket: number): Promise<HeroBracketStat[]>;
  /** A hero's most bought late items (item ids, most bought first). */
  heroLateItems(heroId: number): Promise<number[]>;
  /** A hero's item purchases by minute with the wins of those matches. */
  heroPurchases(heroId: number): Promise<{ itemId: number; minute: number; matches: number; wins: number }[]>;
  /** A hero's matches still going at each minute and the wins among them. */
  heroTimeline(heroId: number): Promise<{ minute: number; remaining: number; wins: number }[]>;
  /** Every hero's matches and wins by position 1–5. */
  positions(): Promise<{ heroId: number; position: number; matches: number; wins: number }[]>;
  /** Every hero's last two weeks in a bracket, newest first. */
  twoWeeks(bracket: number): Promise<{ heroId: number; week: number; matches: number; wins: number }[]>;
  /** Every hero's per-match averages this week. */
  averages(): Promise<
    { heroId: number; matches: number; networth: number; heroDamage: number; kills: number; deaths: number }[]
  >;
}

export interface RubricSources {
  heroes(): Promise<HeroInfo[]>;
  items(): Promise<ItemInfo[]>;
  heroDetail(heroId: number): Promise<HeroDetail>;
  patches(): Promise<{ version: string; timestamp: number }[]>;
  patchNotes(version: string): Promise<PatchNotes>;
  /** The newest Steam announcements of Dota 2 with their first picture. */
  steamNews(): Promise<{ title: string; imageUrl: string | null; publishedAt: number }[]>;
  /** The newest builds of the game-files tracker: build number and changed paths; null without its token. */
  gameBuilds(): Promise<{ build: string; paths: string[]; committedAt: number }[]> | null;
  /** A set rising in the Steam Workshop this week. */
  workshopTrending(): Promise<{ title: string; previewUrl: string; url: string } | null>;
  /** Null until STRATZ_TOKEN is set. */
  stats: StatsSource | null;
}

export interface RubricSample {
  picture: { html: string; width: number; height: number } | null;
  /** Plain text: the caption under the picture, or the message itself. */
  text: string;
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

/** The options with one random joke option added at the end (the poll is shuffled for each voter). */
export const withJoke = (options: string[], random: () => number): string[] => [
  ...options,
  JOKE_OPTIONS[Math.floor(random() * JOKE_OPTIONS.length)] ?? JOKE_OPTIONS[0]
];

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
