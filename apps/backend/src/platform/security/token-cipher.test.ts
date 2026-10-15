import { describe, expect, it } from 'vitest';
import { createTokenCipher } from './token-cipher';

describe('token cipher', () => {
  it('round-trips, never stores the plain token and refuses another secret', async () => {
    const cipher = createTokenCipher('secret-a', 'tiktok tokens');
    const sealed = await cipher.encrypt('act.example-token');

    expect(sealed).not.toContain('example-token');
    expect(await cipher.decrypt(sealed)).toBe('act.example-token');
    expect(await createTokenCipher('secret-b', 'tiktok tokens').decrypt(sealed)).toBeNull();
    expect(await cipher.decrypt('garbage')).toBeNull();
  });
});
