const MAX_NAME_LENGTH = 64;
const FALLBACK_NAME = 'Owner';

// Control characters and invisible format characters (bidi overrides, zero-width joiners) must not
// reach a UI that renders the name; whitespace runs collapse so it stays on one line.
function clean(text: string): string {
  return text
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function displayName(user: { first_name: string; last_name?: string; username?: string }): string {
  const full = clean(`${user.first_name} ${user.last_name ?? ''}`);
  const name = full === '' ? clean(user.username ?? '') : full;
  // Cut by code point so a surrogate pair is never split.
  const bounded = [...(name === '' ? FALLBACK_NAME : name)].slice(0, MAX_NAME_LENGTH).join('').trim();
  return bounded === '' ? FALLBACK_NAME : bounded;
}
