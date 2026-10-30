import { describe, expect, it } from 'vitest';
import {
  buildAbsurdity,
  buildIcons,
  scoreEvidence,
  shameOfDay,
  shameScore,
  worstBuild,
  worstByScore
} from './shame-of-day';
import type { RubricContext, ShameGame } from './types';

// The one place a bug would post the wrong game: score order, tie-breaks and the evidence picked.
const KEYS = new Map<number, string>([
  [109, 'hand_of_midas'],
  [133, 'rapier'],
  [29, 'boots'],
  [79, 'mekansm'],
  [231, 'guardian_greaves'],
  [1, 'blink']
]);
const MEDIANS = [
  { position: 1, deaths: 5, kills: 7, assists: 8, nw20: 6000 },
  { position: 5, deaths: 8, kills: 2, assists: 15, nw20: null }
];
const game = (over: Partial<ShameGame>): ShameGame => ({
  heroId: 1,
  position: 1,
  minutes: 40,
  kills: 7,
  deaths: 8,
  assists: 8,
  damage: 20000,
  nw20: 6000,
  lane: 0,
  purchases: [],
  items: [],
  neutral: null,
  allyNw20: [],
  damages: [],
  ...over
});

describe('shame of the day', () => {
  const feeder = game({
    heroId: 10,
    kills: 1,
    deaths: 17,
    assists: 3,
    nw20: 4800,
    allyNw20: [{ position: 5, nw20: 5900 }],
    purchases: [[109, 24]]
  });
  const support = game({ heroId: 20, position: 5, kills: 0, deaths: 14, assists: 9 });
  const shortGame = game({ heroId: 30, kills: 2, deaths: 12, assists: 4, minutes: 26 });

  it('picks the feeder over a support with fewer deaths and a short game', () => {
    expect(worstByScore([support, shortGame, feeder], MEDIANS, KEYS)?.game.heroId).toBe(10);
  });

  it('weighs a death in a short game more and ties go to more deaths', () => {
    expect(shameScore(shortGame, MEDIANS, false)).toBeGreaterThan(
      shameScore(game({ ...shortGame, minutes: 40 }), MEDIANS, false)
    );
    const a = game({ heroId: 1, kills: 7, deaths: 5, assists: 8, minutes: 40 });
    const b = game({ heroId: 2, kills: 7, deaths: 5, assists: 8, minutes: 50 });
    expect(worstByScore([a, b], MEDIANS, KEYS)?.game.heroId).toBe(2);
  });

  it('shows at most two pieces of evidence, networth first, and falls back to deaths', () => {
    const kinds = scoreEvidence(
      {
        ...feeder,
        purchases: [
          [109, 24],
          [109, 30],
          [133, 28]
        ],
        damage: 100,
        damages: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
      },
      KEYS,
      MEDIANS
    ).map((each) => each.kind);
    expect(kinds).toEqual(['networth', 'damage']);
    expect(scoreEvidence(support, KEYS, MEDIANS).map((each) => each.kind)).toEqual(['deaths']);
  });

  it('judges a build by the rule table and ignores a normal one', () => {
    const absurd = game({
      position: 1,
      items: [79, 231, 29],
      purchases: [
        [79, 18],
        [231, 31]
      ]
    });
    expect(buildAbsurdity(absurd, KEYS).evidence[0]?.kind).toBe('support_items');
    expect(worstBuild([game({ items: [29] }), absurd], KEYS)?.game).toBe(absurd);
    expect(worstBuild([game({ items: [29] })], KEYS)).toBeNull();
  });

  it('skips a hero among the last three winners and remembers the new one', async () => {
    const worst = game({ heroId: 10, kills: 0, deaths: 20, assists: 1, purchases: [[109, 30]] });
    const next = game({ heroId: 20, kills: 1, deaths: 15, assists: 2, purchases: [[109, 30]] });
    const remembered: number[] = [];
    const heroNames = new Map([
      [10, 'axe'],
      [20, 'lion']
    ]);
    const context = {
      now: 3 * 86_400_000,
      random: () => 0,
      sources: {
        heroes: async () =>
          [...heroNames].map(([id, name]) => ({ id, name: 'npc_dota_hero_' + name, localizedName: name })),
        items: async () => [...KEYS].map(([id, key]) => ({ id, key })),
        turns: { next: async () => 0 },
        shameHeroes: { used: async () => [5, 10, 7], remember: async (id: number) => void remembered.push(id) },
        heroMatches: { worstGames: async () => ({ dayMatches: 100, games: [worst, next], medians: MEDIANS }) }
      }
    } as unknown as RubricContext;
    const sample = await shameOfDay(context);
    expect(remembered).toEqual([20]);
    expect(sample.text).toContain('1/15/2');
  });

  it('shows the whole build: six slots and the neutral, evidence marked', () => {
    const full = game({ items: [79, 231, 29, 109, 133, 1], neutral: 29, purchases: [[109, 24]] });
    const icons = buildIcons(full, KEYS, [{ kind: 'midas', fact: '', items: [{ key: 'hand_of_midas', minute: 24 }] }]);
    expect(icons).toHaveLength(7);
    expect(icons.find((each) => each.key === 'hand_of_midas')).toMatchObject({ minute: 24, evidence: true });
  });
});
