// Lexical similarity of rubric texts (area-backend-rubrics §1.7; the semantic check waits four weeks, stage 6b): word
// trigrams of the normalised text, Jaccard overlap. A post too close to one of the rubric's recent posts does not go
// out: the AI tends to retell the same joke with the same words.

/** At or above this overlap two texts say the same thing (calibrated on bank lines: retellings score 0.5+). */
export const SIMILAR_AT = 0.5;
const SIGNATURE_MAX = 400;

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

/** The text kept to compare later posts with (stored in the slot's facts). */
export const textSignature = (text: string) => normalise(text).slice(0, SIGNATURE_MAX);

function trigrams(text: string): Set<string> {
  const words = normalise(text)
    .split(' ')
    .filter((word) => word.length > 0);
  const grams = new Set<string>();
  for (let index = 0; index + 2 < words.length; index += 1) grams.add(words.slice(index, index + 3).join(' '));
  if (grams.size === 0 && words.length > 0) grams.add(words.join(' '));
  return grams;
}

export function similarity(a: string, b: string): number {
  const left = trigrams(a);
  const right = trigrams(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** The closest of the earlier signatures and its overlap. */
export function closest(text: string, earlier: readonly string[]): number {
  return earlier.reduce((best, each) => Math.max(best, similarity(text, each)), 0);
}
