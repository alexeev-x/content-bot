import { describe, expect, it } from 'vitest';
import { parseOwnerTelegramId } from './owner';

describe('parseOwnerTelegramId', () => {
  it('accepts ids up to 16 digits and the largest safe integer', () => {
    expect(parseOwnerTelegramId('4242')).toBe(4242);
    expect(parseOwnerTelegramId(' 4242 ')).toBe(4242);
    expect(parseOwnerTelegramId('1234567890123456')).toBe(1_234_567_890_123_456);
    expect(parseOwnerTelegramId(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([undefined, '', '0', '007', '-5', '4.2', '12abc', '9007199254740992', '12345678901234567'])(
    'treats %s as no owner',
    (raw) => {
      expect(parseOwnerTelegramId(raw)).toBeNull();
    }
  );
});
