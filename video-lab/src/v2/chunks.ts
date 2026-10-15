import type { Tone, Word } from './types';

export type Chunk = { from: number; to: number; words: { text: string; s: number; tone?: Tone }[] };

const clean = (word: string) => word.toLowerCase().replace(/[.,!?…«»"—-]+$/u, '').replace(/^[«"]+/u, '');

/**
 * Word-by-word captions: groups of up to three words, broken at punctuation or a pause; each group stays
 * until the next one starts (at most 0.6 s after its last word).
 */
export function buildChunks(words: readonly Word[], fixes: Record<string, string>, accents: Record<string, Tone>): Chunk[] {
  const chunks: Chunk[] = [];
  let current: Word[] = [];
  const flush = () => {
    if (current.length === 0) return;
    chunks.push({
      from: current[0]!.s,
      to: current.at(-1)!.e,
      words: current.map((word) => {
        const key = clean(word.w);
        const text = (fixes[key] ?? word.w.replace(/[.,!?]+$/u, '')).toUpperCase();
        const tone = accents[key];
        return tone === undefined ? { text, s: word.s } : { text, s: word.s, tone };
      })
    });
    current = [];
  };
  words.forEach((word, index) => {
    const previous = words[index - 1];
    if (previous && (word.s - previous.e > 0.3 || current.length >= 3)) flush();
    current.push(word);
    if (/[.,!?]$/u.test(word.w)) flush();
  });
  flush();
  return chunks.map((chunk, index) => ({
    ...chunk,
    to: Math.min(chunks[index + 1]?.from ?? chunk.to + 0.6, chunk.to + 0.6)
  }));
}
