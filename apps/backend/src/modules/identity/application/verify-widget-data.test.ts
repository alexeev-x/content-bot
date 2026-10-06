import { describe, expect, it } from 'vitest';
import { verifyWidgetData } from './verify-widget-data';

const BOT_TOKEN = '123456:TEST-BOT-TOKEN-PLACEHOLDER';
const NOW = 1_800_000_000_000;
// Computed outside this codebase with openssl:
//   key = sha256(bot token) (raw); data_check_string = "auth_date=1799999940\nfirst_name=Alex\nid=4242\nusername=alex"
//   printf %s "$DCS" | openssl dgst -sha256 -mac HMAC -macopt hexkey:$KEY
const KNOWN_HASH = 'd663624dc721a445c1f0bba02881cb9a9249e822fca8632814d3baf45a308206';
const known = { id: 4242, first_name: 'Alex', username: 'alex', auth_date: 1_799_999_940, hash: KNOWN_HASH };

describe('verifyWidgetData', () => {
  it('accepts the known-answer payload, whatever the key order', async () => {
    const reordered = { hash: KNOWN_HASH, username: 'alex', auth_date: 1_799_999_940, first_name: 'Alex', id: 4242 };
    for (const fields of [known, reordered]) {
      const result = await verifyWidgetData({ fields, botToken: BOT_TOKEN, ownerTelegramId: 4242, now: NOW });
      expect(result).toEqual({
        ok: true,
        authDate: 1_799_999_940,
        user: { id: 4242, first_name: 'Alex', username: 'alex' }
      });
    }
  });

  it.each([
    ['another bot token', { ...known }, '999999:OTHER', 'HASH_MISMATCH'],
    ['a changed value', { ...known, first_name: 'Eve' }, BOT_TOKEN, 'HASH_MISMATCH'],
    ['a field added after signing', { ...known, extra: 'x' }, BOT_TOKEN, 'HASH_MISMATCH'],
    ['a short hash', { ...known, hash: 'abc' }, BOT_TOKEN, 'MALFORMED'],
    ['an upper-case hash', { ...known, hash: KNOWN_HASH.toUpperCase() }, BOT_TOKEN, 'MALFORMED'],
    ['a key that could blur the data-check-string', { ...known, 'a=b': 'c' }, BOT_TOKEN, 'MALFORMED'],
    ['a lone surrogate in a value', { ...known, first_name: 'A\ud800' }, BOT_TOKEN, 'MALFORMED'],
    ['a value with a newline', { ...known, first_name: 'A\nid=1' }, BOT_TOKEN, 'MALFORMED']
  ])('rejects %s', async (_name, fields, botToken, reason) => {
    const result = await verifyWidgetData({ fields, botToken, ownerTelegramId: 4242, now: NOW });
    expect(result).toEqual({ ok: false, reason });
  });

  it('rejects a foreign user only after the signature held', async () => {
    const result = await verifyWidgetData({ fields: known, botToken: BOT_TOKEN, ownerTelegramId: 1, now: NOW });
    expect(result).toEqual({ ok: false, reason: 'FOREIGN_USER' });
  });

  it('checks freshness at the boundaries: 15 minutes old passes, one second more or 61 s ahead does not', async () => {
    const check = (now: number) =>
      verifyWidgetData({ fields: known, botToken: BOT_TOKEN, ownerTelegramId: 4242, now }).then((r) => r.ok);
    const authMs = 1_799_999_940_000;
    expect(await check(authMs + 15 * 60_000)).toBe(true);
    expect(await check(authMs + 15 * 60_000 + 1000)).toBe(false);
    expect(await check(authMs - 60_000)).toBe(true);
    expect(await check(authMs - 61_000)).toBe(false);
  });
});
