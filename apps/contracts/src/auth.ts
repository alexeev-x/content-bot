import { z } from 'zod';

// POST /api/v1/auth/telegram — Mini App sign-in with Telegram.WebApp.initData (raw query string).
// → 200 AccessTokenDto. Errors: VALIDATION_ERROR 400 or 413, UNAUTHORIZED 401 (bad signature or
// auth_date older than 15 minutes), FORBIDDEN 403 (not the owner), RATE_LIMIT 429.
export const telegramSignInInputSchema = z.strictObject({
  initData: z.string().min(1).max(4096)
});
export type TelegramSignInInput = z.infer<typeof telegramSignInInputSchema>;

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
