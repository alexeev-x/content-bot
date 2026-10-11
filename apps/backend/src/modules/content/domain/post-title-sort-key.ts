const DECIMAL_ZEROES = [
  0x0030, 0x0660, 0x06f0, 0x07c0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0de6,
  0x0e50, 0x0ed0, 0x0f20, 0x1040, 0x1090, 0x17e0, 0x1810, 0x1946, 0x19d0, 0x1a80, 0x1a90, 0x1b50, 0x1bb0, 0x1c40,
  0x1c50, 0xa620, 0xa8d0, 0xa900, 0xa9d0, 0xa9f0, 0xaa50, 0xabf0, 0xff10, 0x104a0, 0x10d30, 0x11066, 0x110f0, 0x11136,
  0x111d0, 0x112f0, 0x11450, 0x114d0, 0x11650, 0x116c0, 0x11730, 0x118e0, 0x11950, 0x11c50, 0x11d50, 0x11da0, 0x16a60,
  0x16ac0, 0x16b50, 0x1d7ce, 0x1e140, 0x1e2f0, 0x1e4f0, 0x1e5f1, 0x1e950
];

function decimalValue(character: string): number | null {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return null;
  for (const zero of DECIMAL_ZEROES) {
    if (codePoint >= zero && codePoint <= zero + 9) return codePoint - zero;
  }
  return null;
}

function encodeCodePoint(character: string): string {
  const codePoint = character.codePointAt(0) ?? 0;
  const weight =
    (codePoint >= 0x0430 && codePoint <= 0x044f) || codePoint === 0x0451
      ? 1_000_000 + codePoint
      : (codePoint >= 0x0061 && codePoint <= 0x007a) || (codePoint >= 0x00c0 && codePoint <= 0x024f)
        ? 2_000_000 + codePoint
        : codePoint > 0xffff
          ? 3_000_000 + codePoint
          : codePoint;
  return `${weight.toString().padStart(7, '0')}0`;
}

/**
 * A stable database key for the posts UI's ru-RU, numeric, base-sensitivity title order.
 * NFD removes accents (including the distinction between е and ё); decimal runs are encoded by
 * significant length and digits so they compare as numbers without loading every post in memory.
 */
export function postTitleSortKey(title: string): string {
  const primaryTitle = title
    .normalize('NFD')
    .replace(/([иИ])\u0306/gu, (_match, letter: string) => (letter === 'И' ? 'Й' : 'й'))
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('ru-RU')
    .replace(/\p{M}/gu, '');
  const characters = [...primaryTitle];
  let key = '';
  for (let index = 0; index < characters.length;) {
    const digit = decimalValue(characters[index] ?? '');
    if (digit === null) {
      key += encodeCodePoint(characters[index] ?? '');
      index += 1;
      continue;
    }

    let digits = String(digit);
    index += 1;
    while (index < characters.length) {
      const next = decimalValue(characters[index] ?? '');
      if (next === null) break;
      digits += next;
      index += 1;
    }
    const significant = digits.replace(/^0+(?=\d)/, '');
    key += `00000481${significant.length.toString().padStart(3, '0')}${significant}`;
  }
  return key || '00000000';
}
