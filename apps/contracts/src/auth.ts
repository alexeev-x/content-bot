import { z } from 'zod';

// POST /api/v1/auth/telegram — Mini App sign-in with Telegram.WebApp.initData (raw query string).
// → 200 AccessTokenDto. Errors: VALIDATION_ERROR 400 or 413, UNAUTHORIZED 401 (bad signature or
// auth_date older than 15 minutes), FORBIDDEN 403 (not the owner), RATE_LIMIT 429.
export const telegramSignInInputSchema = z.strictObject({
  initData: z.string().min(1).max(4096)
});
export type TelegramSignInInput = z.infer<typeof telegramSignInInputSchema>;

// POST /api/v1/auth/telegram-widget — browser sign-in with the Telegram Login Widget user object
// (data-onauth callback, so the signed data never appears in a URL). The server checks the widget
// hash with the bot token, auth_date ≤ 15 minutes, the owner ID, and accepts each hash only once.
// Origin must be the app origin. → 200 AccessTokenDto + refresh cookie.
// Errors: VALIDATION_ERROR 400 or 413, UNAUTHORIZED 401 (bad, stale or reused signature),
// FORBIDDEN 403 (foreign Origin or not the owner), RATE_LIMIT 429, UNAVAILABLE 503.
//
// Known fields are typed; any extra scalar field Telegram adds is accepted and covered by the hash,
// because the signature is computed over every received field and must not break on additions.
// An own `__proto__` key is refused up front: Zod drops it from the output, so it would be received
// but not hashed. Lone surrogates are refused because UTF-8 encoding would turn them into U+FFFD
// and let two different payloads share one signature.
const LONE_SURROGATE = /\p{Cs}/u;
const wellFormed = (value: string) => !LONE_SURROGATE.test(value);
const widgetText = z.string().max(256).refine(wellFormed, { error: 'Invalid characters' });
const widgetUserSchema = z
  .object({
    id: z.number().int().positive(),
    first_name: widgetText,
    last_name: widgetText.optional(),
    username: z.string().max(64).refine(wellFormed, { error: 'Invalid characters' }).optional(),
    photo_url: z.url().max(512).optional(),
    auth_date: z.number().int().positive(),
    hash: z.string().regex(/^[0-9a-f]{64}$/)
  })
  .catchall(z.union([widgetText, z.number(), z.boolean()]))
  .refine((input) => Object.keys(input).length <= 16, { error: 'Too many fields' });
export const telegramWidgetSignInInputSchema = z
  .unknown()
  .refine((value) => !(typeof value === 'object' && value !== null && Object.hasOwn(value, '__proto__')), {
    error: 'Forbidden field'
  })
  .pipe(widgetUserSchema);
export type TelegramWidgetSignInInput = z.infer<typeof telegramWidgetSignInInputSchema>;

// The access token lives in client memory only and travels as `Authorization: Bearer`.
export const accessTokenSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.iso.datetime()
});
export type AccessTokenDto = z.infer<typeof accessTokenSchema>;

// POST /api/v1/auth/refresh — no body. Mini App: the current valid Bearer; browser: the refresh
// cookie (rotated on use). Origin must be the app origin. → 200 AccessTokenDto.
// Errors: UNAUTHORIZED 401, FORBIDDEN 403 (foreign Origin or not the owner), RATE_LIMIT 429.
//
// POST /api/v1/auth/logout — no body; Bearer and/or refresh cookie; Origin checked. → 204,
// session revoked and cookie cleared. Errors: UNAUTHORIZED 401, FORBIDDEN 403.

// GET /api/v1/auth/me → 200 MeDto. Errors: UNAUTHORIZED 401, FORBIDDEN 403.
export const meSchema = z.object({
  telegramId: z.string(),
  name: z.string()
});
export type MeDto = z.infer<typeof meSchema>;
