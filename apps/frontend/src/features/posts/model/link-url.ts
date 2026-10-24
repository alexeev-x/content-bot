import { POST_ENTITY_URL_MAX, postEntitySchema } from '@alexeev/contracts';

export type LinkInput = { ok: true; href: string } | { ok: false; reason: 'required' | 'invalid' | 'too_long' };

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function check(raw: string): LinkInput {
  let href: string;
  try {
    href = new URL(raw).href;
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (href.length > POST_ENTITY_URL_MAX) return { ok: false, reason: 'too_long' };
  const entity = { type: 'text_link', offset: 0, length: 1, url: href };
  return postEntitySchema.safeParse(entity).success ? { ok: true, href } : { ok: false, reason: 'invalid' };
}

/** What the operator typed in the link field: a bare «example.com» gets https://, everything else must already be valid. */
export function parseLinkInput(raw: string): LinkInput {
  const typed = raw.trim();
  if (typed === '') return { ok: false, reason: 'required' };
  return check(SCHEME.test(typed) ? typed : `https://${typed}`);
}

/** Strict form for text that already carries a link (paste, stored entity): http(s) and tg only, as `new URL(x).href`. */
export function normalizeLinkUrl(raw: string): string | null {
  const typed = raw.trim();
  if (typed === '') return null;
  const result = check(typed);
  return result.ok ? result.href : null;
}
