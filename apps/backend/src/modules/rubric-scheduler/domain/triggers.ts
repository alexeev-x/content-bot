import { addMskDays, mskDaysBetween, mskParts } from '../../../shared/msk-time';

// Event and chain rubrics (MASTER-PLAN stage 5, area-backend-core §5 «triggers.ts»): what the channel's events make
// due, each with its Moscow day window, its part of the day and a dedupe key (one post per patch, mark, announcement or
// week). Pure: the plan places them before the pool rubrics.

const DAY_MS = 86_400_000;
/** A hotfix within this many days of its patch joins the patch's chain (owner, 31.10.2026: answer 2). */
const HOTFIX_JOIN_DAYS = 5;
/** «Валв-тайм» marks: 30, 45, 60, 90 days without a patch, then every 30. */
const VALVE_MARKS = [30, 45, 60, 90];
/** «Оцениваем» looks at announcements this recent, 1–5 days after them. */
const ANNOUNCEMENT_MAX_DAYS = 21;
/** «Кого понерфят?» bets once a patch is this old. */
const BET_AFTER_DAYS = 21;

export interface PatchRelease {
  version: string;
  at: number;
}

export interface EventCandidate {
  rubric: string;
  dedupeKey: string;
  /** Moscow days, inclusive. */
  fromDay: string;
  toDay: string;
  part: 'day' | 'evening' | 'any';
  /** An exact Moscow minute (a greeting card's hour) instead of the part's slot. */
  minute?: number;
  reason: string;
}

export interface TriggerInput {
  now: number;
  patches: PatchRelease[];
  /** Steam announcements (their gid) with when they came out. */
  announcements: { gid: string; at: number }[];
  /** The game-files finds of the last 7 days not shown yet. */
  freshFinds: boolean;
  /** The open «Кого понерфят?» bet, if any, and the chain it was made on. */
  openBet: { chain: string } | null;
  /** «Открытка»: the dated cards with their day this year (resolved by the rubrics' calendar rules). */
  cards?: { id: string; day: string; minute: number; occasion: string }[];
  /** The id of the card for a major patch (`patch`), if the bank has one. */
  patchCard?: string | null;
}

/** `7.41a` → `7.41`; a version with no letter is its own base. */
export const baseVersion = (version: string) => /^(\d+\.\d+)[a-z]?$/.exec(version)?.[1] ?? version;

/** The patch chains: each base version with its first release, hotfixes within 5 days joined. Newest first. */
export function patchChains(patches: PatchRelease[]): { base: string; firstAt: number; versions: string[] }[] {
  const chains = new Map<string, { base: string; firstAt: number; versions: string[] }>();
  for (const patch of [...patches].sort((a, b) => a.at - b.at)) {
    const base = baseVersion(patch.version);
    const chain = chains.get(base);
    if (chain === undefined) chains.set(base, { base, firstAt: patch.at, versions: [patch.version] });
    else if (patch.at - chain.firstAt <= HOTFIX_JOIN_DAYS * DAY_MS) chain.versions.push(patch.version);
  }
  return [...chains.values()].sort((a, b) => b.firstAt - a.firstAt);
}

/** The «Валв-тайм» mark due around today: the newest of 30/45/60/90 then every 30 days since the last patch. */
export function valveMarks(daysSince: number): number[] {
  const marks = [...VALVE_MARKS];
  for (let mark = 120; mark <= daysSince + 2; mark += 30) marks.push(mark);
  return marks.filter((mark) => mark <= daysSince + 2 && mark >= daysSince - 1);
}

export function eventCandidates(input: TriggerInput): EventCandidate[] {
  const today = mskParts(input.now).day;
  const events: EventCandidate[] = [];
  const [chain] = patchChains(input.patches);

  if (chain !== undefined) {
    const d0 = mskParts(chain.firstAt).day;
    const age = mskDaysBetween(chain.firstAt, input.now);
    const day = (offset: number) => addMskDays(d0, offset);
    const key = (rubric: string) => `chain:${chain.base}:${rubric}`;
    if (age <= 7) {
      // The patch chain (RUBRICS_SCHEDULER.md 8b): 01 the day it lands, 02 the evening after, 03 on day 3, 07 around
      // day 5; 06's result on day 2 when a bet waited for this patch.
      events.push(
        {
          rubric: 'patch_broken',
          dedupeKey: key('patch_broken'),
          fromDay: day(0),
          toDay: day(1),
          part: 'day',
          reason: `Патч ${chain.base}: в день выхода`
        },
        {
          rubric: 'who_is_imba',
          dedupeKey: key('who_is_imba'),
          fromDay: day(1),
          toDay: day(2),
          part: 'evening',
          reason: `Патч ${chain.base}: на следующий вечер`
        },
        {
          rubric: 'nerf_or_buff',
          dedupeKey: key('nerf_or_buff'),
          fromDay: day(3),
          toDay: day(4),
          part: 'day',
          reason: `Патч ${chain.base}: на третий день`
        },
        {
          rubric: 'valve_seriously',
          dedupeKey: key('valve_seriously'),
          fromDay: day(4),
          toDay: day(6),
          part: 'evening',
          reason: `Патч ${chain.base}: на пятый день`
        }
      );
      if (input.openBet !== null && input.openBet.chain !== chain.base)
        events.push({
          rubric: 'who_gets_nerfed',
          dedupeKey: `bet-result:${input.openBet.chain}`,
          fromDay: day(2),
          toDay: day(3),
          part: 'day',
          reason: `Итог ставки: вышел патч ${chain.base}`
        });
    }
  }

  const latest = [...input.patches].sort((a, b) => b.at - a.at)[0];
  if (latest !== undefined) {
    const daysSince = mskDaysBetween(latest.at, input.now);
    for (const mark of valveMarks(daysSince)) {
      const markDay = addMskDays(mskParts(latest.at).day, mark);
      events.push({
        rubric: 'valve_time',
        dedupeKey: `valve_time:${latest.version}:${mark}`,
        // Moved at most two days earlier, never later (owner: answer 4, the picture shows the real count).
        fromDay: addMskDays(markDay, -2),
        toDay: markDay,
        part: 'day',
        reason: `${mark} дней без патча`
      });
    }
    if (input.openBet === null && daysSince >= BET_AFTER_DAYS)
      events.push({
        rubric: 'who_gets_nerfed',
        dedupeKey: `bet:${baseVersion(latest.version)}`,
        fromDay: today,
        toDay: addMskDays(today, 6),
        part: 'day',
        reason: `Ставка: патч ${baseVersion(latest.version)} вышел ${daysSince} дн. назад`
      });
  }

  for (const announcement of input.announcements) {
    const age = (input.now - announcement.at) / DAY_MS;
    if (age > ANNOUNCEMENT_MAX_DAYS) continue;
    const day = mskParts(announcement.at).day;
    events.push({
      rubric: 'rate_it',
      dedupeKey: `steam:${announcement.gid}`,
      fromDay: addMskDays(day, 1),
      toDay: addMskDays(day, 5),
      part: 'evening',
      reason: 'Анонс Valve: 1–5 дней после него'
    });
  }

  if (input.freshFinds) {
    // Friday evening, once a week, when the game's files showed something new.
    const weekday = new Date(input.now + 3 * 3_600_000).getUTCDay();
    const friday = addMskDays(today, (5 - weekday + 7) % 7);
    events.push({
      rubric: 'files_dont_lie',
      dedupeKey: `files:${friday}`,
      fromDay: friday,
      toDay: friday,
      part: 'evening',
      reason: 'Пятница: в файлах игры нашлось новое'
    });
  }
  // «Открытка» on its day at its hour (owner: answer 5); a missed day is skipped, never moved.
  for (const card of input.cards ?? []) {
    if (card.day < today || card.day > addMskDays(today, 2)) continue;
    events.push({
      rubric: 'greeting_card',
      dedupeKey: `card:${card.id}:${card.day.slice(0, 4)}`,
      fromDay: card.day,
      toDay: card.day,
      part: 'any',
      minute: card.minute,
      reason: card.occasion
    });
  }
  // The patch card only for a major patch (7.xx, no letter), the day it lands.
  if (chain !== undefined && input.patchCard != null && /^\d+\.\d{2}$/.test(chain.base)) {
    const d0 = mskParts(chain.firstAt).day;
    events.push({
      rubric: 'greeting_card',
      dedupeKey: `card:${input.patchCard}:${chain.base}`,
      fromDay: d0,
      toDay: addMskDays(d0, 1),
      part: 'any',
      reason: `Патч ${chain.base}: открытка`
    });
  }
  return events.filter((event) => event.toDay >= today);
}
