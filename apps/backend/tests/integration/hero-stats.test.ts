import { beforeEach, describe, expect, it } from 'vitest';
import { StratzError } from '../../src/integrations/stratz/stratz-api';
import {
  createStratzMatches,
  type StratzFullMatch,
  type StratzMatchesApi
} from '../../src/integrations/stratz/stratz-matches';
import { READ_DAY_CAP, runHeroStats, STATS_KEEP_MS, STRATZ_DAY_CAP } from '../../src/app/workflows/hero-stats';
import { planSnapshots, snapshotHero } from '../../src/app/workflows/hero-stats-snapshot';
import { createD1HeroStats, keepMatch, type HeroStatsRepository } from '../../src/modules/hero-stats';
import { testStatsDb } from '../helpers/db';
import { START } from '../helpers/harness';

// The hero statistics base (owner, 29.10.2026): leaderboard accounts → their parsed ranked matches over a rolling
// 72 hours → whole matches read ten at a time, kept only when every check passes. Overlapping runs never read a match
// twice, a relisting never queues a kept match again, the budget and STRATZ's refusals stop the requests, and the
// purge never touches the kept window.

const DAY = 86_400_000;
const sec = (ms: number) => Math.floor(ms / 1000);

function match(id: number, overrides: Partial<StratzFullMatch> = {}, accounts: number[] = []): StratzFullMatch {
  return {
    id,
    startedAt: sec(START) - 3600,
    seconds: 40 * 60,
    patch: 190,
    radiantWon: true,
    bracket: 8,
    rank: 80,
    region: 3,
    lobby: 'RANKED',
    mode: 'ALL_PICK_RANKED',
    parsed: true,
    lanes: { top: 'TIE', mid: 'RADIANT_VICTORY', bottom: 'DIRE_STOMP' },
    draft: [{ heroId: 1, pick: true, radiant: true, order: 0 }],
    players: Array.from({ length: 10 }, (_, index) => ({
      accountId: accounts[index] ?? null,
      radiant: index < 5,
      heroId: index + 1,
      position: (index % 5) + 1,
      lane: index % 5 === 1 ? 'MID_LANE' : 'SAFE_LANE',
      leaver: 'NONE',
      kills: 5,
      deaths: 3,
      assists: 10,
      gpm: 500,
      xpm: 600,
      damage: 20_000,
      items: [1, 2],
      neutral: null,
      purchases: [
        { itemId: 44, second: -60 },
        { itemId: 214, second: 7 * 60 }
      ],
      skills: [5601, 886, 5601],
      networth: Array.from({ length: 25 }, (__, minute) => minute * 400)
    })),
    ...overrides
  };
}

let repo: HeroStatsRepository;
let now: number;
let calls: string[];
let listed: Map<number, { matchId: number; startedAt: number }[]>;
let stored: Map<number, StratzFullMatch>;
let failNext: Error | null;

const stratz: StratzMatchesApi = {
  async leaderboard(division, skip) {
    calls.push(`leaderboard:${division}:${skip}`);
    return division === 'EUROPE' && skip === 0
      ? [101, 102, 103].map((accountId, rank) => ({ accountId, rank: rank + 1 }))
      : [];
  },
  async playerMatches(ids, since) {
    calls.push(`list:${ids.join(',')}`);
    if (failNext !== null) throw failNext;
    return {
      found: new Map(ids.map((id) => [id, (listed.get(id) ?? []).filter((each) => each.startedAt >= since)])),
      failed: []
    };
  },
  async readMatches(ids) {
    calls.push(`read:${ids.join(',')}`);
    const matches = ids.flatMap((id) => stored.get(id) ?? []);
    return { matches, missing: ids.filter((id) => !stored.has(id)), invalid: [] };
  }
};

const run = () => runHeroStats({ repo, stratz, now: () => now, log: () => undefined });

beforeEach(async () => {
  const db = testStatsDb();
  await db.batch(
    [
      'stats_state',
      'stats_budget',
      'stats_accounts',
      'stats_queue',
      'stats_matches',
      'stats_players',
      'stats_days',
      'stats_snapshots',
      'stats_health'
    ].map((table) => db.prepare(`DELETE FROM ${table}`))
  );
  repo = createD1HeroStats(db);
  now = START;
  calls = [];
  failNext = null;
  listed = new Map([
    [
      101,
      [
        { matchId: 9001, startedAt: sec(START) - 3600 },
        { matchId: 9002, startedAt: sec(START) - 7200 }
      ]
    ]
  ]);
  stored = new Map([
    [9001, match(9001, {}, [101])],
    [9002, match(9002, { players: match(9002).players.map((p, i) => (i === 1 ? { ...p, position: 1 } : p)) })]
  ]);
});

describe('keepMatch', () => {
  const sets = [new Set([101]), new Set([101])] as const;
  it.each([
    ['a clean match', match(1), true, null],
    [
      'two carries on one side',
      match(1, { players: match(1).players.map((p, i) => (i === 1 ? { ...p, position: 1 } : p)) }),
      false,
      'positions'
    ],
    [
      'an abandon',
      match(1, { players: match(1).players.map((p, i) => (i === 7 ? { ...p, leaver: 'ABANDONED' } : p)) }),
      false,
      'leaver'
    ],
    ['a remake', match(1, { seconds: 8 * 60 }), false, 'short'],
    ['a turbo game', match(1, { mode: 'TURBO' }), false, 'not_ranked'],
    ['a Legend lobby', match(1, { bracket: 5 }), false, 'low_bracket'],
    ['an unparsed match', match(1, { parsed: false }), false, 'not_parsed'],
    ['no outcome', match(1, { radiantWon: null }), false, 'no_outcome']
  ])('%s', (_name, input, kept, reason) => {
    const verdict = keepMatch(input, ...sets);
    expect(verdict.kept).toBe(kept);
    if (!verdict.kept) expect(verdict.reason).toBe(reason);
  });

  it('marks followed players, sides, lanes and minutes', () => {
    const verdict = keepMatch(match(1, {}, [101]), ...sets);
    if (!verdict.kept) throw new Error('dropped');
    const [carry, mid, , , , direCarry] = verdict.players;
    expect(carry).toMatchObject({ tracked: true, won: true, minutes: 40, lane: -1, nw10: 4000, topPlayers: 1 });
    expect(mid).toMatchObject({ tracked: false, lane: 1 });
    expect(direCarry).toMatchObject({ won: false, lane: 0 });
    expect(carry?.detail.p).toEqual([
      [44, -1],
      [214, 7]
    ]);
  });
});

describe('runHeroStats', () => {
  it('follows the leaderboard, lists, reads and keeps only clean matches', async () => {
    const first = await run();
    expect(first.leaderboard).toBe(3);
    expect(first).toMatchObject({ listed: 2, queued: 2, read: 2, kept: 1, dropped: 1 });
    const players = await testStatsDb().prepare('SELECT COUNT(*) AS n FROM stats_players').first<{ n: number }>();
    expect(players?.n).toBe(10);
    // The relisting 72 hours later finds the same matches: nothing is queued or read again.
    now += 7 * 3_600_000;
    calls = [];
    const again = await run();
    expect(again).toMatchObject({ listed: 2, queued: 0, read: 0 });
    expect(calls.filter((call) => call.startsWith('read:'))).toEqual([]);
  });

  it('two overlapping runs never read the same match twice', async () => {
    await run();
    stored.set(9003, match(9003));
    listed.set(102, [{ matchId: 9003, startedAt: sec(START) }]);
    await testStatsDb().prepare('UPDATE stats_accounts SET next_scan_at = 0').run();
    calls = [];
    await Promise.all([run(), run()]);
    expect(calls.filter((call) => call.includes('9003') && call.startsWith('read:'))).toHaveLength(1);
  });

  it('a missing match stays queued for another try; after three it is never queued again', async () => {
    stored.delete(9002);
    await run();
    const queued = () =>
      testStatsDb()
        .prepare('SELECT attempts, dropped FROM stats_queue WHERE match_id = 9002')
        .first<{ attempts: number; dropped: number }>();
    expect(await queued()).toMatchObject({ attempts: 1, dropped: 0 });
    for (let hour = 1; hour <= 6; hour += 1) {
      now += 2 * 3_600_000;
      await run();
    }
    expect(await queued()).toMatchObject({ attempts: 3, dropped: 1 });
    expect(calls.filter((call) => call === 'read:9002').length).toBeLessThanOrEqual(3);
  });

  it('a refused address pauses the collector for 30 minutes without more requests', async () => {
    failNext = new StratzError('STRATZ_BLOCKED', 403, 'refused');
    const first = await run();
    expect(first.paused).toBe('STRATZ_BLOCKED');
    calls = [];
    now += 10 * 60_000;
    expect((await run()).paused).toBe('pause');
    expect(calls).toEqual([]);
    now += 25 * 60_000;
    failNext = null;
    expect((await run()).paused).toBeNull();
  });

  it('the day budget stops every request at its cap', async () => {
    await testStatsDb()
      .prepare('INSERT INTO stats_budget (key, used) VALUES (?1, ?2)')
      .bind(`stratz:d:${Math.floor(now / DAY)}`, STRATZ_DAY_CAP)
      .run();
    const result = await run();
    expect(result.paused).toBe('budget');
    expect(calls).toEqual([]);
  });

  it('a spent read budget claims nothing, so queued matches keep their tries', async () => {
    await testStatsDb()
      .prepare('INSERT INTO stats_budget (key, used) VALUES (?1, ?2)')
      .bind(`read:d:${Math.floor(now / DAY)}`, READ_DAY_CAP)
      .run();
    const result = await run();
    expect(result).toMatchObject({ queued: 2, read: 0, paused: 'reads' });
    const rows = await testStatsDb()
      .prepare('SELECT attempts FROM stats_queue WHERE dropped = 0')
      .all<{ attempts: number }>();
    expect(rows.results.map((row) => row.attempts)).toEqual([0, 0]);
  });

  it('the purge drops rows past eight weeks and keeps the window', async () => {
    await run();
    now += STATS_KEEP_MS - DAY;
    await run();
    const count = async () =>
      (await testStatsDb().prepare('SELECT COUNT(*) AS n FROM stats_players').first<{ n: number }>())?.n;
    expect(await count()).toBe(10);
    now += 2 * DAY;
    await run();
    expect(await count()).toBe(0);
  });
});

describe('snapshots', () => {
  it('counts a hero per position, band and span, replaced in place', async () => {
    await run();
    const plan = await planSnapshots(repo, now);
    expect(plan).toMatchObject({ patch: 190, heroes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
    const base = new Map(
      [...(await repo.baseRates(plan.heroes, plan.since, plan.patch)).entries()].map(([key, rate]) => [
        key,
        { n: rate.matches, w: rate.wins }
      ])
    );
    const first = await snapshotHero(repo, plan, 2, base, now);
    expect(first).toBe(6);
    expect(await snapshotHero(repo, plan, 2, base, now)).toBe(6);
    const rows = await testStatsDb().prepare('SELECT COUNT(*) AS n FROM stats_snapshots').first<{ n: number }>();
    expect(rows?.n).toBe(6);
    const snap = await repo.snapshot(190, 2, 2, 'immortal', 'd8');
    expect(snap).toMatchObject({ matches: 1, wins: 1 });
    // Hero 1 is the followed account's: its own row never counts in the win rate.
    await snapshotHero(repo, plan, 1, base, now);
    expect(await repo.snapshot(190, 1, 1, 'all', 'd8')).toMatchObject({ matches: 0, wins: 0 });
  });
});

describe('createStratzMatches', () => {
  it('reads Shard from the buff events and the skill order by time, and keeps a match the others fail', async () => {
    const player = {
      steamAccountId: 7,
      isRadiant: true,
      heroId: 5,
      position: 'POSITION_5',
      lane: 'SAFE_LANE',
      leaverStatus: 'NONE',
      abilities: [
        { abilityId: 5127, time: 30, level: 1 },
        { abilityId: 5126, time: 200, level: 1 },
        { abilityId: 5127, time: 400, level: 2 }
      ],
      stats: {
        itemPurchases: [{ time: 420, itemId: 214 }],
        matchPlayerBuffEvent: [
          { time: 1020, itemId: 609 },
          { time: 1500, itemId: 609 },
          { time: 900, itemId: null }
        ],
        networthPerMinute: [0, 500]
      }
    };
    const body = { data: { m0: { id: 1, players: [player] }, m1: null, m2: { id: 'broken' } } };
    const api = createStratzMatches({
      token: 'test-token',
      fetchImpl: async () => new Response(JSON.stringify(body), { status: 200 })
    });
    const read = await api.readMatches([1, 2, 3]);
    expect(read.missing).toEqual([2]);
    expect(read.invalid).toEqual([3]);
    const [first] = read.matches;
    expect(first?.players[0]?.skills).toEqual([5127, 5126, 5127]);
    expect(first?.players[0]?.purchases).toEqual([
      { itemId: 214, second: 420 },
      { itemId: 609, second: 1020 }
    ]);
  });
});
