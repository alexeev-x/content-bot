import { z } from 'zod';

// What a built post was about, kept with the slot: the scheduler's inner rules (a hero not twice in 72 h, a bank line
// not again this round, the horoscope's tellers) read these instead of re-reading the text. Closed: an unknown key is
// a bug, not data.

/** A fact list stays short: a post names a handful of heroes or finds, never hundreds. */
const LIST_MAX = 40;
export const FACTS_MAX_BYTES = 16 * 1024;

export const rubricFactsSchema = z.strictObject({
  patch: z.string().max(20).optional(),
  heroIds: z.array(z.number().int().positive()).max(LIST_MAX).optional(),
  abilityId: z.number().int().positive().optional(),
  pair: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
  itemId: z.number().int().positive().optional(),
  workshopId: z.string().max(40).optional(),
  steamGid: z.string().max(40).optional(),
  finds: z.array(z.string().max(80)).max(LIST_MAX).optional(),
  look: z.string().max(40).optional(),
  topic: z.string().max(80).optional(),
  bankLine: z.string().max(200).optional(),
  tellers: z.array(z.number().int().positive()).max(LIST_MAX).optional(),
  shameHero: z.number().int().positive().optional(),
  /** The joke option of a poll: the next posts avoid it for a while. */
  jokeOption: z.string().max(120).optional(),
  /** A builder's variant (03 mixed/trap, 06 bet/result, 10 real/joke). */
  variant: z.string().max(40).optional(),
  /** The patch chain (base version, `7.41`) a chain rubric was built for. */
  chain: z.string().max(20).optional(),
  /** 08: the day mark (30, 45, 60, 90, 120…). */
  mark: z.number().int().positive().optional(),
  /** 31: the card and its year. */
  card: z.string().max(60).optional(),
  year: z.number().int().optional(),
  /** The post's text, normalised: later posts are compared with it (similarity.ts). */
  sig: z.string().max(400).optional()
});
export type RubricFacts = z.infer<typeof rubricFactsSchema>;

/** The facts checked and bounded before they are stored. */
export function parseRubricFacts(value: unknown): RubricFacts {
  const facts = rubricFactsSchema.parse(value);
  if (new TextEncoder().encode(JSON.stringify(facts)).length > FACTS_MAX_BYTES) {
    throw new RangeError('Rubric facts exceed 16 KB');
  }
  return facts;
}
