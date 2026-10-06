import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { decodeKeysetCursor, encodeKeysetCursor } from './keyset-cursor';

const schema = z.tuple([z.string().max(100), z.uuid()]);
const id = '0b1f6c52-8d3e-4a47-9a35-2f6f0c1d7e90';

describe('keyset cursor', () => {
  it('round-trips a key with quotes and non-ASCII text', () => {
    const key = ['Канал "Dota" \\ 日本', id] as const;
    expect(decodeKeysetCursor(encodeKeysetCursor(key), schema)).toEqual(key);
  });

  it('keeps the worst-case destination key within the 512-character cursor limit', () => {
    // 100 UTF-16 units of three-byte characters is the largest title the contract accepts.
    expect(encodeKeysetCursor(['日'.repeat(100), id]).length).toBeLessThanOrEqual(512);
  });

  it.each([
    ['not base64', '***'],
    ['not JSON', btoa('nope')],
    ['the wrong shape', encodeKeysetCursor([1, 2])],
    ['an extra element', encodeKeysetCursor(['t', id, 'x'])],
    ['padding that is not canonical', `${encodeKeysetCursor(['t', id])}=`],
    ['invalid UTF-8', btoa(String.fromCharCode(0x5b, 0x22, 0xff, 0x22, 0x5d)).replaceAll('=', '')]
  ])('rejects %s', (_name, value) => {
    expect(decodeKeysetCursor(value, schema)).toBeNull();
  });
});
