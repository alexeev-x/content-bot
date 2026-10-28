import { MATCH_PLAYERS_MAX, type StratzMatch } from '../../integrations/stratz/stratz-api';
import type { HeroMatchPlayerRow } from '../../modules/hero-matches';
import type { AiJob } from '../bot/ai-job';
import type { Container } from '../container';

// The hero-matches base (owner, 28.10.2026: «по любому герою», «нестандартные сборки»): every Dota run of the Cron
// queues two jobs (each its own invocation and CPU). Every hour and a half one lists OpenDota's newest high-rank public
// matches (100, about 1 600 a day); twelve hours after a match STRATZ knows its positions, and each job reads four
// queued matches from STRATZ in one request (about 2 300 a day with the retries) and keeps their ten players. A match without every position is tried again six hours later, three times at
// most. Rows older than 14 days go once a day. One OpenDota and one STRATZ request a run at most.

const LIST_EVERY_MS = 90 * 60_000;
const READ_DELAY_MS = 12 * 3_600_000;
const RETRY_MS = 6 * 3_600_000;
export const HERO_MATCHES_KEEP_MS = 14 * 86_400_000;
const CALL_TIMEOUT_MS = 25_000;
/** Consumables bought after the horn say nothing about a build and would only fill the base. */
const CONSUMABLES = new Set([38, 39, 40, 42, 43, 44, 46, 188, 216, 218, 237, 241, 1123, 4204, 4205, 4206]);
const PURCHASES_MAX = 120;

const slot = (player: { heroId: number; position: number | null }) => `${player.heroId}:${player.position ?? 0}`;

/** A match's ten players as rows, or none when STRATZ lacks its outcome, length, start or any position. */
export function heroMatchRows(match: StratzMatch): HeroMatchPlayerRow[] {
  const { startedAt, minutes, radiantWon, players } = match;
  if (startedAt === null || minutes === null || radiantWon === null || players.length !== 10) return [];
  // Every position and side known, five a side: a missing one would put a player on the wrong team.
  if (players.some((player) => player.position === null || player.radiant === null)) return [];
  if (players.filter((player) => player.radiant === true).length !== 5) return [];
  return players.map((player) => ({
    heroId: player.heroId,
    position: player.position ?? 0,
    startedAt: startedAt * 1000,
    matchId: match.id,
    won: player.radiant === radiantWon,
    minutes,
    allies: players
      .filter((other) => other !== player && other.radiant === player.radiant)
      .map(slot)
      .join(','),
    enemies: players
      .filter((other) => other.radiant !== player.radiant)
      .map(slot)
      .join(','),
    detail: {
      v: match.patch,
      i: player.items.slice(0, 6),
      n: player.neutral,
      p: player.purchases
        .filter((each) => each.minute < 0 || !CONSUMABLES.has(each.itemId))
        .slice(0, PURCHASES_MAX)
        .map((each): [number, number] => [each.itemId, each.minute]),
      s: player.skills.slice(0, 30)
    }
  }));
}

/** One run; never throws (a failure is logged and the next run goes on). */
export async function runHeroMatches(
  container: Container,
  job: Extract<AiJob, { kind: 'hero_matches' }>,
  requestId: string,
  onError: (error: unknown) => void
): Promise<void> {
  const apis = container.statsApis;
  if (apis === null) return;
  // No job bookkeeping in ai_queue_jobs (28.10.2026: about 3 300 D1 rows written a day for the watches alone): a
  // redelivered copy is harmless, every claim inside is conditional.
  try {
    const repo = container.heroMatches;
    const now = container.clock.now();
    await repo.purge(now, now - HERO_MATCHES_KEEP_MS);
    let listed = 0;
    if (await repo.claimListing(now, LIST_EVERY_MS)) {
      const last = await repo.lastListed();
      const rows = await apis.openDota.publicMatches(AbortSignal.timeout(CALL_TIMEOUT_MS));
      listed = await repo.enqueue(
        rows
          .filter((row) => row.match_id > last && row.start_time * 1000 >= now - HERO_MATCHES_KEEP_MS)
          .map((row) => ({ matchId: row.match_id, startedAt: row.start_time * 1000 })),
        READ_DELAY_MS
      );
    }
    const due = await repo.claimDue(now, MATCH_PLAYERS_MAX, RETRY_MS);
    let stored = 0;
    if (due.length > 0) {
      const matches = await apis.stratz.matchPlayers(due, AbortSignal.timeout(CALL_TIMEOUT_MS));
      const rows = matches.flatMap(heroMatchRows);
      const done = [...new Set(rows.map((row) => row.matchId))];
      await repo.store(rows, done);
      stored = done.length;
    }
    container.logger.info({
      component: 'hero_matches',
      operation: 'collect',
      requestId,
      status: `listed ${listed}, read ${due.length}, kept ${stored}`
    });
  } catch (error) {
    onError(error);
  }
}
