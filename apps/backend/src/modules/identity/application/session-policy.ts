export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
// A Mini App session cannot outlive this: after it the owner reopens the app from the bot, because
// initData is only accepted for 15 minutes after launch.
export const MINIAPP_SESSION_MAX_MS = 12 * 60 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Absolute end of a browser session however often it is refreshed.
export const BROWSER_SESSION_MAX_MS = 90 * 24 * 60 * 60 * 1000;
// How long an accepted widget signature is remembered. A payload is accepted for 15 minutes after
// its auth_date, which may be up to 60 s ahead of our clock, so it can pass until 16 minutes after
// its first use; 30 minutes keeps a wide margin.
export const WIDGET_REPLAY_TTL_MS = 30 * 60 * 1000;

// An access token never outlives the session that carries it.
export function accessTokenExpiry(now: number, hardExpiresAt: number): number {
  return Math.min(now + ACCESS_TOKEN_TTL_MS, hardExpiresAt);
}
