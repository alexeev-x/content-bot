import { spokenHeroName } from './anketa';

// «Первым угадал» under 04's answer (RUBRICS_SCHEDULER.md 4.2, MASTER-PLAN row 36): the first comment under the
// riddle that names the right hero, by the names players use (the lexicon's nicknames, the «Анкета» names, Valve's
// English name). A word may carry a Russian ending («Котла»), never a longer word («абажур» is not «аба»);
// two-letter nicknames are too ambiguous to count; a comment naming three heroes or more is a spray, not a guess.
// A negated mention counts (owner rule as written).

const HERO_ROW = /^прозвище героя (.+?)(;|$)/;
/** Extra letters a word may have past the name: Russian case endings. */
const ENDING_MAX = 2;
const SPRAY = 3;

const normalise = (text: string) => text.toLowerCase().replaceAll('ё', 'е');

interface HeroAliases {
  english: string;
  aliases: string[];
}

/** The lexicon's hero rows («прозвище героя <English>»): every hero with its nicknames. */
export type Lexicon = readonly { w: readonly string[]; m: string }[];

function heroIndex(lexicon: Lexicon): HeroAliases[] {
  return lexicon.flatMap((row) => {
    const match = HERO_ROW.exec(row.m);
    if (match === null) return [];
    const english = (match[1] ?? '').trim();
    return [{ english, aliases: [english, ...row.w].map(normalise).filter((alias) => alias.length >= 3) }];
  });
}

function aliasesOf(heroes: HeroAliases[], hero: { name: string; key: string }): string[] {
  const own = heroes.find((row) => normalise(row.english) === normalise(hero.name));
  const spoken = spokenHeroName(hero.key);
  return [
    ...new Set([...(own?.aliases ?? []), normalise(hero.name), ...(spoken === undefined ? [] : [normalise(spoken)])])
  ].filter((alias) => alias.length >= 3);
}

/** Does the text name this alias: a whole word (with a short ending), or a phrase of several words. */
function names(text: string, words: string[], alias: string): boolean {
  if (/[\s-]/.test(alias)) return text.includes(alias);
  return words.some((word) => word.startsWith(alias) && word.length - alias.length <= ENDING_MAX);
}

function heroesNamed(heroes: HeroAliases[], text: string, words: string[]): number {
  return heroes.filter((hero) => hero.aliases.some((alias) => names(text, words, alias))).length;
}

/**
 * The first comment (by time, then message id) naming the hero; its author's @username when there is one.
 * `found: false` when nobody guessed.
 */
export function firstGuess(
  lexicon: Lexicon,
  hero: { name: string; key: string },
  comments: readonly { text: string | null; createdAt: number; messageId: number; username: string | null }[]
): { found: false } | { found: true; username: string | null } {
  const heroes = heroIndex(lexicon);
  const aliases = aliasesOf(heroes, hero);
  const ordered = [...comments].sort((a, b) => a.createdAt - b.createdAt || a.messageId - b.messageId);
  for (const comment of ordered) {
    if (comment.text === null) continue;
    const text = normalise(comment.text);
    const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (!aliases.some((alias) => names(text, words, alias))) continue;
    if (heroesNamed(heroes, text, words) >= SPRAY) continue;
    return { found: true, username: comment.username };
  }
  return { found: false };
}

/** The line put above 04's answer. */
export function firstGuessLine(guess: { found: true; username: string | null }): string {
  return guess.username === null ? 'Первым угадал один из вас.' : `Первым угадал @${guess.username}.`;
}
