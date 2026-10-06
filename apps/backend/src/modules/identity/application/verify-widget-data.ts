import { timingSafeEqual } from '../../../platform/security/timing-safe-equal';
import { INIT_DATA_MAX_AGE_SEC } from './verify-init-data';

const MAX_CLOCK_SKEW_SEC = 60;
// Telegram field names are snake_case. Anything else could make the data-check-string ambiguous
// (a key containing "=" or a newline), so it is refused instead of hashed.
// UTF-8 encoding turns a lone surrogate into U+FFFD, so two different strings could share one
// signature; the contract refuses them too, this keeps the verifier safe on its own.
const LONE_SURROGATE = /\p{Cs}/u;
const FIELD_NAME = /^[a-z][a-z0-9_]{0,31}$/;

export type WidgetField = string | number | boolean;
export type WidgetFailure = 'MALFORMED' | 'HASH_MISMATCH' | 'AUTH_DATE_INVALID' | 'EXPIRED' | 'FOREIGN_USER';

export type VerifyWidgetDataResult =
  | {
      ok: true;
      user: { id: number; first_name: string; last_name?: string; username?: string };
      authDate: number;
    }
  | { ok: false; reason: WidgetFailure };

export interface VerifyWidgetDataInput {
  /** Every field the widget sent, `hash` included. */
  fields: Readonly<Record<string, WidgetField>>;
  botToken: string;
  ownerTelegramId: number;
  /** UTC epoch milliseconds, from the injected clock. */
  now: number;
}

const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

// Exactly what the JS callback delivers is what Telegram signed: strings verbatim, integers as
// decimal digits (id, auth_date). A boolean or a non-integer number cannot be matched with
// certainty, so a payload carrying one and signed differently fails closed with HASH_MISMATCH.
function render(value: WidgetField): string {
  return String(value);
}

// https://core.telegram.org/widgets/login-legacy#checking-authorization
// secret_key = SHA256(bot_token) (raw bytes); hash = hex(HMAC_SHA256(data_check_string, secret_key)).
// The caller must never log the fields or the hash.
export async function verifyWidgetData(input: VerifyWidgetDataInput): Promise<VerifyWidgetDataResult> {
  const { fields, botToken, ownerTelegramId, now } = input;
  const providedHash = fields.hash;
  const providedBytes = typeof providedHash === 'string' ? hexToBytes(providedHash) : null;
  if (providedBytes === null || botToken === '') return { ok: false, reason: 'MALFORMED' };

  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'hash') continue;
    const text = render(value);
    if (!FIELD_NAME.test(key) || text.includes('\n') || LONE_SURROGATE.test(text))
      return { ok: false, reason: 'MALFORMED' };
    entries.push([key, text]);
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh array; toSorted is outside the ES2022 lib
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join('\n');

  const secret = await crypto.subtle.digest('SHA-256', encoder.encode(botToken));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(dataCheckString)));
  if (!timingSafeEqual(expected, providedBytes)) return { ok: false, reason: 'HASH_MISMATCH' };

  // The signature is valid from here on, so the remaining checks only look at trusted data.
  const { id, auth_date: authDate, first_name: firstName, last_name: lastName, username } = fields;
  if (typeof authDate !== 'number' || !Number.isSafeInteger(authDate) || authDate <= 0) {
    return { ok: false, reason: 'AUTH_DATE_INVALID' };
  }
  const ageSec = Math.floor(now / 1000) - authDate;
  if (ageSec < -MAX_CLOCK_SKEW_SEC) return { ok: false, reason: 'AUTH_DATE_INVALID' };
  if (ageSec > INIT_DATA_MAX_AGE_SEC) return { ok: false, reason: 'EXPIRED' };

  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || typeof firstName !== 'string') {
    return { ok: false, reason: 'MALFORMED' };
  }
  if (id !== ownerTelegramId) return { ok: false, reason: 'FOREIGN_USER' };

  return {
    ok: true,
    authDate,
    user: {
      id,
      first_name: firstName,
      ...(typeof lastName === 'string' ? { last_name: lastName } : {}),
      ...(typeof username === 'string' ? { username } : {})
    }
  };
}
