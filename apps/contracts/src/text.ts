// Control characters and lone surrogates are rejected: SQLite cuts strings at U+0000 and D1
// silently replaces lone surrogates, so the stored value would differ from the response.
const LONE_SURROGATE = /\p{Cs}/u;
const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;

function hasControlCharacter(value: string, allowLineBreaks: boolean): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0x20 && code !== 0x7f) continue;
    if (allowLineBreaks && (code === TAB || code === LINE_FEED || code === CARRIAGE_RETURN)) continue;
    return true;
  }
  return false;
}

export const cleanText = (allowLineBreaks: boolean) => (value: string) =>
  !hasControlCharacter(value, allowLineBreaks) && !LONE_SURROGATE.test(value);
