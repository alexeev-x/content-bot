import { beforeEach, describe, expect, it } from 'vitest';
import { createContainer, type Container } from '../../src/app/container';
import { HERO_MATCHES_KEEP_MS, runHeroMatches } from '../../src/app/workflows/hero-matches';
import type { OpenDotaApi } from '../../src/integrations/opendota/opendota-api';
import type { StratzApi, StratzMatch } from '../../src/integrations/stratz/stratz-api';
import { testDb } from '../helpers/db';
import { fakeClock, type FakeClock, OWNER_ID, resetDb, START } from '../helpers/harness';
import { testMediaBucket } from '../helpers/media-bucket';

// The hero-matches base (migration 0116): OpenDota's high-rank matches listed every 90 minutes, read from STRATZ twelve
// hours later in fours, a match without every position tried three times, rows kept 14 days. A failed or overlapping
// run never reads a match twice and never loses one.

const HOUR = 3_600_000;
const startSec = (match: number) => Math.floor(START / 1000) - 60 * (100 - match);

let listed: number[][];
let asked: number[][];
let stratzMatches: Map<number, StratzMatch>;
let clock: FakeClock;
let container: Container;

const player = (heroId: number, radiant: boolean, position: number | null) => ({
  heroId,
  radiant,
  position,
  items: [1, 2],
  neutral: null,
  purchases: [
    { itemId: 44, minute: -1 },
    { itemId: 44, minute: 5 },
    { itemId: 214, minute: 7 }
  ],
  skills: [5601, 886]
});

const whole = (id: number, positions = true): StratzMatch => ({
  id,
  startedAt: startSec(id),
  patch: 180,
  minutes: 40,
  radiantWon: true,
  players: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((heroId, index) =>
    player(heroId, index < 5, positions || index > 0 ? (index % 5) + 1 : null)
  )
});

const make = () =>
  createContainer(
    { DB: testDb(), MEDIA_BUCKET: testMediaBucket(), OWNER_TELEGRAM_ID: OWNER_ID },
    {
      clock,
      statsApis: {
        openDota: {
          publicMatches: async () =>
            (listed.shift() ?? []).map((id) => ({ match_id: id, start_time: startSec(id), avg_rank_tier: 80 }))
        } as unknown as OpenDotaApi,
        stratz: {
          matchPlayers: async (ids: readonly number[]) => {
            asked.push([...ids]);
            return ids.flatMap((id) => {
              const match = stratzMatches.get(id);
              return match === undefined ? [] : [match];
            });
          }
        } as unknown as StratzApi
      }
    }
  );

const run = () =>
  runHeroMatches(container, { id: crypto.randomUUID(), kind: 'hero_matches', chatId: Number(OWNER_ID) }, 't', () => {});

const count = async (table: string) =>
  (await testDb().prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>())?.n ?? 0;

beforeEach(async () => {
  await resetDb();
  listed = [];
  asked = [];
  stratzMatches = new Map();
  clock = fakeClock();
  container = make();
});

describe('the hero-matches collector', () => {
  it('lists once per 90 minutes, reads twelve hours later in fours, and keeps every player of a match', async () => {
    listed.push([91, 92, 93, 94, 95, 96, 97], [97, 98]);
    for (const id of [91, 92, 93, 94, 95, 96, 97]) stratzMatches.set(id, whole(id));
    await run();
    expect(await count('hero_match_queue')).toBe(7);
    expect(asked).toEqual([]);
    // Not 90 minutes yet: no second listing.
    clock.advance(HOUR);
    await run();
    expect(listed).toHaveLength(1);
    clock.advance(12 * HOUR);
    await run();
    expect(asked).toEqual([[91, 92, 93, 94]]);
    expect(await count('hero_match_players')).toBe(40);
    // The second listing takes only the match past the newest one listed.
    expect(await count('hero_match_queue')).toBe(4);
    const row = await testDb()
      .prepare(
        'SELECT won, minutes, allies, enemies, detail FROM hero_match_players WHERE hero_id = 1 AND match_id = 91'
      )
      .first<{ won: number; minutes: number; allies: string; enemies: string; detail: string }>();
    expect(row).toMatchObject({ won: 1, minutes: 40, allies: '2:2,3:3,4:4,5:5', enemies: '6:1,7:2,8:3,9:4,10:5' });
    // A consumable stays in the starting set and leaves the later purchases.
    expect(JSON.parse(row?.detail ?? '{}')).toEqual({
      v: 180,
      i: [1, 2],
      n: null,
      p: [
        [44, -1],
        [214, 7]
      ],
      s: [5601, 886]
    });
  });

  it('tries a match without every position three times, six hours apart, then drops it', async () => {
    listed.push([91]);
    stratzMatches.set(91, whole(91, false));
    await run();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      clock.advance(12 * HOUR);
      await run();
    }
    expect(asked).toEqual([[91], [91], [91]]);
    expect(await count('hero_match_queue')).toBe(0);
    expect(await count('hero_match_players')).toBe(0);
  });

  it('never reads a claimed match again in an overlapping run, and keeps it when STRATZ fails', async () => {
    listed.push([91]);
    stratzMatches.set(91, whole(91));
    await run();
    clock.advance(12 * HOUR);
    const failing = createContainer(
      { DB: testDb(), MEDIA_BUCKET: testMediaBucket(), OWNER_TELEGRAM_ID: OWNER_ID },
      {
        clock,
        statsApis: {
          openDota: { publicMatches: async () => [] } as unknown as OpenDotaApi,
          stratz: {
            matchPlayers: async () => {
              throw new Error('down');
            }
          } as unknown as StratzApi
        }
      }
    );
    await runHeroMatches(failing, { id: crypto.randomUUID(), kind: 'hero_matches', chatId: 1 }, 't', () => {});
    // Claimed by the failed run: the next one skips it until the retry.
    await run();
    expect(asked).toEqual([]);
    clock.advance(6 * HOUR);
    await run();
    expect(asked).toEqual([[91]]);
    expect(await count('hero_match_players')).toBe(10);
  });

  it('gives the guide one hero at one position, and purges rows past 14 days once a day', async () => {
    listed.push([91, 92]);
    stratzMatches.set(91, whole(91));
    stratzMatches.set(92, whole(92));
    await run();
    clock.advance(12 * HOUR);
    await run();
    const since = clock.now() - HERO_MATCHES_KEEP_MS;
    const games = await container.heroMatches.games(6, 1, since);
    expect(games).toEqual([
      { won: false, minutes: 40, enemies: [1, 2, 3, 4, 5] },
      { won: false, minutes: 40, enemies: [1, 2, 3, 4, 5] }
    ]);
    const sample = await container.heroMatches.sample(1, 1, since, 1);
    expect(sample.map((row) => row.startedAt)).toEqual([startSec(92) * 1000]);
    clock.advance(HERO_MATCHES_KEEP_MS);
    await run();
    expect(await count('hero_match_players')).toBe(0);
  });
});
