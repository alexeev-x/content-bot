import { edgeTextCache, STRATZ_CACHE_SECONDS } from '../../platform/edge-cache';
import { createDotaConstantsApi, DotaConstantsError } from '../../integrations/dotaconstants/dotaconstants';
import { createSteamPublicApi, SteamPublicError } from '../../integrations/steam-public/steam-public';
import { createOpenDotaApi, OpenDotaError } from '../../integrations/opendota/opendota-api';
import { createStratzApi, StratzError, STRATZ_GAP_MS } from '../../integrations/stratz/stratz-api';
import { createValveDatafeedApi, DatafeedError } from '../../integrations/valve-datafeed/valve-datafeed';
import { condenseBuild, isRelevantPath, parseBuildMessage, splitDiff, type GameFind } from '../../modules/game-files';
import type { HeroMatchSource, RubricSources } from '../../modules/rubrics';
import type { Container } from '../container';

// Where a rubric's live data comes from: dotaconstants, Valve's datafeed, Steam, the game-files tracker, STRATZ and
// OpenDota through the stats bridge, and the bot's own match base. Shared by the lab and the scheduler.

const BARE_FINDS_MAX = 4;
const BARE_TEXT_MAX = 1500;
const GITHUB_TIMEOUT_MS = 8000;

// Finds from before the check's note and the post link were kept (migration 0114) have no text: the writer gets the
// build's own changed lines instead, read the way the game-files flow reads them. A failed read leaves the find as it was.
/**
 * DEV samples only: the week's builds straight from the tracker when the watch kept no find (DEV runs with the background
 * work off; production has it on, and this sample page goes once every rubric is approved),
 * owner 26.10.2026: «собрать данные за неделю назад»: only builds touching heroes, abilities, items or the strings.
 */
export async function trackerFinds(container: Container, since: number): Promise<GameFind[]> {
  const github = container.gameFilesRepo;
  if (github === null) return [];
  try {
    const commits = await github.listCommits(30, AbortSignal.timeout(GITHUB_TIMEOUT_MS));
    return commits
      .filter((commit) => commit.committedAt >= since)
      .flatMap((commit) => {
        const header = parseBuildMessage(commit.message);
        return header !== null && header.paths.some(isRelevantPath)
          ? [{ sha: commit.sha, build: header.build, committedAt: commit.committedAt, note: null, text: null }]
          : [];
      })
      .slice(0, BARE_FINDS_MAX);
  } catch {
    return [];
  }
}

export async function fillBareFinds(container: Container, finds: GameFind[]): Promise<GameFind[]> {
  const github = container.gameFilesRepo;
  if (github === null) return finds;
  const bare = finds.filter((find) => find.text === null && find.note === null).slice(0, BARE_FINDS_MAX);
  const filled = new Map<string, string>();
  await Promise.all(
    bare.map(async (find) => {
      try {
        const whole = await github.getCommitDiff(find.sha, AbortSignal.timeout(GITHUB_TIMEOUT_MS));
        const text = condenseBuild(splitDiff(whole));
        if (text !== null) filled.set(find.sha, text.slice(0, BARE_TEXT_MAX));
      } catch {
        // The find stays without text.
      }
    })
  );
  return finds.map((find) => ({ ...find, text: filled.get(find.sha) ?? find.text }));
}

/** The guide's window and band in the statistics base (owner, 29.10.2026): 14 days of Immortal games. */
const GUIDE_DAYS_MS = 14 * 86_400_000;
const GUIDE_BAND = 'immortal';
const GUIDE_GAMES_MAX = 20_000;

/**
 * The statistics base as the guide reads it (`modules/hero-stats`): one hero at one position over the last 14 days,
 * without the followed players' own rows (they win more than their lobby, so their games would flatter the hero).
 * Null where the base is not bound (DEV never runs it): the guide then keeps STRATZ's sample.
 */
export function heroMatchSource(container: Container): HeroMatchSource | null {
  const repo = container.heroStats;
  if (repo === null) return null;
  const fair = async (heroId: number, position: number, limit: number) =>
    (await repo.rows(heroId, position, container.clock.now() - GUIDE_DAYS_MS, GUIDE_BAND, limit)).filter(
      (row) => !row.tracked
    );
  return {
    async games(heroId, position) {
      return (await fair(heroId, position, GUIDE_GAMES_MAX)).map((row) => ({
        won: row.won,
        minutes: row.minutes,
        enemies: row.enemies
          .split(',')
          .map((slot) => Number(slot.split(':')[0]))
          .filter((hero) => Number.isInteger(hero) && hero > 0)
      }));
    },
    async sample(heroId, position, limit) {
      return (await fair(heroId, position, limit * 2)).slice(0, limit).map((row) => ({
        victory: row.won,
        startedAt: Math.floor(row.startedAt / 1000),
        patch: row.patch,
        minutes: row.minutes,
        items: row.detail.i,
        neutral: row.detail.n,
        purchases: row.detail.p.map(([itemId, minute]) => ({ itemId, minute })),
        // The base keeps the order the points were spent in: level n is the n-th point.
        abilities: row.detail.s.map((abilityId, index) => ({ abilityId, time: index, level: index + 1 }))
      }));
    },
    worstGames: (sinceMs, untilMs, limit, wide) => repo.worstGames(sinceMs, untilMs, limit, wide)
  };
}

export function rubricSources(
  gameFinds: (since: number) => Promise<GameFind[]>,
  stratzAccess: { token: string; bridgeUrl?: string } | null
): RubricSources {
  const stratz =
    stratzAccess === null
      ? null
      : createStratzApi({ ...stratzAccess, cache: edgeTextCache('stratz', STRATZ_CACHE_SECONDS) });
  // One STRATZ request at a time with a pause between (owner, 27.10.2026: «не надо спешить… делай по 1 запросу»):
  // eight at once came back STRATZ_BLOCKED. The chain lives for this one sample only.
  let turn: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(call: () => Promise<T>): Promise<T> => {
    const run = turn.then(call);
    const pause = () => new Promise((resolve) => setTimeout(resolve, STRATZ_GAP_MS));
    turn = run.then(pause, pause);
    return run;
  };
  const openDota = stratzAccess === null ? null : createOpenDotaApi({ bridgeUrl: stratzAccess.bridgeUrl });
  const constants = createDotaConstantsApi();
  const datafeed = createValveDatafeedApi();
  const steam = createSteamPublicApi();
  return {
    heroes: () => constants.heroes(),
    items: () => constants.items(),
    async itemValues(itemKey) {
      const item = (await datafeed.itemList()).find((each) => each.name === itemKey);
      return item === undefined ? null : datafeed.itemValues(item.id);
    },
    async itemNames() {
      return new Map((await datafeed.itemList()).map((item) => [item.name, item.nameLoc]));
    },
    async heroDetail(heroId) {
      const hero = await datafeed.hero(heroId);
      return {
        id: hero.id,
        name: hero.name,
        localizedName: hero.nameLoc,
        abilities: hero.abilities.map((ability) => ({
          id: ability.id,
          key: ability.name,
          name: ability.nameLoc,
          isUltimate: ability.type === 1,
          cooldowns: ability.cooldowns,
          manaCosts: ability.manaCosts,
          values: ability.values.map((value) => ({ name: value.name, heading: value.heading, values: value.values }))
        })),
        talents: hero.talents.map((talent) => ({
          id: talent.id,
          key: talent.name,
          name: talent.nameLoc,
          // What the hero's abilities say this talent adds, by the value's name.
          bonuses: hero.abilities.flatMap((ability) =>
            ability.values.flatMap((value) =>
              value.bonuses
                .filter((bonus) => bonus.talent === talent.name)
                .map((bonus) => ({ name: value.name, value: bonus.value }))
            )
          )
        }))
      };
    },
    patches: () => datafeed.patchList(),
    async patchNotes(version) {
      const notes = await datafeed.patchNotes(version);
      return { version: notes.version, timestamp: notes.timestamp, heroes: notes.heroes };
    },
    talentLevels: (heroName) => constants.talentLevels(heroName),
    steamNews: () => steam.dotaNews(),
    workshopTrendingIds: () => steam.workshopTrendingIds(),
    workshopItem: (id) => steam.workshopItem(id),
    gameFinds,
    fallback:
      openDota === null
        ? null
        : {
            async heroItemPopularity(heroId) {
              const rows = await inTurn(() => openDota.heroItemPopularity(heroId));
              const each = (counts: Record<string, number>) =>
                Object.entries(counts).map(([itemId, matches]) => ({ itemId: Number(itemId), matches }));
              return {
                start: each(rows.start_game_items),
                early: each(rows.early_game_items),
                mid: each(rows.mid_game_items),
                late: each(rows.late_game_items)
              };
            },
            async heroMatchups(heroId) {
              const rows = await inTurn(() => openDota.heroMatchups(heroId));
              return rows.map((row) => ({ heroId: row.hero_id, matches: row.games_played, wins: row.wins }));
            },
            async heroDurations(heroId) {
              const rows = await inTurn(() => openDota.heroDurations(heroId));
              return rows.map((row) => ({ from: row.duration_bin, matches: row.games_played, wins: row.wins }));
            }
          },
    stats:
      stratz === null
        ? null
        : {
            async heroBracketStats(bracket) {
              const rows = await inTurn(() => stratz.heroWeeks(bracket, 1));
              return rows.map((row) => ({ heroId: row.heroId, bracket, matches: row.matches, wins: row.wins }));
            },
            async heroLateItems(heroId) {
              // Items bought from minute 20 on, most bought first.
              const totals = new Map<number, number>();
              for (const row of await inTurn(() => stratz.heroPurchases(heroId))) {
                if (row.minute >= 20) totals.set(row.itemId, (totals.get(row.itemId) ?? 0) + row.matches);
              }
              return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([itemId]) => itemId);
            },
            heroPurchases: (heroId) => inTurn(() => stratz.heroPurchases(heroId)),
            heroPositionDays: (heroId, position, days) => inTurn(() => stratz.heroPositionDays(heroId, position, days)),
            heroStartingItems: (heroId, position) => inTurn(() => stratz.startingItems(heroId, position)),
            heroPositionPurchases: (heroId, position) => inTurn(() => stratz.positionPurchases(heroId, position)),
            heroNeutralItems: (heroId, position) => inTurn(() => stratz.neutralItems(heroId, position)),
            heroTalents: (heroId, position) => inTurn(() => stratz.talents(heroId, position)),
            heroMatchups: (heroId) => inTurn(() => stratz.matchups(heroId)),
            heroGuideSample: (heroId, position, withPurchases) =>
              inTurn(() => stratz.guideSample(heroId, position, withPurchases)),
            positions: () => inTurn(() => stratz.positions()),
            positionWeeks: (bracket, position, weeks) => inTurn(() => stratz.positionWeeks(bracket, position, weeks)),
            lengthRates: (position) => inTurn(() => stratz.lengthRates(position)),
            twoWeeks: (bracket) => inTurn(() => stratz.heroWeeks(bracket, 2))
          }
  };
}

export function sourceError(error: unknown): { code: string; status: number | null } | null {
  if (
    error instanceof DotaConstantsError ||
    error instanceof DatafeedError ||
    error instanceof SteamPublicError ||
    error instanceof StratzError ||
    error instanceof OpenDotaError
  ) {
    return { code: error.code, status: error.httpStatus };
  }
  return null;
}
