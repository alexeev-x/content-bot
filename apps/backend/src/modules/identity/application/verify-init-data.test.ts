import { describe, expect, it } from 'vitest';
import { INIT_DATA_MAX_AGE_SEC, verifyInitData } from './verify-init-data';

const BOT_TOKEN = '123456:TEST-TOKEN';
const OWNER_ID = 4242;
const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const NOW_SEC = NOW / 1000;

// Test signer built on WebCrypto separately from the code under test; the known-answer test below
// pins the algorithm against a value computed outside this codebase.
async function hmac(key: BufferSource, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message)));
}

async function signInitData(fields: Record<string, string>, botToken = BOT_TOKEN): Promise<string> {
  const entries = Object.entries(fields);
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh copy; toSorted is outside the ES2022 lib
  entries.sort(([a], [b]) => (a < b ? -1 : 1));
  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = await hmac(new TextEncoder().encode('WebAppData'), botToken);
  const hash = [...(await hmac(secret, dataCheckString))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return new URLSearchParams({ ...fields, hash }).toString();
}

function validFields(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    auth_date: String(NOW_SEC - 60),
    query_id: 'AAH-test',
    user: JSON.stringify({ id: OWNER_ID, first_name: 'Alex', username: 'alex' }),
    ...overrides,
  };
}

const verify = (initData: string, now = NOW) =>
  verifyInitData({ initData, botToken: BOT_TOKEN, ownerTelegramId: OWNER_ID, now });

describe('verifyInitData', () => {
  it('matches a known-answer vector computed with Python hmac', async () => {
    const initData = new URLSearchParams({
      auth_date: '1790942340',
      query_id: 'AAH-test',
      user: '{"id":4242,"first_name":"Alex","username":"alex"}',
      hash: 'c3d19fc6946a2cc27604384c8e619fcecdc03bd075408861f4d64bc68c25be8d',
    }).toString();

    const result = await verify(initData, 1790942400 * 1000);

    expect(result).toMatchObject({ ok: true, authDate: 1790942340 });
  });

  it('accepts correctly signed, fresh initData from the owner', async () => {
    const result = await verify(await signInitData(validFields()));
    expect(result).toEqual({
      ok: true,
      user: { id: OWNER_ID, first_name: 'Alex', username: 'alex' },
      authDate: NOW_SEC - 60,
    });
  });

  it('rejects tampered fields', async () => {
    const signed = new URLSearchParams(await signInitData(validFields()));
    signed.set('user', JSON.stringify({ id: OWNER_ID, first_name: 'Mallory' }));
    expect(await verify(signed.toString())).toEqual({ ok: false, reason: 'HASH_MISMATCH' });
  });

  it('rejects initData signed with another bot token', async () => {
    const result = await verify(await signInitData(validFields(), '999999:OTHER'));
    expect(result).toEqual({ ok: false, reason: 'HASH_MISMATCH' });
  });

  it('rejects stale auth_date but accepts the exact limit', async () => {
    const stale = await signInitData(validFields({ auth_date: String(NOW_SEC - INIT_DATA_MAX_AGE_SEC - 1) }));
    expect(await verify(stale)).toEqual({ ok: false, reason: 'EXPIRED' });

    const atLimit = await signInitData(validFields({ auth_date: String(NOW_SEC - INIT_DATA_MAX_AGE_SEC) }));
    expect((await verify(atLimit)).ok).toBe(true);
  });

  it('rejects auth_date from the future', async () => {
    const future = await signInitData(validFields({ auth_date: String(NOW_SEC + 3600) }));
    expect(await verify(future)).toEqual({ ok: false, reason: 'AUTH_DATE_INVALID' });
  });

  it('rejects a validly signed user who is not the owner', async () => {
    const foreign = await signInitData(validFields({ user: JSON.stringify({ id: 777, first_name: 'Eve' }) }));
    expect(await verify(foreign)).toEqual({ ok: false, reason: 'FOREIGN_USER' });
  });

  it.each([
    ['empty string', async () => ''],
    ['no hash', async () => new URLSearchParams(validFields()).toString()],
    ['non-hex hash', async () => `${new URLSearchParams(validFields()).toString()}&hash=zz`],
    ['duplicated key', async () => `${await signInitData(validFields())}&auth_date=1`],
    ['oversized', async () => `a=${'x'.repeat(9000)}`],
  ])('treats %s as malformed', async (_name, build) => {
    expect(await verify(await build())).toEqual({ ok: false, reason: 'MALFORMED' });
  });

  it('rejects a signed payload whose user is not valid JSON', async () => {
    const result = await verify(await signInitData(validFields({ user: '{not json' })));
    expect(result).toEqual({ ok: false, reason: 'MALFORMED' });
  });

  it('rejects an empty bot token instead of signing with an empty key', async () => {
    const result = await verifyInitData({
      initData: await signInitData(validFields(), ''),
      botToken: '',
      ownerTelegramId: OWNER_ID,
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: 'MALFORMED' });
  });
});
