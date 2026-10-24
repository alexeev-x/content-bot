import type { VideoFormat } from './types';

/** Fewest edits that turn `pattern` into some part of `text` (Sellers): a typo still finds the rubric. */
function editsToFind(pattern: string, text: string): number {
  let previous = Array.from({ length: pattern.length + 1 }, (_, index) => index);
  let best = previous[pattern.length] ?? 0;
  for (const letter of text) {
    const current = [0];
    for (let index = 1; index <= pattern.length; index += 1) {
      current[index] = Math.min(
        (previous[index] ?? 0) + 1,
        (current[index - 1] ?? 0) + 1,
        (previous[index - 1] ?? 0) + (pattern[index - 1] === letter ? 0 : 1)
      );
    }
    best = Math.min(best, current[pattern.length] ?? best);
    previous = current;
  }
  return best;
}

/** The rubric closes the title; a longer search only costs CPU (10 ms per request on the Free plan). */
const RUBRIC_LETTERS = 60;

/**
 * The rubric the owner writes at the end of every video title (owner, 17.10.2026): «Учу фидить в доту» or
 * «Учусь играть в доту. Часть N», sometimes with a typo or as a hashtag; only «Учусь играть» has «Часть N». A
 * title without either is a video outside the rubrics.
 */
export function titleFormat(title: string): VideoFormat {
  const lower = title.toLowerCase().replaceAll('ё', 'е');
  // Letters only, so spaces, hashtags and punctuation do not count as edits.
  const letters = lower.replace(/[^а-яa-z]/g, '').slice(-RUBRIC_LETTERS);
  if (letters.includes('учуфидить') || editsToFind('учуфидить', letters) <= 1) return 'fidit';
  if (letters.includes('учусьиграть') || editsToFind('учусьиграть', letters) <= 2 || /част[ьи]\s*\d+/.test(lower))
    return 'igrat';
  return 'standalone';
}

/** One key for a video's YouTube and TikTok copies: the title in lower case, «ё» as «е», no hashtags or punctuation. */
export const videoTitleKey = (title: string): string =>
  title
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/#\S+/g, ' ')
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .trim();
