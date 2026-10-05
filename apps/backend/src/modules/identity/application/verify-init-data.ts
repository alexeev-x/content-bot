import { z } from 'zod';
import { timingSafeEqual } from '../../../platform/security/timing-safe-equal';

export const INIT_DATA_MAX_AGE_SEC = 15 * 60;
const MAX_INIT_DATA_LENGTH = 8192;
const MAX_CLOCK_SKEW_SEC = 60;

const userSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional()
});
export type TelegramUser = z.infer<typeof userSchema>;

export type InitDataFailure = 'MALFORMED' | 'HASH_MISMATCH' | 'AUTH_DATE_INVALID' | 'EXPIRED' | 'FOREIGN_USER';

export type VerifyInitDataResult =
  { ok: true; user: TelegramUser; authDate: number } | { ok: false; reason: InitDataFailure };

export interface VerifyInitDataInput {
  initData: string;
  botToken: string;
  ownerTelegramId: number;
  /** UTC epoch milliseconds, from the injected clock. */
  now: number;
}

const encoder = new TextEncoder();

async function hmacSha256(key: BufferSource, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message)));
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// secret = HMAC_SHA256(key = "WebAppData", message = bot_token); hash = HMAC_SHA256(secret, data_check_string).
// The caller must never log `initData`.
export async function verifyInitData(input: VerifyInitDataInput): Promise<VerifyInitDataResult> {
  const { initData, botToken, ownerTelegramId, now } = input;
  if (initData.length === 0 || initData.length > MAX_INIT_DATA_LENGTH || botToken === '') {
    return { ok: false, reason: 'MALFORMED' };
  }

  const fields = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(initData)) {
    if (fields.has(key)) return { ok: false, reason: 'MALFORMED' };
    fields.set(key, value);
  }

  const providedHash = fields.get('hash');
  const providedBytes = providedHash === undefined ? null : hexToBytes(providedHash);
  if (providedBytes === null) return { ok: false, reason: 'MALFORMED' };
  fields.delete('hash');

  const entries = [...fields.entries()];
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh copy; toSorted is outside the ES2022 lib
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join('\n');

  const secret = await hmacSha256(encoder.encode('WebAppData'), botToken);
  const expected = await hmacSha256(secret, dataCheckString);
  if (!timingSafeEqual(expected, providedBytes)) return { ok: false, reason: 'HASH_MISMATCH' };

  // The signature is valid from here on, so the remaining checks only look at trusted data.
  const authDateRaw = fields.get('auth_date');
  if (authDateRaw === undefined || !/^\d{1,12}$/.test(authDateRaw)) return { ok: false, reason: 'AUTH_DATE_INVALID' };
  const authDate = Number(authDateRaw);
  const ageSec = Math.floor(now / 1000) - authDate;
  if (ageSec < -MAX_CLOCK_SKEW_SEC) return { ok: false, reason: 'AUTH_DATE_INVALID' };
  if (ageSec > INIT_DATA_MAX_AGE_SEC) return { ok: false, reason: 'EXPIRED' };

  const userRaw = fields.get('user');
  if (userRaw === undefined) return { ok: false, reason: 'MALFORMED' };
  let userJson: unknown;
  try {
    userJson = JSON.parse(userRaw);
  } catch {
    return { ok: false, reason: 'MALFORMED' };
  }
  const user = userSchema.safeParse(userJson);
  if (!user.success) return { ok: false, reason: 'MALFORMED' };
  if (user.data.id !== ownerTelegramId) return { ok: false, reason: 'FOREIGN_USER' };

  return { ok: true, user: user.data, authDate };
}
