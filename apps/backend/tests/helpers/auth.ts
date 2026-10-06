import { sha256Hex } from '../../src/platform/security/sha256';
import { testDb } from './db';
import { OWNER_ID, START, TEST_BOT_TOKEN } from './harness';

// Signer built on WebCrypto separately from the code under test (the verifier has its own
// known-answer test against a value computed outside this codebase).
async function hmac(key: BufferSource, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message)));
}

export async function signInitData(fields: Record<string, string>, botToken = TEST_BOT_TOKEN): Promise<string> {
  const entries = Object.entries(fields);
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh copy; toSorted is outside the ES2022 lib
  entries.sort(([a], [b]) => (a < b ? -1 : 1));
  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = await hmac(new TextEncoder().encode('WebAppData'), botToken);
  const hash = [...(await hmac(secret, dataCheckString))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return new URLSearchParams({ ...fields, hash }).toString();
}

export function initDataFields(
  overrides: Record<string, string> = {},
  user: Record<string, unknown> = { id: Number(OWNER_ID), first_name: 'Alex', last_name: 'Abby', username: 'alex' },
  now = START
): Record<string, string> {
  return {
    auth_date: String(Math.floor(now / 1000) - 60),
    query_id: 'AAH-test',
    user: JSON.stringify(user),
    ...overrides
  };
}

export const APP_ORIGIN = 'http://localhost';

// A browser session as the OIDC callback will create it later: inserted directly, independent of
// the code under test.
export async function seedBrowserSession(options: {
  accessToken: string;
  refreshToken: string;
  telegramId?: string;
  createdAt?: number;
  accessExpiresAt?: number;
  refreshExpiresAt?: number;
  hardExpiresAt?: number;
}): Promise<string> {
  const createdAt = options.createdAt ?? START;
  const sessionId = crypto.randomUUID();
  const hard = options.hardExpiresAt ?? createdAt + 90 * 24 * 60 * 60 * 1000;
  await testDb().batch([
    testDb()
      .prepare(
        `INSERT INTO sessions (id, token_hash, telegram_id, kind, name, created_at, expires_at, hard_expires_at)
         VALUES (?1, ?2, ?3, 'browser', 'Browser Owner', ?4, ?5, ?6)`
      )
      .bind(
        sessionId,
        await sha256Hex(options.accessToken),
        options.telegramId ?? OWNER_ID,
        createdAt,
        options.accessExpiresAt ?? createdAt + 60 * 60 * 1000,
        hard
      ),
    testDb()
      .prepare('INSERT INTO refresh_tokens (token_hash, session_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)')
      .bind(
        await sha256Hex(options.refreshToken),
        sessionId,
        createdAt,
        options.refreshExpiresAt ?? createdAt + 30 * 24 * 60 * 60 * 1000
      )
  ]);
  return sessionId;
}
