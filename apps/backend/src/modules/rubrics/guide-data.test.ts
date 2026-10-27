import { describe, expect, it } from 'vitest';
import {
  altFromSample,
  guideFromSample,
  inventoryShares,
  neutralPicks,
  pairTalents,
  skillPlan,
  splitAnchors,
  startingSet
} from './guide-data';
import type { GuideMatch, HeroDetail, ItemInfo, TalentDetail } from './types';

// «Гайд на героя» counts from individual matches: the owner's screenshots (27.10.2026) showed Magic Stick in the core
// and Nullifier on supports when per-item totals were used. These tests pin the counting.

const item = (id: number, key: string, cost: number, components: string[] = [], neutralTier: number | null = null) =>
  [id, { id, key, name: key, cost, components, neutralTier }] as const;
const ITEMS = new Map<number, ItemInfo>([
  item(1, 'blink', 2250),
  item(2, 'black_king_bar', 4050),
  item(3, 'battle_fury', 4100),
  item(4, 'magic_stick', 1000),
  item(5, 'nullifier', 4725),
  item(6, 'sange', 2200),
  item(7, 'sange_and_yasha', 4100, ['sange']),
  item(8, 'tango', 90),
  item(9, 'tpscroll', 50),
  item(10, 'quelling_blade', 100),
  item(11, 'tranquil_boots', 900),
  item(12, 'force_staff', 2200),
  item(13, 'glimmer_cape', 1950),
  item(14, 'magic_wand', 1500),
  item(15, 'branches', 50),
  item(16, 'ward_observer', 0),
  item(17, 'trusty_shovel', 0, [], 1),
  item(18, 'mekansm', 1775)
]);

const match = (partial: Partial<GuideMatch> & { items: number[] }): GuideMatch => ({
  victory: true,
  startedAt: null,
  patch: 1,
  purchases: null,
  abilities: [],
  ...partial
});
const many = (count: number, make: (index: number) => GuideMatch) =>
  Array.from({ length: count }, (_, index) => make(index));
const bought = (...rows: [number, number][]) => rows.map(([itemId, minute]) => ({ itemId, minute }));

describe('anchors and core order', () => {
  // Ten carries: everyone ends with Blink and BKB; eight with Battle Fury; the Magic Stick sits in every bag.
  const matches = many(10, (index) =>
    match({
      items: [1, 2, 4, ...(index < 8 ? [3] : []), ...(index < 3 ? [5] : []), ...(index === 9 ? [6] : [])],
      purchases: bought([3, 12], [1, 18], [2, 25])
    })
  );
  const split = splitAnchors(inventoryShares(matches, ITEMS, false));

  it('takes items in at least 70% of the inventories, in the order they were bought on average', () => {
    expect(split.core.map((row) => [row.item.key, row.minute])).toEqual([
      ['battle_fury', 12],
      ['blink', 18],
      ['black_king_bar', 25]
    ]);
    expect(split.anchorShare).toBe(0.7);
  });

  it('keeps Magic Stick out of every block, and puts a 30% item in the situational list only', () => {
    const everywhere = [...split.core, ...split.situational].map((row) => row.item.key);
    expect(everywhere).not.toContain('magic_stick');
    expect(split.situational.map((row) => row.item.key)).toEqual(['nullifier']);
    expect(split.core.map((row) => row.item.key)).not.toContain('nullifier');
  });

  it('drops a part of a listed item and an item in fewer than 20% of the inventories', () => {
    const withParts = [...matches, match({ items: [6, 1, 2] }), ...many(5, () => match({ items: [7, 1, 2] }))];
    const keys = inventoryShares(withParts, ITEMS, false).map((row) => row.item.key);
    expect(keys).toContain('sange_and_yasha');
    expect(keys).not.toContain('sange');
  });

  it('orders by share when no purchase times are known, and takes the fallback minute', () => {
    const rows = inventoryShares(
      many(10, () => match({ items: [1, 2] })),
      ITEMS,
      false,
      new Map([
        [1, 20],
        [2, 30]
      ])
    );
    expect(splitAnchors(rows).core.map((row) => row.minute)).toEqual([20, 30]);
  });
});

describe('a support sample without carry items', () => {
  const support = many(10, (index) =>
    match({
      items: [11, 12, 14, 15, 16, ...(index < 6 ? [13] : []), ...(index < 2 ? [5] : [])],
      purchases: bought([11, 8], [12, 20], [13, 26])
    })
  );

  it('uses the lower price floor, so the cheap boots count, and still skips wand, branches and wards', () => {
    const keys = inventoryShares(support, ITEMS, true).map((row) => row.item.key);
    expect(keys).toEqual(expect.arrayContaining(['tranquil_boots', 'force_staff', 'glimmer_cape']));
    expect(keys).not.toContain('magic_wand');
    expect(keys).not.toContain('branches');
    expect(keys).not.toContain('ward_observer');
    expect(inventoryShares(support, ITEMS, false).map((row) => row.item.key)).not.toContain('tranquil_boots');
  });

  it('relaxes the anchor share to 50% when 70% leaves fewer than three, and never makes Nullifier an anchor', () => {
    const split = splitAnchors(inventoryShares(support, ITEMS, true));
    expect(split.anchorShare).toBe(0.5);
    expect(split.core.map((row) => row.item.key)).toEqual(['tranquil_boots', 'force_staff', 'glimmer_cape']);
    expect(split.core.map((row) => row.item.key)).not.toContain('nullifier');
  });
});

describe('the starting set', () => {
  const set = (ids: number[]) => bought(...ids.map((id): [number, number] => [id, -60]));
  it('counts whole sets, not single items, and leaves the Town Portal Scroll and later buys out', () => {
    const matches = [
      // Tango is in every set, but the set tango+tango+quelling is the commonest whole one.
      ...many(4, () => match({ items: [], purchases: [...set([8, 8, 10, 9]), ...bought([15, 120])] })),
      ...many(3, () => match({ items: [], purchases: set([8, 15, 15]) })),
      ...many(2, () => match({ items: [], purchases: set([8, 10]) }))
    ];
    expect(startingSet(matches, ITEMS)?.items.map((each) => each.key)).toEqual(['quelling_blade', 'tango', 'tango']);
  });

  it('is null without purchase times, and when no set repeats', () => {
    expect(
      startingSet(
        many(10, () => match({ items: [] })),
        ITEMS
      )
    ).toBeNull();
    const all = [8, 10, 15, 16].map((id) => match({ items: [], purchases: set([id]) }));
    expect(startingSet(all, ITEMS)).toBeNull();
  });
});

describe('the skill sequence', () => {
  const ability = (id: number, key: string, isUltimate = false) => ({
    id,
    key,
    name: key,
    isUltimate,
    cooldowns: [],
    manaCosts: [],
    values: []
  });
  const detail: HeroDetail = {
    id: 1,
    name: 'npc_dota_hero_test',
    localizedName: 'Test',
    abilities: [ability(100, 'q'), ability(101, 'w'), ability(102, 'e'), ability(103, 'r', true)],
    talents: []
  };
  const learn = (ids: number[]) => ids.map((abilityId, index) => ({ abilityId, time: index * 100, level: index + 1 }));
  const first = [100, 101, 100, 102, 100, 103, 100, 101, 101, 101];
  const second = [101, 100, 101, 102, 101, 103, 101, 100, 100, 100];

  it('picks the most common exact sequence of levels 1-10, whatever order STRATZ lists the events in', () => {
    const matches = [
      ...many(5, () => match({ items: [], abilities: [...learn([...first, 700, 900])].reverse() })),
      ...many(3, () => match({ items: [], abilities: learn(second) })),
      match({ items: [], abilities: learn(first.slice(0, 6)) })
    ];
    const plan = skillPlan(matches, detail);
    expect(plan?.matches).toBe(5);
    expect(plan?.skills).toEqual(['q', 'w', 'q', 'e', 'q', 'r', 'q', 'w', 'w', 'w']);
    expect(plan?.abilities).toEqual(['q', 'w', 'e', 'r']);
  });

  it('is null when no sequence repeats three times', () => {
    const matches = [first, second, [...first].reverse()].map((ids) => match({ items: [], abilities: learn(ids) }));
    expect(skillPlan(matches, detail)).toBeNull();
    expect(skillPlan([], detail)).toBeNull();
  });
});

describe('empty blocks', () => {
  it('counts no build from a sample under twenty matches', () => {
    const small = many(19, () => match({ items: [1, 2, 3] }));
    expect(guideFromSample({ matches: small, items: ITEMS, detail: null, talents: [], support: false })).toBeNull();
  });

  it('leaves the start, the skills and the alternative empty when the matches carry none of them', () => {
    const matches = many(25, () => match({ items: [1, 2, 3] }));
    const guide = guideFromSample({ matches, items: ITEMS, detail: null, talents: [], support: false });
    expect(guide?.core.map((each) => each.key).sort()).toEqual(['battle_fury', 'black_king_bar', 'blink']);
    expect(guide?.core.every((each) => each.minute === undefined)).toBe(true);
    expect(guide?.start).toBeNull();
    expect(guide?.plan).toBeNull();
    expect(guide?.alt).toBeNull();
    expect(guide?.withPurchases).toBe(false);
  });

  it('keeps only the newest patch when it holds enough matches, and reports the days it spans', () => {
    const day = 86_400;
    const matches = [
      ...many(30, (index) => match({ items: [1, 2, 3], patch: 5, startedAt: 1000 + index * day })),
      ...many(10, () => match({ items: [4], patch: 4, startedAt: 0 }))
    ];
    const guide = guideFromSample({ matches, items: ITEMS, detail: null, talents: [], support: false });
    expect(guide?.matches).toBe(30);
    expect(guide?.days).toBe(29);
  });

  it('has no alternative when every match ends with the main core', () => {
    const matches = many(20, () => match({ items: [1, 2, 3, 5] }));
    const rows = inventoryShares(matches, ITEMS, false);
    const { core } = splitAnchors(rows);
    expect(
      altFromSample({ matches, rows, core, items: ITEMS, support: false, detail: null, talents: [], plan: null })
    ).toBeNull();
  });
});

describe('the alternative build', () => {
  it('is the biggest group with another set: own win rate, its swaps and the item it turns on', () => {
    // Main: Blink, BKB, Battle Fury. Eight of twenty-five swap Battle Fury for Nullifier and lose more.
    const matches = [
      ...many(17, () => match({ items: [1, 2, 3], victory: true })),
      ...many(8, (index) => match({ items: [1, 2, 5], victory: index < 3 }))
    ];
    const rows = inventoryShares(matches, ITEMS, false);
    const { core } = splitAnchors(rows);
    const alt = altFromSample({
      matches,
      rows,
      core,
      items: ITEMS,
      support: false,
      detail: null,
      talents: [],
      plan: null
    });
    expect(alt?.keyItem).toBe('nullifier');
    expect(alt?.matches).toBe(8);
    expect(alt?.winRate).toBe(3 / 8);
    expect(alt?.swaps.map((swap) => [swap.from.key, swap.to.key])).toEqual([['battle_fury', 'nullifier']]);
  });
});

describe('neutrals and talent pairs', () => {
  it('takes the tier from STRATZ, adds an item’s rows and skips an item with no tier at all', () => {
    const picks = neutralPicks(
      [
        { itemId: 17, tier: 1, matches: 10 },
        { itemId: 17, tier: 1, matches: 15 },
        { itemId: 18, tier: null, matches: 99 },
        { itemId: 11, tier: 2, matches: 5 }
      ],
      ITEMS
    );
    expect(picks.map((each) => each.key)).toEqual(['trusty_shovel', 'tranquil_boots']);
  });

  it('orders the eight talents by the constants’ tiers, and keeps the datafeed order when they do not pair', () => {
    const talent = (key: string): TalentDetail => ({ id: key.length, key, name: key, bonuses: [] });
    const feed = ['d', 'c', 'b', 'a', 'h', 'g', 'f', 'e'].map(talent);
    const levels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((name, index) => ({
      name,
      level: Math.floor(index / 2) + 1
    }));
    expect(pairTalents(feed, levels).map((each) => each.key)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(pairTalents(feed, levels.slice(0, 6))).toBe(feed);
  });
});
