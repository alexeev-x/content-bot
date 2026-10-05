import { describe, expect, it } from 'vitest';
import { timingSafeEqual, timingSafeEqualStrings } from './timing-safe-equal';

describe('timingSafeEqual', () => {
  it('compares equal and different byte arrays', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
  });

  it('treats different lengths as different, including a zero-padded prefix', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 0]))).toBe(false);
    expect(timingSafeEqualStrings('', 'a')).toBe(false);
    expect(timingSafeEqualStrings('secret', 'secret')).toBe(true);
  });
});
