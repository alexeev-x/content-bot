import type { GuideAltBuild, GuideItem, GuideMatchup, GuideRole, GuideSwap, GuideTalentRow } from './guide-pictures';
import type { GuideMatch, HeroDetail, HeroInfo, ItemInfo, TalentDetail } from './types';

// «Гайд на героя»: STRATZ's sample matches and aggregates and Valve's texts turned into the card's blocks. Pure functions only; each one
// returns nothing (null or an empty list) when its data is too thin, and the card then leaves that block out.

/** The window assumed when the sample carries no start times (a week; UNVERIFIED against the live schema). */
export const GUIDE_DAYS = 7;

const ITEMS_MAX = 6;
/** A key item costs at least this much; cheaper buys (wand, boots, bracer) are not what a build turns on. */
// A support's whole build is cheap (Lich came with four core items and no situational ones, 27.10.2026): its floors
// are lower.
const CORE_MIN_COST = 1000;
const SUPPORT_CORE_MIN_COST = 400;
/**
 * The cheap early items a build opens with (Magic Wand, Bracer, boots): from this price they enter the core when nearly
 * every match buys them, ahead of the big items, as Dota2ProTracker's build line does (owner, 27.10.2026).
 */
const EARLY_MIN_COST = 400;
const POOL = 30;
const MATCHUP_MIN_MATCHES = 300;
/** OpenDota's free sample holds about a hundred games a pair (Faceless Void, 27.10.2026): its own floor. */
export const OPENDOTA_MATCHUP_MIN_MATCHES = 60;
const TALENT_MIN_MATCHES = 50;
const LENGTH_MIN_MATCHES = 30;
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

/**
 * The neutral items most held at the end of the sample's matches, up to five (STRATZ's own neutral totals came back
 * empty on DEV, 27.10.2026, after the neutral items' rework). A tier is shown when the constants know it.
 */
export function sampleNeutrals(matches: { neutral?: number | null }[], items: Map<number, ItemInfo>): GuideItem[] {
  const counts = new Map<number, number>();
  for (const match of matches) {
    if (match.neutral == null || items.get(match.neutral) === undefined) continue;
    counts.set(match.neutral, (counts.get(match.neutral) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([itemId]) => ({ key: items.get(itemId)?.key ?? '' }));
}

/**
 * One neutral item per tier, the most held of each, tier 1 first. The tier is STRATZ's own; the constants' tier (given
 * to a few items only) stands in when STRATZ names none. A row repeats per week and bracket, so an item's rows add up.
 */
export function neutralPicks(
  rows: { itemId: number; tier: number | null; matches: number }[],
  items: Map<number, ItemInfo>
): GuideItem[] {
  const held = new Map<number, { tier: number; matches: number }>();
  for (const row of rows) {
    const tier = row.tier ?? items.get(row.itemId)?.neutralTier ?? null;
    if (tier === null || items.get(row.itemId) === undefined) continue;
    held.set(row.itemId, { tier, matches: (held.get(row.itemId)?.matches ?? 0) + row.matches });
  }
  const best = new Map<number, { key: string; matches: number }>();
  for (const [itemId, own] of held) {
    const top = best.get(own.tier);
    if (top === undefined || own.matches > top.matches)
      best.set(own.tier, { key: items.get(itemId)?.key ?? '', matches: own.matches });
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

// ---- matchups, game length, the build's own numbers ----

/** Three or four worst and best opponents by win rate against them minus the hero's own win rate over all of them. */
export function matchupRows(
  rows: { heroId: number; matches: number; wins: number }[],
  heroes: Map<number, HeroInfo>,
  minMatches = MATCHUP_MIN_MATCHES
): GuideMatchup[] {
  const total = rows.reduce((sum, row) => sum + row.matches, 0);
  if (total === 0) return [];
  const base = rows.reduce((sum, row) => sum + row.wins, 0) / total;
  const deltas = rows
    .filter((row) => row.matches >= minMatches && heroes.has(row.heroId))
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

/**
 * The same three stretches from OpenDota's duration bins (`from`: the bin's start in seconds); null when a stretch has
 * too few games. OpenDota's bins are 5 minutes wide, so 35 and 50 minutes fall on bin edges.
 */
export function lengthWinRatesFromBins(
  bins: { from: number; matches: number; wins: number }[]
): [number, number, number] | null {
  const sums = [
    { games: 0, wins: 0 },
    { games: 0, wins: 0 },
    { games: 0, wins: 0 }
  ];
  for (const bin of bins) {
    const stretch = sums[bin.from < 35 * 60 ? 0 : bin.from < 50 * 60 ? 1 : 2];
    if (stretch === undefined) continue;
    stretch.games += bin.matches;
    stretch.wins += bin.wins;
  }
  const rates = sums.map((each) =>
    each.games < LENGTH_MIN_MATCHES || each.wins > each.games ? null : each.wins / each.games
  );
  const [early, middle, late] = rates;
  return early == null || middle == null || late == null ? null : [early, middle, late];
}

/** OpenDota knows no minutes, only the stretch: mid and late buys together, as purchase rows `rankPurchases` takes. */
export function fallbackPurchases(
  popularity: Record<'mid' | 'late', { itemId: number; matches: number }[]>
): { itemId: number; minute: number; matches: number; wins: number }[] {
  const totals = new Map<number, number>();
  for (const row of [...popularity.mid, ...popularity.late])
    totals.set(row.itemId, (totals.get(row.itemId) ?? 0) + row.matches);
  return [...totals].map(([itemId, matches]) => ({ itemId, minute: 0, matches, wins: 0 }));
}

// ---- counting from matches, the way Dota2ProTracker does ----
// Anchors, starting sets, skill sequences and alternative builds are counted from the sample's individual matches, not
// from per-item totals: a total across roles put Magic Stick into the core and Nullifier on supports.

/** An item is an anchor of a build when more than half its matches buy it (Dota2ProTracker's «более чем в половине матчей»). */
const ANCHOR_SHARE = 0.5;
/** A role whose few anchors would leave a core of one or two items falls back to these shares, one after another (a support's builds vary: Hoodwink had two items at 50%, 27.10.2026). */
const ANCHOR_RELAXED_SHARES = [0.3];
const ANCHOR_MIN = 3;
const SITUATIONAL_SHARE = 0.2;
const MINUTE_MIN_BUYERS = 3;
/** The newest patch alone is the sample when it holds at least this many matches. */
const PATCH_MIN_MATCHES = 30;
export const BUILD_SAMPLE_MIN = 20;
const START_MIN_MATCHES = 3;
const SEQUENCE_MIN_MATCHES = 3;
const SKILL_LEVELS = 10;
const ALT_SHARE = 0.15;
const ALT_GROUP_MIN = 8;
const ALT_PICK_MIN = 5;
const DAY_SECONDS = 86_400;
/** Consumables, wards and the free scroll: never a build's item. Magic Stick and boots drop out as parts once upgraded. */
const NOT_A_BUILD_ITEM = new Set([
  'branches',
  'tango',
  'flask',
  'clarity',
  'faerie_fire',
  'enchanted_mango',
  'ward_observer',
  'ward_sentry',
  'ward_dispenser',
  'smoke_of_deceit',
  'dust',
  'tpscroll',
  'cheese',
  'refresher_shard'
]);

const matchWins = (matches: GuideMatch[]) => matches.filter((match) => match.victory).length;

/**
 * The newest patch in the sample when enough matches were played on it (an older match does not describe the hero now),
 * and the days the kept matches span (null without start times).
 */
export function currentPatch(matches: GuideMatch[]): { matches: GuideMatch[]; days: number | null } {
  const newest = Math.max(-1, ...matches.map((match) => match.patch ?? -1));
  const onNewest = matches.filter((match) => match.patch === newest);
  const kept = onNewest.length >= PATCH_MIN_MATCHES ? onNewest : matches;
  const starts = kept.flatMap((match) => (match.startedAt === null ? [] : [match.startedAt]));
  const days =
    starts.length < 2 ? null : Math.max(1, Math.ceil((Math.max(...starts) - Math.min(...starts)) / DAY_SECONDS));
  return { matches: kept, days };
}

export interface BuildItem {
  item: ItemInfo;
  /** The share of the sample's matches that bought it (or ended with it, without a purchase log), 0…1. */
  share: number;
  /** A cheap early item (Magic Wand, Bracer): a core item only as an anchor, never situational. */
  early: boolean;
  /** The average minute it was first bought at; null without enough buyers' purchase times. */
  minute: number | null;
}

/** A part stays in the build while this share of its buyers keep it a while before an item made from it. */
const PART_KEPT_SHARE = 0.5;
/**
 * Minutes a part must be held before the item made from it to count as a step of the build: Faceless Void's Yasha
 * (18 → Manta 22) is one on Dota2ProTracker's line, Perseverance (12 → Battle Fury 14) is not (27.10.2026).
 */
const PART_HELD_MINUTES = 3;

/**
 * Every item bought in at least one match that can be a build's item (price floor, no consumable, no neutral), most
 * common first, each with the average minute it was first bought. Counted from the purchase log as Dota2ProTracker
 * does (27.10.2026): Maelstrom upgraded into Mjollnir is still Faceless Void's 19-minute item, though no final inventory
 * holds it. A part drops out when most of its buyers turn it into an item made from it within three minutes
 * (Perseverance into Battle Fury, boots into Power Treads); one held longer stays (Yasha four minutes before Manta). Without purchase
 * times the final inventories stand in.
 */
export function inventoryShares(
  matches: GuideMatch[],
  items: Map<number, ItemInfo>,
  support: boolean,
  fallbackMinutes?: Map<number, number>
): BuildItem[] {
  if (matches.length === 0) return [];
  const floor = support ? SUPPORT_CORE_MIN_COST : CORE_MIN_COST;
  // Cheap for any role: a support's boots or Magic Wand is an early step too, never a situational pick.
  const isEarly = (item: ItemInfo) => item.cost >= EARLY_MIN_COST && item.cost < CORE_MIN_COST;
  const buildItem = (id: number) => {
    const item = items.get(id);
    return item === undefined ||
      (item.cost < floor && !isEarly(item)) ||
      item.neutralTier !== null ||
      NOT_A_BUILD_ITEM.has(item.key)
      ? null
      : item;
  };
  const byKey = new Map([...items.values()].map((item) => [item.key, item]));
  const held = new Map<number, number>();
  const bought = new Map<number, number[]>();
  // Per item: buyers, and buyers who later completed an item it is a part of.
  const upgraded = new Map<number, number>();
  for (const match of matches) {
    const purchases = match.purchases ?? [];
    const first = new Map<number, number>();
    for (const purchase of purchases)
      if (!first.has(purchase.itemId) || (first.get(purchase.itemId) ?? 0) > purchase.minute)
        first.set(purchase.itemId, purchase.minute);
    const owned = match.purchases === null ? new Set(match.items) : new Set([...first.keys(), ...match.items]);
    for (const id of owned) {
      const item = buildItem(id);
      if (item === null) continue;
      held.set(id, (held.get(id) ?? 0) + 1);
      const minute = first.get(id);
      if (minute !== undefined) bought.set(id, [...(bought.get(id) ?? []), minute]);
      const later = [...first.entries()].some(
        ([other, at]) =>
          other !== id &&
          at >= (minute ?? at) &&
          at - (minute ?? at) < PART_HELD_MINUTES &&
          partsOf(items.get(other)?.key ?? '', byKey).has(item.key)
      );
      if (later) upgraded.set(id, (upgraded.get(id) ?? 0) + 1);
    }
  }
  const rows: BuildItem[] = [];
  for (const [id, count] of held) {
    const item = items.get(id);
    if (item === undefined) continue;
    if ((upgraded.get(id) ?? 0) > count * (1 - PART_KEPT_SHARE)) continue;
    const minutes = bought.get(id) ?? [];
    const average = minutes.reduce((sum, minute) => sum + minute, 0) / (minutes.length || 1);
    rows.push({
      item,
      early: isEarly(item),
      share: count / matches.length,
      minute:
        minutes.length >= MINUTE_MIN_BUYERS ? Math.max(0, Math.round(average)) : (fallbackMinutes?.get(id) ?? null)
    });
  }
  const withoutLog = matches.every((match) => match.purchases === null);
  const parts = withoutLog
    ? new Set(rows.filter((row) => row.share >= SITUATIONAL_SHARE).flatMap((row) => [...partsOf(row.item.key, byKey)]))
    : new Set<string>();
  return rows
    .filter((row) => !parts.has(row.item.key))
    .sort((a, b) => b.share - a.share || a.item.key.localeCompare(b.item.key));
}

const guideItem = (row: BuildItem): GuideItem =>
  row.minute === null ? { key: row.item.key } : { key: row.item.key, minute: row.minute };

/**
 * The core: the cheap early anchors and up to six big ones (bought in over half the matches, 30% when that leaves a core
 * of fewer than three), in the order they were bought; then the situational items: big, 20% and more, not an anchor.
 */
export function splitAnchors(rows: BuildItem[]): { core: BuildItem[]; situational: BuildItem[]; anchorShare: number } {
  let anchorShare = ANCHOR_SHARE;
  const big = rows.filter((row) => !row.early);
  const early = rows.filter((row) => row.early && row.share > ANCHOR_SHARE);
  let anchors = big.filter((row) => row.share > anchorShare);
  for (const relaxed of ANCHOR_RELAXED_SHARES) {
    if (anchors.length + early.length >= ANCHOR_MIN) break;
    anchorShare = relaxed;
    anchors = big.filter((row) => row.share > anchorShare);
  }
  const late = Number.POSITIVE_INFINITY;
  const core = [...early, ...anchors.slice(0, ITEMS_MAX)].sort(
    (a, b) => (a.minute ?? late) - (b.minute ?? late) || b.share - a.share
  );
  const chosen = new Set(core.map((row) => row.item.key));
  const situational = big
    .filter((row) => !chosen.has(row.item.key) && row.share >= SITUATIONAL_SHARE)
    .slice(0, ITEMS_MAX);
  return { core, situational, anchorShare };
}

/**
 * The most common whole set of items bought before the horn (a second copy counts), as a set and not item by item;
 * the free Town Portal Scroll is left out. Null without purchase times or a set seen at least three times.
 */
export function startingSet(
  matches: GuideMatch[],
  items: Map<number, ItemInfo>
): { items: GuideItem[]; matches: number } | null {
  const sets = new Map<string, { ids: number[]; matches: number }>();
  for (const match of matches) {
    if (match.purchases === null) continue;
    const ids = match.purchases
      .filter((purchase) => purchase.minute <= 0 && items.has(purchase.itemId))
      .filter((purchase) => !FREE_START.has(items.get(purchase.itemId)?.key ?? ''))
      .map((purchase) => purchase.itemId)
      .sort((a, b) => a - b);
    if (ids.length === 0) continue;
    const key = ids.join(',');
    sets.set(key, { ids, matches: (sets.get(key)?.matches ?? 0) + 1 });
  }
  const top = [...sets.entries()].sort((a, b) => b[1].matches - a[1].matches || a[0].localeCompare(b[0]))[0]?.[1];
  if (top === undefined || top.matches < START_MIN_MATCHES) return null;
  const known = top.ids.flatMap((id) => {
    const item = items.get(id);
    return item === undefined ? [] : [item];
  });
  return {
    items: known
      .sort((a, b) => b.cost - a.cost)
      .map((item) => ({ key: item.key }))
      .slice(0, ITEMS_MAX),
    matches: top.matches
  };
}

/** The first ten ability points of a match in the order they were spent; an id outside `known` (a talent, the attribute bonus) is 0. */
function firstTenSkills(match: GuideMatch, known: Set<number>): number[] | null {
  const spent = match.abilities
    .map((ability, index) => ({ ability, index }))
    .sort((a, b) => a.ability.time - b.ability.time || a.ability.level - b.ability.level || a.index - b.index)
    .slice(0, SKILL_LEVELS)
    .map(({ ability }) => (known.has(ability.abilityId) ? ability.abilityId : 0));
  return spent.length < SKILL_LEVELS ? null : spent;
}

/** The exact sequence of levels 1–10 that most matches share, with how many; null when no sequence repeats enough. */
export function commonSequence(matches: GuideMatch[], known: Set<number>): { ids: number[]; matches: number } | null {
  const counts = new Map<string, { ids: number[]; matches: number }>();
  for (const match of matches) {
    const ids = firstTenSkills(match, known);
    if (ids === null) continue;
    const key = ids.join(',');
    counts.set(key, { ids, matches: (counts.get(key)?.matches ?? 0) + 1 });
  }
  const top = [...counts.entries()].sort((a, b) => b[1].matches - a[1].matches || a[0].localeCompare(b[0]))[0]?.[1];
  return top === undefined || top.matches < SEQUENCE_MIN_MATCHES ? null : top;
}

export interface SkillPlan {
  /** Q, W, E, R keys: up to three basic abilities and the ultimate last (when learnt by level 10). */
  abilities: string[];
  /** Levels 1–10 as ability keys; null for a talent, the attribute bonus or an ability the card does not show. */
  skills: (string | null)[];
  /** Matches that took exactly this sequence. */
  matches: number;
  keyOf: (abilityId: number) => string | null;
}

/**
 * The most common exact sequence of levels 1–10 as the card draws it; null without a repeated sequence. A hero whose
 * first ten points never reach the ultimate (Invoker: Invoke comes free) shows three basic abilities.
 */
export function skillPlan(matches: GuideMatch[], detail: HeroDetail): SkillPlan | null {
  const sequence = commonSequence(matches, new Set(detail.abilities.map((ability) => ability.id)));
  if (sequence === null) return null;
  const learnt = new Set(sequence.ids);
  const ultimate = detail.abilities.find((ability) => ability.isUltimate && learnt.has(ability.id));
  const basics = detail.abilities.filter((ability) => !ability.isUltimate && learnt.has(ability.id)).slice(0, 3);
  if (ultimate === undefined ? basics.length < 3 : basics.length < 2) return null;
  const drawn = ultimate === undefined ? basics : [...basics, ultimate];
  const shown = new Map(drawn.map((ability) => [ability.id, ability.key]));
  const keyOf = (abilityId: number) => shown.get(abilityId) ?? null;
  return {
    abilities: drawn.map((ability) => ability.key),
    skills: sequence.ids.map(keyOf),
    matches: sequence.matches,
    keyOf
  };
}

/** For each of the four talent tiers the side (0: first, 1: second) most matches took, with how many took one; null where none did. */
export function talentSides(matches: GuideMatch[], talents: TalentDetail[]): ({ side: 0 | 1; picks: number } | null)[] {
  if (talents.length !== 8) return [];
  return [0, 1, 2, 3].map((tier) => {
    const [first, second] = [talents[tier * 2]?.id, talents[tier * 2 + 1]?.id];
    let left = 0;
    let right = 0;
    for (const match of matches) {
      const tookFirst = match.abilities.some((ability) => ability.abilityId === first);
      const tookSecond = match.abilities.some((ability) => ability.abilityId === second);
      if (tookFirst && !tookSecond) left += 1;
      if (tookSecond && !tookFirst) right += 1;
    }
    return left + right === 0 ? null : { side: right > left ? 1 : 0, picks: left + right };
  });
}

/**
 * The most common build that differs from the main one: matches that ended with one more common item and lack a main
 * core item form a group per such item; the biggest (at least 15% of the sample) is the alternative, counted the same
 * way: its own anchors against the main core as swaps, its own win rate, talent sides and skill sequence.
 */
export function altFromSample(input: {
  matches: GuideMatch[];
  rows: BuildItem[];
  core: BuildItem[];
  items: Map<number, ItemInfo>;
  support: boolean;
  detail: HeroDetail | null;
  talents: TalentDetail[];
  plan: SkillPlan | null;
  fallbackMinutes?: Map<number, number>;
}): GuideAltBuild | null {
  const { matches, rows, core, items, support, detail, talents, plan } = input;
  const coreKeys = new Set(core.map((row) => row.item.key));
  // What each match bought (the purchase log, as the core is counted), with the final inventory for a match without one.
  const inventories = matches.map((match) => ({
    match,
    keys: new Set(
      [...match.items, ...(match.purchases ?? []).map((purchase) => purchase.itemId)].flatMap(
        (id) => items.get(id)?.key ?? []
      )
    )
  }));
  const need = Math.max(ALT_GROUP_MIN, Math.ceil(matches.length * ALT_SHARE));
  let best: { row: BuildItem; group: GuideMatch[] } | null = null;
  for (const row of rows) {
    // A cheap early item (plain boots) is no build's turn.
    if (coreKeys.has(row.item.key) || row.early || row.share < ALT_SHARE) continue;
    const group = inventories
      .filter(({ keys }) => keys.has(row.item.key) && [...coreKeys].some((key) => !keys.has(key)))
      .map(({ match }) => match);
    if (group.length >= need && (best === null || group.length > best.group.length)) best = { row, group };
  }
  if (best === null) return null;
  const keyKey = best.row.item.key;
  const own = splitAnchors(inventoryShares(best.group, items, support, input.fallbackMinutes)).core;
  const ownKeys = new Set(own.map((row) => row.item.key));
  const dropped = core.filter((row) => !ownKeys.has(row.item.key));
  // A part of a main core item (Perseverance of Battle Fury) is the same road, not a swap.
  const byKey = new Map([...items.values()].map((item) => [item.key, item]));
  const coreParts = new Set(core.flatMap((row) => [...partsOf(row.item.key, byKey)]));
  const added = own
    .filter((row) => !coreKeys.has(row.item.key) && !coreParts.has(row.item.key))
    .sort((a, b) => (a.item.key === keyKey ? -1 : b.item.key === keyKey ? 1 : (a.minute ?? 99) - (b.minute ?? 99)));
  const swaps: GuideSwap[] = [];
  for (let index = 0; index < Math.min(dropped.length, added.length, 4); index += 1) {
    const from = dropped[index];
    const to = added[index];
    if (from !== undefined && to !== undefined) swaps.push({ from: guideItem(from), to: guideItem(to) });
  }
  if (swaps.length === 0) return null;
  const mainSides = talentSides(matches, talents);
  const talentDiff: { level: number; text: string; instead: string }[] = [];
  talentSides(best.group, talents).forEach((side, tier) => {
    const main = mainSides[tier];
    if (side === null || main === null || main === undefined || side.side === main.side || side.picks < ALT_PICK_MIN)
      return;
    const picked = talents[tier * 2 + side.side];
    const instead = talents[tier * 2 + main.side];
    if (picked !== undefined && instead !== undefined)
      talentDiff.push({ level: 10 + tier * 5, text: talentText(picked), instead: talentText(instead) });
  });
  const ownSequence =
    plan === null || detail === null
      ? null
      : commonSequence(best.group, new Set(detail.abilities.map((ability) => ability.id)));
  return {
    // STRATZ's guide lists hold winners only: their win rate says nothing.
    ...(matches.every((match) => match.victory) ? {} : { winRate: matchWins(best.group) / best.group.length }),
    share: best.group.length / matches.length,
    matches: best.group.length,
    keyItem: best.row.item.name,
    keyItemId: best.row.item.id,
    swaps,
    ...(talentDiff.length === 0 ? {} : { talents: talentDiff }),
    ...(plan === null || ownSequence === null || ownSequence.matches < ALT_PICK_MIN
      ? {}
      : { skills: ownSequence.ids.map(plan.keyOf) })
  };
}

export interface SampleGuide {
  /** Matches counted (the newest patch's when enough), their win rate and the days they span. */
  matches: number;
  winRate: number;
  days: number | null;
  core: GuideItem[];
  situational: GuideItem[];
  /** The share of inventories an item needed to be an anchor (0.5 when 0.7 left too few). */
  anchorShare: number;
  /** Null without purchase times or a repeated starting set. */
  start: GuideItem[] | null;
  plan: SkillPlan | null;
  alt: GuideAltBuild | null;
  /** Whether the sample carried purchase times (core minutes and the start come from them). */
  withPurchases: boolean;
}

/** Everything the card takes from the sample; null when the sample is too small to count a build from. */
export function guideFromSample(input: {
  matches: GuideMatch[];
  items: Map<number, ItemInfo>;
  detail: HeroDetail | null;
  /** The talents ordered tier by tier (`pairTalents`). */
  talents: TalentDetail[];
  support: boolean;
  /** The median minute STRATZ's totals give an item, for the items whose buyers' times the sample lacks. */
  fallbackMinutes?: Map<number, number>;
}): SampleGuide | null {
  const { matches, days } = currentPatch(input.matches);
  if (matches.length < BUILD_SAMPLE_MIN) return null;
  const rows = inventoryShares(matches, input.items, input.support, input.fallbackMinutes);
  const { core, situational, anchorShare } = splitAnchors(rows);
  const plan = input.detail === null ? null : skillPlan(matches, input.detail);
  const alt = altFromSample({ ...input, matches, rows, core, plan });
  return {
    matches: matches.length,
    winRate: matchWins(matches) / matches.length,
    days,
    core: core.map(guideItem),
    situational: situational.map(guideItem),
    anchorShare,
    start: startingSet(matches, input.items)?.items ?? null,
    plan,
    alt,
    withPurchases: matches.some((match) => match.purchases !== null)
  };
}

/** A build's key item: its first big core item worth at least this (Battle Fury, Blink Dagger), not boots. */
const KEY_ITEM_MIN_COST = 2000;

/** The core item a build turns on: the first one bought that costs at least 2000; null when none does. */
export function keyItemOf(core: GuideItem[], items: Map<number, ItemInfo>): ItemInfo | null {
  const byKey = new Map([...items.values()].map((item) => [item.key, item]));
  return (
    core.map((each) => byKey.get(each.key)).find((item) => item !== undefined && item.cost >= KEY_ITEM_MIN_COST) ?? null
  );
}

/**
 * The win rate and matches of the games at the position that bought an item, summed over STRATZ's per-minute purchase
 * totals; null under 100 matches. The guide sample holds winners only, so this stands for a build's win rate.
 */
export function itemWinRate(
  rows: { itemId: number; matches: number; wins: number }[],
  itemId: number
): { winRate: number; matches: number } | null {
  const own = rows.filter((row) => row.itemId === itemId);
  const matches = own.reduce((sum, row) => sum + row.matches, 0);
  const wins = own.reduce((sum, row) => sum + row.wins, 0);
  return matches < ITEM_RATE_MIN_MATCHES ? null : { winRate: wins / matches, matches };
}
const ITEM_RATE_MIN_MATCHES = 100;

/** The median minute each item was bought at, from STRATZ's per-minute purchase totals. */
export function medianMinutes(rows: { itemId: number; minute: number; matches: number }[]): Map<number, number> {
  const byItem = new Map<number, { minute: number; matches: number }[]>();
  for (const row of rows) byItem.set(row.itemId, [...(byItem.get(row.itemId) ?? []), row]);
  const medians = new Map<number, number>();
  for (const [id, own] of byItem) {
    const total = own.reduce((sum, row) => sum + row.matches, 0);
    let seen = 0;
    const median = own.sort((a, b) => a.minute - b.minute).find((row) => (seen += row.matches) >= total / 2);
    if (median !== undefined && total > 0) medians.set(id, Math.max(0, Math.round(median.minute)));
  }
  return medians;
}

/**
 * The talents ordered tier by tier (two to a tier) the way the game lists them, from the tier numbers 1–4 of OpenDota's
 * constants; the datafeed's own order when the constants do not pair every talent.
 */
export function pairTalents(talents: TalentDetail[], levels: { name: string; level: number }[]): TalentDetail[] {
  const byKey = new Map(talents.map((talent) => [talent.key, talent]));
  const ordered = [1, 2, 3, 4].flatMap((tier) =>
    levels.filter((each) => each.level === tier).map((each) => byKey.get(each.name))
  );
  const paired = ordered.flatMap((talent) => (talent === undefined ? [] : [talent]));
  return ordered.length === 8 && paired.length === 8 ? paired : talents;
}
