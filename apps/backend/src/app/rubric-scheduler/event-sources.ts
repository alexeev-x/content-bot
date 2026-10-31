import { eventCandidates, type EventCandidate } from '../../modules/rubric-scheduler';
import { GREETING_CARDS, resolveCardDate } from '../../modules/rubrics';
import { mskParts } from '../../shared/msk-time';
import type { Container } from '../container';

// What makes event rubrics due (stage 5): the stored patches and Steam announcements, the week's game-file finds and
// the open «Кого понерфят?» bet. Read once per plan step; a source that fails leaves its events out, never the plan.

const DAY_MS = 86_400_000;
/** A card's hour until the owner sets each one (owner, 31.10.2026: answer 5): 11:00 Moscow time. */
const CARD_MINUTE = 11 * 60;

/** The dated cards of this year and the next (a December run sees January); the four 14.02 cards by `year % 4`. */
function datedCards(now: number): { id: string; day: string; minute: number; occasion: string }[] {
  const year = Number(mskParts(now).day.slice(0, 4));
  const cards: { id: string; day: string; minute: number; occasion: string }[] = [];
  for (const each of [year, year + 1]) {
    const valentines = GREETING_CARDS.filter((card) => card.date === '02-14');
    const valentine = valentines[each % Math.max(valentines.length, 1)];
    for (const card of GREETING_CARDS) {
      if (card.date === '02-14' && card !== valentine) continue;
      const day = resolveCardDate(card.date, each);
      if (day !== null) cards.push({ id: card.id, day, minute: CARD_MINUTE, occasion: card.occasion });
    }
  }
  return cards;
}

export async function readEvents(
  container: Pick<Container, 'dotaItems' | 'gameFileBuilds' | 'rubricBets' | 'logger'>,
  now: number
): Promise<EventCandidate[]> {
  const safe = async <T>(read: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await read();
    } catch {
      container.logger.warn({
        component: 'rubric-scheduler',
        operation: 'events',
        status: 'partial',
        errorCode: 'EVENT_SOURCE'
      });
      return fallback;
    }
  };
  const [patches, announcements, finds, openBet] = await Promise.all([
    safe(() => container.dotaItems('patch_notes', now - 400 * DAY_MS), []),
    safe(() => container.dotaItems('steam_news', now - 21 * DAY_MS), []),
    safe(() => container.gameFileBuilds.recentFinds(now - 7 * DAY_MS), []),
    safe(() => container.rubricBets.open(), null)
  ]);
  return eventCandidates({
    now,
    patches: patches.map((item) => ({ version: item.externalId, at: item.publishedAt })),
    announcements: announcements.map((item) => ({ gid: item.externalId, at: item.publishedAt })),
    freshFinds: finds.length > 0,
    openBet: openBet === null ? null : { chain: openBet.chain },
    cards: datedCards(now),
    patchCard: GREETING_CARDS.find((card) => card.date === 'patch')?.id ?? null
  });
}
