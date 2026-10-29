import {
  LEADERBOARD_DIVISIONS,
  LEADERBOARD_PAGE,
  LIST_ACCOUNTS_MAX,
  READ_MATCHES_MAX,
  StratzRateError,
  type StratzMatchesApi
} from '../../integrations/stratz/stratz-matches';
import { StratzError } from '../../integrations/stratz/stratz-api';
import {
  keepMatch,
  type DropReason,
  type HeroStatsRepository,
  type StatsMatchRow,
  type StatsPlayerRow
} from '../../modules/hero-stats';
import type { NewContentAlert } from '../../modules/content-analytics';
import type { LogEvent } from '../../platform/logging/logger';
import { escapeHtml } from '../notifications/notice-template';

// The hero statistics collector (owner, 29.10.2026; plan `.logs/handoff/hero-matches-plan.md`). Every five minutes
// the Cron queues runs; each run, inside its own budget:
//   1. once a day deletes rows older than eight weeks;
//   2. reads one page of a regional season leaderboard (the followed accounts, ≈ 7000+ MMR) until all are read;
//   3. lists the parsed ranked matches of the accounts due, twenty per request, over a rolling 72 hours (STRATZ parses
//      out of order, so a «since the last match» watermark would lose matches for good; re-listed ones cost reads only);
//   4. reads queued matches, ten per request, keeps those that pass `keepMatch` and drops the rest for good.
// Every STRATZ request passes the hour's and the day's counters first. A 403 opens a 30-minute pause, a 429 waits
// what STRATZ asked. Nothing here runs on DEV (owner, 29.10.2026): local runs and production only.

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** Rows are kept eight weeks (owner decision 29.10.2026). */
export const STATS_KEEP_MS = 56 * DAY_MS;
const LISTING_WINDOW_S = 72 * 3600;
/** Half of STRATZ's limits (1 500/h, 15 000/day measured 29.10.2026), for the guide and local probes. */
export const STRATZ_HOUR_CAP = 750;
export const STRATZ_DAY_CAP = 7_500;
/** Matches read a day: ≈ 6 000 × 21 rows in and out stays far under D1's monthly writes. */
export const READ_DAY_CAP = 6_000;
const LIST_REQUESTS = 3;
const READ_REQUESTS = 3;
/** An account claimed for a scan is skipped by other runs for this long. */
const ACCOUNT_LEASE_MS = 30 * MINUTE_MS;
/** A match that failed to read waits this long; three tries at most. */
const READ_RETRY_MS = 2 * 60 * MINUTE_MS;
const BLOCKED_PAUSE_MS = 30 * MINUTE_MS;
const RATE_PAUSE_DEFAULT_MS = MINUTE_MS;
/** Pages per region: ten thousand places is past every leaderboard. */
const LEADERBOARD_PAGES = 10;
const LEADERBOARD_DONE = -1;

export interface HeroStatsDeps {
  repo: HeroStatsRepository;
  stratz: StratzMatchesApi;
  now: () => number;
  log: (event: LogEvent) => void;
}

export interface HeroStatsRunResult {
  purged: boolean;
  leaderboard: number;
  listed: number;
  queued: number;
  read: number;
  kept: number;
  dropped: number;
  /** Dropped matches by reason (for the daily health and the drop-rate check). */
  reasons: Partial<Record<DropReason | 'exhausted', number>>;
  failed: number;
  paused: string | null;
}

/** The pause a STRATZ failure opens, or null when the next request may go (a timeout, a 5xx). */
function pauseFor(error: unknown): { ms: number; code: string } | null {
  if (error instanceof StratzRateError)
    return { ms: (error.retryAfterSeconds ?? 0) * 1000 || RATE_PAUSE_DEFAULT_MS, code: 'STRATZ_RATE' };
  if (error instanceof StratzError && (error.code === 'STRATZ_BLOCKED' || error.code === 'STRATZ_TOKEN'))
    return { ms: BLOCKED_PAUSE_MS, code: error.code };
  return null;
}

const codeOf = (error: unknown) =>
  error instanceof StratzError ? error.code : error instanceof Error ? error.name : 'unknown';

/** One collector run. Never throws: a failure is counted in the day's health and logged with its code. */
export async function runHeroStats(deps: HeroStatsDeps): Promise<HeroStatsRunResult> {
  const { repo, stratz } = deps;
  const result: HeroStatsRunResult = {
    purged: false,
    leaderboard: 0,
    listed: 0,
    queued: 0,
    read: 0,
    kept: 0,
    dropped: 0,
    reasons: {},
    failed: 0,
    paused: null
  };
  let calls = 0;
  let lastError: string | undefined;
  const now = deps.now();
  /** Claimed matches not read yet: given back their try if the run stops for any reason. */
  let unread: number[] = [];
  /** Spends one STRATZ request; false when the budget or an open pause says no. */
  const mayCall = async () => {
    if (!(await repo.spendStratz(deps.now(), 1, STRATZ_HOUR_CAP, STRATZ_DAY_CAP))) {
      result.paused = 'budget';
      return false;
    }
    calls += 1;
    return true;
  };
  /** A STRATZ failure: pauses the collector when STRATZ asks for it; true when the run must stop. */
  const failed = async (error: unknown, step: string) => {
    const code = codeOf(error);
    lastError = `${step}: ${code}${error instanceof StratzError && error.httpStatus !== null ? ` ${error.httpStatus}` : ''}${
      error instanceof StratzError && error.detail !== undefined ? ` — ${error.detail}` : ''
    }`;
    deps.log({ component: 'hero_stats', operation: step, status: 'failed', errorCode: code });
    const pause = pauseFor(error);
    if (pause === null) return false;
    await repo.setState('paused_until', deps.now() + pause.ms);
    result.paused = pause.code;
    return true;
  };

  try {
    if ((await repo.stateValue('paused_until')) > now) {
      result.paused = 'pause';
      return result;
    }
    result.purged = await repo.purge(now, STATS_KEEP_MS);

    // 2. The leaderboards: a new round every day, one page per run until every region is read.
    if (await repo.claimTurn('leaderboard_round', now, DAY_MS)) await repo.setState('leaderboard_cursor', 0);
    const cursor = await repo.stateValue('leaderboard_cursor');
    if (cursor !== LEADERBOARD_DONE && (await mayCall())) {
      const division = Math.floor(cursor / LEADERBOARD_PAGES);
      const page = cursor % LEADERBOARD_PAGES;
      const region = LEADERBOARD_DIVISIONS[division];
      if (region === undefined) await repo.setState('leaderboard_cursor', LEADERBOARD_DONE);
      else
        try {
          const rows = await stratz.leaderboard(region, page * LEADERBOARD_PAGE);
          await repo.upsertLeaderboard(rows, now);
          result.leaderboard = rows.length;
          const next =
            rows.length < LEADERBOARD_PAGE || page + 1 >= LEADERBOARD_PAGES
              ? (division + 1) * LEADERBOARD_PAGES
              : cursor + 1;
          await repo.setState(
            'leaderboard_cursor',
            Math.floor(next / LEADERBOARD_PAGES) >= LEADERBOARD_DIVISIONS.length ? LEADERBOARD_DONE : next
          );
        } catch (error) {
          if (await failed(error, 'leaderboard')) return result;
          // A page that fails for another reason (a shape STRATZ changed) is skipped, so later regions still come.
          await repo.setState('leaderboard_cursor', (division + 1) * LEADERBOARD_PAGES);
        }
    }

    const sets = await repo.accountSets();

    // 3. Listing: the accounts due, twenty per request, over the last 72 hours.
    const accounts = await repo.claimAccounts(now, LIST_REQUESTS * LIST_ACCOUNTS_MAX, ACCOUNT_LEASE_MS);
    const since = Math.floor(now / 1000) - LISTING_WINDOW_S;
    for (let from = 0; from < accounts.length; from += LIST_ACCOUNTS_MAX) {
      const chunk = accounts.slice(from, from + LIST_ACCOUNTS_MAX);
      if (!(await mayCall())) break;
      let listing: Awaited<ReturnType<StratzMatchesApi['playerMatches']>>;
      try {
        listing = await stratz.playerMatches(chunk, since);
      } catch (error) {
        if (await failed(error, 'list')) break;
        continue;
      }
      const found: { matchId: number; startedAt: number; top: number }[] = [];
      const scans = chunk.map((accountId) => {
        const matches = listing.found.get(accountId) ?? [];
        for (const match of matches)
          found.push({
            matchId: match.matchId,
            startedAt: match.startedAt * 1000,
            top: sets.top.has(accountId) ? 1 : 0
          });
        return {
          accountId,
          found: matches.length,
          newest: matches.length === 0 ? null : Math.max(...matches.map((match) => match.startedAt)) * 1000,
          failed: listing.failed.includes(accountId)
        };
      });
      await repo.scanned(scans, now);
      result.listed += found.length;
      result.queued += await repo.enqueue(found, now);
    }

    // 4. Reading: the queued matches, leaderboard-heavy first, ten per request.
    if (result.paused === null) {
      // Claim only what the budgets still allow (a claim costs the match a try), and give back what is not read.
      const spent = await repo.stratzSpent(now);
      const requests = Math.min(READ_REQUESTS, STRATZ_HOUR_CAP - spent.hour, STRATZ_DAY_CAP - spent.day);
      const allowed = Math.min(requests * READ_MATCHES_MAX, READ_DAY_CAP - spent.reads);
      if (allowed <= 0) result.paused = spent.reads >= READ_DAY_CAP ? 'reads' : 'budget';
      const claimed = allowed <= 0 ? { ids: [], exhausted: 0 } : await repo.claimReads(now, allowed, READ_RETRY_MS);
      // Out of tries: counted with the dropped, not as a parse failure (that alert means a changed reply shape).
      result.dropped += claimed.exhausted;
      if (claimed.exhausted > 0) result.reasons.exhausted = claimed.exhausted;
      unread = claimed.ids;
      for (let from = 0; from < claimed.ids.length; from += READ_MATCHES_MAX) {
        const chunk = claimed.ids.slice(from, from + READ_MATCHES_MAX);
        const giveBack = async () => {
          await repo.release(claimed.ids.slice(from), deps.now());
          unread = [];
        };
        if (!(await mayCall())) {
          await giveBack();
          break;
        }
        if (!(await repo.spendReads(now, chunk.length, READ_DAY_CAP))) {
          result.paused = 'reads';
          await giveBack();
          break;
        }
        let read: Awaited<ReturnType<StratzMatchesApi['readMatches']>>;
        try {
          read = await stratz.readMatches(chunk);
        } catch (error) {
          if (await failed(error, 'read')) {
            await giveBack();
            break;
          }
          unread = claimed.ids.slice(from + READ_MATCHES_MAX);
          continue;
        }
        const kept: { match: StatsMatchRow; players: StatsPlayerRow[] }[] = [];
        const dropped: number[] = [];
        for (const match of read.matches) {
          const verdict = keepMatch(match, sets.tracked, sets.top);
          if (verdict.kept) kept.push({ match: verdict.match, players: verdict.players });
          else {
            dropped.push(match.id);
            result.reasons[verdict.reason] = (result.reasons[verdict.reason] ?? 0) + 1;
          }
        }
        result.dropped += dropped.length;
        // A missing or malformed match keeps its queue row: it is tried again until its tries run out.
        result.failed += read.invalid.length;
        if (read.invalid.length > 0) lastError = `read: STRATZ_SHAPE — ${read.invalid.length} матч(ей) не разобрались`;
        await repo.store(kept, dropped, now);
        unread = claimed.ids.slice(from + READ_MATCHES_MAX);
        result.read += read.matches.length;
        result.kept += kept.length;
      }
    }
  } catch (error) {
    // D1 or a bug: logged and counted; the next run starts over (every claim above is conditional).
    lastError = `run: ${codeOf(error)}`;
    deps.log({ component: 'hero_stats', operation: 'run', status: 'failed', errorCode: codeOf(error) });
    // Not given back (D1 still failing): those matches wait their retry time, nothing is lost.
    if (unread.length > 0)
      await repo
        .release(unread, deps.now())
        .catch((releaseError: unknown) =>
          deps.log({ component: 'hero_stats', operation: 'release', status: 'failed', errorCode: codeOf(releaseError) })
        );
  }
  try {
    await repo.addHealth(now, {
      listed: result.listed,
      read: result.read,
      kept: result.kept,
      dropped: result.dropped,
      failed: result.failed,
      calls,
      ...(result.kept > 0 ? { keptAt: now } : {}),
      ...(lastError === undefined ? {} : { error: lastError })
    });
  } catch (error) {
    deps.log({ component: 'hero_stats', operation: 'health', status: 'failed', errorCode: codeOf(error) });
  }
  deps.log({
    component: 'hero_stats',
    operation: 'collect',
    status: `leaderboard ${result.leaderboard}, listed ${result.listed}, queued ${result.queued}, read ${result.read}, kept ${result.kept}, dropped ${result.dropped}${Object.entries(
      result.reasons
    )
      .map(([reason, count]) => ` ${reason}×${count}`)
      .join('')}${result.paused === null ? '' : `, paused ${result.paused}`}`
  });
  return result;
}

/** Hours without a kept match after which the owner hears of it (plan §2.6). */
const STALL_HOURS = 2;
/** Share of read matches that failed to parse above which the owner hears of it. */
const FAILED_SHARE = 0.02;
const BUDGET_SHARE = 0.7;

/**
 * The collector's alerts, at most one of a kind a day (the alert id carries the day): nothing kept for two hours, a
 * STRATZ pause for a blocked address or token, parse failures above 2%, the day's STRATZ budget past 70%.
 */
export async function heroStatsAlerts(repo: HeroStatsRepository, now: number): Promise<NewContentAlert[]> {
  const day = Math.floor(now / DAY_MS);
  const [today, yesterday, spent, pausedUntil] = await Promise.all([
    repo.health(day),
    repo.health(day - 1),
    repo.stratzSpent(now),
    repo.stateValue('paused_until')
  ]);
  const alerts: NewContentAlert[] = [];
  const alert = (key: string, title: string, body: string) =>
    alerts.push({
      id: `hero-stats:${key}:${day}`,
      kind: 'item',
      title,
      body,
      html: `⚠️ <b>${escapeHtml(title)}</b>\n${escapeHtml(body)}`,
      buttons: [],
      linkPath: '/'
    });
  const lastKept = Math.max(today?.lastKeptAt ?? 0, yesterday?.lastKeptAt ?? 0);
  // Only once the collector has kept something: a fresh base waits for its first leaderboard round quietly.
  if (lastKept > 0 && now - lastKept > STALL_HOURS * 3_600_000)
    alert(
      'stalled',
      'База матчей не пополняется',
      `${STALL_HOURS} ч ни одного нового матча. Последняя ошибка: ${today?.lastError ?? yesterday?.lastError ?? 'нет'}.`
    );
  if (pausedUntil > now && /STRATZ_(BLOCKED|TOKEN)/u.test(today?.lastError ?? ''))
    alert('blocked', 'STRATZ закрыл доступ сбору матчей', `Сбор на паузе 30 мин. ${today?.lastError ?? ''}`);
  if (today !== null && today.read >= 200 && today.failed / today.read > FAILED_SHARE)
    alert(
      'failed',
      'Матчи STRATZ не разбираются',
      `${today.failed} из ${today.read} за сегодня. Возможно, STRATZ сменил формат ответа. ${today.lastError ?? ''}`
    );
  if (spent.day > STRATZ_DAY_CAP * BUDGET_SHARE)
    alert('budget', 'Сбор матчей тратит много запросов STRATZ', `${spent.day} из ${STRATZ_DAY_CAP} за сутки.`);
  return alerts;
}
