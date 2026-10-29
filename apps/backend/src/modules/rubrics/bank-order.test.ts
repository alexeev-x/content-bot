import { describe, expect, it } from 'vitest';
import { shuffledOrder } from './bank-order';

describe('shuffledOrder', () => {
  it('gives every entry of the bank once per round, and another order next round', () => {
    const first = shuffledOrder(0, 127);
    expect([...first].sort((a, b) => a - b)).toEqual(Array.from({ length: 127 }, (_, index) => index));
    expect(shuffledOrder(0, 127)).toEqual(first);
    expect(shuffledOrder(1, 127)).not.toEqual(first);
  });
});
