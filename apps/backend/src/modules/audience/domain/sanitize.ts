// A comment's text as it is kept: no control, zero-width or bidi-override characters (they hide or reorder what the
// owner reads), whitespace collapsed, NFC, at most 500 characters.

export const COMMENT_TEXT_MAX = 500;

// C0/C1 controls, zero-width characters and the bidi embeddings, overrides and isolates.
// oxlint-disable-next-line no-control-regex -- removing control characters is the point of this pattern
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/gu;

export function sanitizeComment(text: string): string | null {
  const clean = text.normalize('NFC').replace(HIDDEN, ' ').replace(/\s+/gu, ' ').trim();
  if (clean === '') return null;
  return [...clean].slice(0, COMMENT_TEXT_MAX).join('');
}
