import { AppError } from '../../shared/app-error';
import { cardWeekday } from './calendar-rules';
import { type GreetingCard, GREETING_CARDS } from './greeting-cards';
import { pick, recentFacts, type RubricContext, type RubricSample } from './types';

// «Открытка» (31; owner, 30.10.2026): the owner's own picture for the day and the card's wish as the post's text, word
// for word. A dated card goes out on its day (the scheduler passes its id); a filler (a weekday or «any» card) takes an
// empty slot, the cards not used this round first. No picture uploaded, no post: never a text-only card.

const MSK_OFFSET_MS = 3 * 3_600_000;

/** The filler cards for a Moscow weekday: that day's cards and the «any» ones. */
function fillers(weekday: number): GreetingCard[] {
  return GREETING_CARDS.filter((card) => card.date === 'any' || cardWeekday(card.date) === weekday);
}

export async function greetingCard(context: RubricContext): Promise<RubricSample> {
  let card: GreetingCard | undefined;
  if (context.cardId !== undefined) card = GREETING_CARDS.find((each) => each.id === context.cardId);
  else {
    const weekday = new Date(context.now + MSK_OFFSET_MS).getUTCDay();
    const used = new Set(recentFacts(context, 200, (facts) => facts.card));
    const pool = fillers(weekday);
    const fresh = pool.filter((each) => !used.has(each.id));
    card = pick(fresh.length > 0 ? fresh : pool, context.random);
  }
  if (card === undefined) throw new AppError('UNAVAILABLE', 'No such card', { reason: 'NO_DATA' });
  const picture = (await context.sources.greetingPicture?.(card.id)) ?? null;
  if (picture === null)
    throw new AppError('UNAVAILABLE', `No picture for the card ${card.id}`, { reason: 'GREETING_PICTURE_MISSING' });
  const heroes = await context.sources.heroes();
  const keys = card.hero === null ? [] : Array.isArray(card.hero) ? card.hero : [card.hero];
  const heroIds = keys
    .map((key) => heroes.find((hero) => hero.name === `npc_dota_hero_${key}`)?.id)
    .filter((id): id is number => id !== undefined);
  return {
    picture: null,
    pictureBytes: picture,
    text: card.wish,
    ownText: true,
    facts: {
      card: card.id,
      year: new Date(context.now + MSK_OFFSET_MS).getUTCFullYear(),
      ...(heroIds.length === 0 ? {} : { heroIds })
    },
    poll: null
  };
}
