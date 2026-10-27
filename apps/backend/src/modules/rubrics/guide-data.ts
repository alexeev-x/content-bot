import type { GuideAltBuild, GuideItem, GuideMatchup, GuideRole, GuideSwap, GuideTalentRow } from './guide-pictures';
import type { HeroDetail, HeroInfo, ItemInfo, TalentDetail } from './types';

// «Гайд на героя»: STRATZ's aggregates and Valve's texts turned into the card's blocks. Pure functions only; each one
// returns nothing (null or an empty list) when its data is too thin, and the card then leaves that block out.

/** The window STRATZ's hero statistics cover, in days (a week; UNVERIFIED against the live schema). */
export const GUIDE_DAYS = 7;

const ITEMS_MAX = 6;
/** A key item costs at least this much; cheaper buys (wand, boots, bracer) are not what a build turns on. */
// A support's whole build is cheap (Lich came with four core items and no situational ones, 27.10.2026): its floors
// are lower.
const CORE_MIN_COST = 1000;
const ALT_MIN_COST = 3000;
const SUPPORT_CORE_MIN_COST = 400;
const SUPPORT_ALT_MIN_COST = 1500;
const POOL = 30;
const MATCHUP_MIN_MATCHES = 300;
const TALENT_MIN_MATCHES = 50;
const LENGTH_MIN_MATCHES = 30;
const SAMPLE_MIN = 10;
const ALT_MIN_MATCHES = 100;
/** Every hero starts with a Town Portal Scroll; it says nothing about the build. */
const FREE_START = new Set(['tpscroll']);

type Counted = { matches: number; wins: number };

export function roleOf(position: number): GuideRole {
  if (position === 1) return 'carry';
  if (position === 2) return 'mid';
  if (position === 3) return 'offlane';
  return 'support';
}

/** The six most bought starting items (a second copy counts as another item), most bought first. */
export function startItems(rows: { itemId: number; matches: number }[], items: Map<number, ItemInfo>): GuideItem[] {
  return [...rows]
    .sort((a, b) => b.matches - a.matches)
    .flatMap((row) => {
      const item = items.get(row.itemId);
      return item === undefined || FREE_START.has(item.key) ? [] : [{ key: item.key }];
    })
    .slice(0, ITEMS_MAX);
}

export interface RankedItem extends Counted {
  item: ItemInfo;
  /** The minute half of its buyers had it by. */
  minute: number;
}

/** The keys of every item an item is built from, however deep. */
function partsOf(key: string, byKey: Map<string, ItemInfo>, seen = new Set<string>()): Set<string> {
  for (const part of byKey.get(key)?.components ?? []) {
    if (seen.has(part)) continue;
    seen.add(part);
    partsOf(part, byKey, seen);
  }
  return seen;
}

/**
 * The items players pay for, most bought first: nothing under 1000 gold, and no item that is a part of another listed
 * item (Yasha and Sange beside Sange and Yasha), however far down the recipe.
 */
export function rankPurchases(
  rows: { itemId: number; minute: number; matches: number; wins: number }[],
  items: Map<number, ItemInfo>,
  support = false
): RankedItem[] {
  const floor = support ? SUPPORT_CORE_MIN_COST : CORE_MIN_COST;
  const byId = new Map<number, { matches: number; wins: number; minutes: { minute: number; matches: number }[] }>();
  for (const row of rows) {
    const own = byId.get(row.itemId) ?? { matches: 0, wins: 0, minutes: [] };
    own.matches += row.matches;
    own.wins += row.wins;
    own.minutes.push({ minute: row.minute, matches: row.matches });
    byId.set(row.itemId, own);
  }
  const ranked: RankedItem[] = [];
  for (const [itemId, own] of byId) {
    const item = items.get(itemId);
    if (item === undefined || item.cost < floor || item.neutralTier !== null || own.matches <= 0) continue;
    const sorted = own.minutes.sort((a, b) => a.minute - b.minute);
    let seen = 0;
    const median = sorted.find((each) => (seen += each.matches) >= own.matches / 2)?.minute ?? 0;
    ranked.push({ item, matches: own.matches, wins: own.wins, minute: median });
  }
  const pool = ranked.sort((a, b) => b.matches - a.matches).slice(0, POOL);
  const byKey = new Map([...items.values()].map((item) => [item.key, item]));
  const parts = new Set(pool.flatMap((each) => [...partsOf(each.item.key, byKey)]));
  return pool.filter((each) => !parts.has(each.item.key));
}

/** The core in buy order and the situational items after it (an item bought in under 5% of the top one's games is no option). */
export function splitBuild(ranked: RankedItem[]): { core: GuideItem[]; situational: GuideItem[] } {
  const top = ranked[0]?.matches ?? 0;
  const core = ranked.slice(0, ITEMS_MAX).sort((a, b) => a.minute - b.minute);
  const situational = ranked.slice(ITEMS_MAX, ITEMS_MAX * 2).filter((each) => each.matches >= top * 0.05);
  return {
    core: core.map((each) => ({ key: each.item.key, minute: each.minute })),
    situational: situational.map((each) => ({ key: each.item.key }))
  };
}

/** One neutral item per tier, the most held of each, tier 1 first. */
export function neutralPicks(rows: { itemId: number; matches: number }[], items: Map<number, ItemInfo>): GuideItem[] {
  const best = new Map<number, { key: string; matches: number }>();
  for (const row of rows) {
    const item = items.get(row.itemId);
    if (item?.neutralTier == null) continue;
    const held = best.get(item.neutralTier);
    if (held === undefined || row.matches > held.matches)
      best.set(item.neutralTier, { key: item.key, matches: row.matches });
  }
  return [...best].sort((a, b) => a[0] - b[0]).map(([, each]) => ({ key: each.key }));
}

// ---- talents ----

const ruNumber = (value: number) => String(Math.round(Math.abs(value) * 100) / 100).replace('.', ',');

/**
 * A talent's text with Valve's `{s:bonus_radius}` placeholders filled from what the hero's abilities say it adds (the
 * value of that name, `bonus_` dropped), or from the number in a plain stat talent's key (`armor_5`). A number that
 * cannot be found is left out with the words that only led to it.
 */
export function talentText(talent: TalentDetail): string {
  const own = /_(\d+)$/.exec(talent.key);
  return talent.name
    .replace(/\{s:([^}]+)\}/g, (_, name: string) => {
      const found = talent.bonuses.find((bonus) => bonus.name === name.replace(/^bonus_/, '') || bonus.name === name);
      if (found !== undefined) return ruNumber(found.value);
      return name === 'value' && own?.[1] !== undefined ? own[1] : '';
    })
    .replace(/\s+%/g, '')
    .replace(/\s+(?:в|на|с|к|у|от|до)\s*$/u, '')
    .replace(/^–/, '−')
    .trim();
}

/** The four talent levels with their two sides: how often each is taken and how often it wins. Levels without data are skipped. */
export function talentRows(
  talents: TalentDetail[],
  stats: { abilityId: number; matches: number; wins: number }[]
): GuideTalentRow[] {
  if (talents.length !== 8) return [];
  const own = (talent: TalentDetail | undefined) => {
    const rows = stats.filter((row) => row.abilityId === talent?.id);
    return {
      matches: rows.reduce((sum, row) => sum + row.matches, 0),
      wins: rows.reduce((sum, row) => sum + row.wins, 0)
    };
  };
  const rows: GuideTalentRow[] = [];
  for (let tier = 0; tier < 4; tier += 1) {
    const [a, b] = [talents[tier * 2], talents[tier * 2 + 1]];
    if (a === undefined || b === undefined) continue;
    const [left, right] = [own(a), own(b)];
    const total = left.matches + right.matches;
    if (total < TALENT_MIN_MATCHES) continue;
    const side = (talent: TalentDetail, each: Counted) => ({
      text: talentText(talent),
      pickRate: each.matches / total,
      winRate: each.matches === 0 ? 0 : each.wins / each.matches
    });
    rows.push({ level: 10 + tier * 5, left: side(a, left), right: side(b, right) });
  }
  return rows;
}

// ---- skill order ----

interface AbilityLevel {
  abilityId: number;
  level: number;
  matches: number;
}

const modeLevel = (rows: AbilityLevel[], abilityId: number, from = 1): number | null => {
  const own = rows.filter((row) => row.abilityId === abilityId && row.level >= from && row.matches > 0);
  return own.sort((a, b) => b.matches - a.matches)[0]?.level ?? null;
};

/**
 * Levels 1–10 as players take them. STRATZ gives, per ability, the hero level it is first learnt at and the level it
 * reaches its maximum at, not a sequence: each ability takes its usual first level (the ultimate from 6), and a level
 * nobody starts an ability at goes to the learnt ability that usually maxes out first. A derived order, not a recorded one.
 */
export function skillOrder(
  detail: HeroDetail,
  first: AbilityLevel[],
  max: AbilityLevel[]
): { abilities: string[]; skills: (string | null)[] } | null {
  const learnt = new Set(first.filter((row) => row.matches > 0).map((row) => row.abilityId));
  const ultimate = detail.abilities.find((ability) => ability.isUltimate && learnt.has(ability.id));
  const basics = detail.abilities.filter((ability) => !ability.isUltimate && learnt.has(ability.id)).slice(0, 3);
  if (ultimate === undefined || basics.length < 2) return null;
  const plan = new Map<number, string>();
  const place = (key: string, wanted: number) => {
    let level = wanted;
    while (plan.has(level)) level += 1;
    plan.set(level, key);
  };
  const starts = basics
    .map((ability) => ({ key: ability.key, level: modeLevel(first, ability.id) ?? 1 }))
    .sort((a, b) => a.level - b.level);
  for (const start of starts) place(start.key, start.level);
  place(ultimate.key, Math.max(6, modeLevel(first, ultimate.id, 6) ?? 6));
  const maxesAt = new Map(basics.map((ability) => [ability.key, modeLevel(max, ability.id) ?? 99]));
  const points = new Map<string, number>();
  const skills: (string | null)[] = [];
  for (let level = 1; level <= 10; level += 1) {
    let chosen = plan.get(level) ?? null;
    if (chosen === null) {
      chosen =
        basics
          .filter((ability) => (points.get(ability.key) ?? 0) > 0 && (points.get(ability.key) ?? 0) < 4)
          .sort((a, b) => (maxesAt.get(a.key) ?? 99) - (maxesAt.get(b.key) ?? 99))[0]?.key ?? null;
    }
    if (chosen !== null) points.set(chosen, (points.get(chosen) ?? 0) + 1);
    skills.push(chosen);
  }
  return { abilities: [...basics.map((ability) => ability.key), ultimate.key], skills };
}

// ---- matchups, game length, the build's own numbers ----

/** Three or four worst and best opponents by win rate against them minus the hero's own win rate over all of them. */
export function matchupRows(
  rows: { heroId: number; matches: number; wins: number }[],
  heroes: Map<number, HeroInfo>
): GuideMatchup[] {
  const total = rows.reduce((sum, row) => sum + row.matches, 0);
  if (total === 0) return [];
  const base = rows.reduce((sum, row) => sum + row.wins, 0) / total;
  const deltas = rows
    .filter((row) => row.matches >= MATCHUP_MIN_MATCHES && heroes.has(row.heroId))
    .map((row) => ({ hero: { name: heroes.get(row.heroId)?.name ?? '' }, delta: row.wins / row.matches - base }));
  const worst = deltas
    .filter((each) => each.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 4);
  const best = deltas
    .filter((each) => each.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 4);
  return [...worst, ...best];
}

/**
 * Win rate in games under 35 minutes, 35–50 and over 50. STRATZ gives the matches still going at each minute and the
 * wins among them, so a stretch is the difference between its two ends; null when the numbers do not fall as time
 * passes or a stretch has too few games.
 */
export function lengthWinRates(
  rows: { minute: number; remaining: number; wins: number }[]
): [number, number, number] | null {
  const sorted = [...rows].sort((a, b) => a.minute - b.minute);
  const start = sorted[0];
  if (start === undefined) return null;
  const at = (minute: number) => sorted.find((row) => row.minute >= minute) ?? { remaining: 0, wins: 0 };
  const edges = [start, at(35), at(50), { remaining: 0, wins: 0 }];
  const rates: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    const from = edges[index];
    const to = edges[index + 1];
    if (from === undefined || to === undefined) return null;
    const games = from.remaining - to.remaining;
    const wins = from.wins - to.wins;
    if (games < LENGTH_MIN_MATCHES || wins < 0 || wins > games) return null;
    rates.push(wins / games);
  }
  return rates as [number, number, number];
}

// ---- the alternative build ----

/**
 * The build with the most bought key item that the main core lacks: its games and win rate come from the item's own
 * purchases, the swaps from a sample of final inventories (a main item most of those players lack, replaced by an item
 * most of them hold). Null without a clear alternative or a sample big enough to name swaps.
 */
export function altBuild(input: {
  ranked: RankedItem[];
  core: GuideItem[];
  sample: { matches: number; inventories: number[][] } | null;
  items: Map<number, ItemInfo>;
  /** The key item the sample was drawn for. */
  keyItem: RankedItem;
  support?: boolean;
}): GuideAltBuild | null {
  const { ranked, core, sample, items, keyItem } = input;
  const floor = input.support === true ? SUPPORT_CORE_MIN_COST : CORE_MIN_COST;
  if (sample === null || sample.inventories.length < SAMPLE_MIN) return null;
  const share = (key: string) =>
    sample.inventories.filter((held) => held.some((id) => items.get(id)?.key === key)).length /
    sample.inventories.length;
  const coreKeys = new Set(core.map((item) => item.key));
  const byKey = new Map(ranked.map((each) => [each.item.key, each]));
  const dropped = core.filter((item) => share(item.key) < 0.4).sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
  const added = [
    ...new Set(
      sample.inventories.flat().flatMap((id) => {
        const item = items.get(id);
        return item !== undefined && item.cost >= floor && item.neutralTier === null && !coreKeys.has(item.key)
          ? [item.key]
          : [];
      })
    )
  ]
    .filter((key) => share(key) >= 0.5)
    .map((key) => ({ key, minute: byKey.get(key)?.minute }))
    .sort((a, b) =>
      a.key === keyItem.item.key ? -1 : b.key === keyItem.item.key ? 1 : (a.minute ?? 99) - (b.minute ?? 99)
    );
  const swaps: GuideSwap[] = [];
  for (let index = 0; index < Math.min(dropped.length, added.length, 4); index += 1) {
    const from = dropped[index];
    const to = added[index];
    if (from === undefined || to === undefined) continue;
    swaps.push({
      from,
      to: to.minute === undefined ? { key: to.key } : { key: to.key, minute: to.minute }
    });
  }
  if (swaps.length === 0 || keyItem.matches < ALT_MIN_MATCHES) return null;
  return { winRate: keyItem.wins / keyItem.matches, matches: keyItem.matches, keyItem: keyItem.item.name, swaps };
}

/** The key item an alternative turns on: the most bought item of cost 3000 (a support's 1500) or more not in the core. */
export function altKeyItem(ranked: RankedItem[], core: GuideItem[], support = false): RankedItem | null {
  const coreKeys = new Set(core.map((item) => item.key));
  const floor = support ? SUPPORT_ALT_MIN_COST : ALT_MIN_COST;
  return ranked.find((each) => each.item.cost >= floor && !coreKeys.has(each.item.key)) ?? null;
}
