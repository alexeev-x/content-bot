import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor';

const id = '0b1f6c52-8d3e-4a47-9a35-2f6f0c1d7e90';

describe('post cursor', () => {
  it('round-trips and is URL-safe', () => {
    const cursor = { updatedAt: 1_800_000_000_123, id };

    const encoded = encodeCursor(cursor);

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it.each([
    ['not base64', '!!!'],
    ['wrong shape', btoa('hello')],
    ['bad id', btoa('12:not-a-uuid')],
    ['negative number', btoa(`-5:${id}`)],
    ['non-canonical padding', `${encodeCursor({ updatedAt: 1, id })}=`],
    ['too large timestamp', btoa(`99999999999999999:${id}`)]
  ])('rejects %s', (_name, value) => {
    expect(decodeCursor(value)).toBeNull();
  });
});
