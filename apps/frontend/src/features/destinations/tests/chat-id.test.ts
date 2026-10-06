import { describe, expect, it } from 'vitest';
import { parseChatId } from '../model/chat-id';

describe('parseChatId', () => {
  it.each([
    ['my_channel', '@my_channel'],
    ['@my_channel', '@my_channel'],
    ['  https://t.me/my_channel/ ', '@my_channel'],
    ['-1001234567890', '-1001234567890']
  ])('accepts %j as %j', (raw, expected) => {
    expect(parseChatId(raw)).toBe(expected);
  });

  it.each(['', 'ab', '@1abcde', '0123', 'two words', '-'])('rejects %j', (raw) => {
    expect(parseChatId(raw)).toBeNull();
  });
});
