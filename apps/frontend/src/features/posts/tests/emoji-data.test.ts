import { afterEach, describe, expect, it } from 'vitest';
import { EMOJI_CATEGORIES, readRecentEmoji, rememberEmoji, searchEmoji } from '../model/emoji-data';

afterEach(() => localStorage.clear());

describe('emoji data', () => {
  it('finds emoji by Russian words, ё or е alike, and nothing for an empty query', () => {
    expect(searchEmoji('огонь').map((item) => item.char)).toContain('🔥');
    expect(searchEmoji('Смех').map((item) => item.char)).toEqual(expect.arrayContaining(['😂', '🤣']));
    expect(searchEmoji('замерз').map((item) => item.char)).toContain('🥶');
    expect(searchEmoji('  ')).toEqual([]);
  });

  it('has no emoji twice, so a button never has a twin', () => {
    const chars = EMOJI_CATEGORIES.flatMap((category) => category.items.map((item) => item.char));
    expect(new Set(chars).size).toBe(chars.length);
  });

  it('remembers the latest first, without repeats, up to 16', () => {
    for (const char of ['😂', '🔥', '😂']) rememberEmoji(char);
    expect(readRecentEmoji()).toEqual(['😂', '🔥']);
    for (let index = 0; index < 20; index += 1) rememberEmoji(String.fromCodePoint(0x1f600 + index));
    expect(readRecentEmoji()).toHaveLength(16);
  });
});
