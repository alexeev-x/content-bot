import { sha256Hex } from '../../../platform/security/sha256';
import { AppError } from '../../../shared/app-error';
import { displayName } from './display-name';
import { parseOwnerTelegramId } from './owner';
import type { SessionStore } from './ports';
import {
  accessTokenExpiry,
  BROWSER_SESSION_MAX_MS,
  REFRESH_TOKEN_TTL_MS,
  WIDGET_REPLAY_TTL_MS
} from './session-policy';
import type { IssuedBrowserTokens } from './refresh-session';
import { verifyWidgetData, type WidgetField } from './verify-widget-data';

export interface WidgetSignInDeps {
  sessions: SessionStore;
  /** `TELEGRAM_BOT_TOKEN`; the sign-in cannot work without it. */
  botToken: string | undefined;
  /** `OWNER_TELEGRAM_ID`; empty or unset means nobody can sign in. */
  ownerTelegramId: string | undefined;
  now: number;
  newId: () => string;
  newToken: () => string;
}

// One failure message for a bad, stale or reused signature: the caller learns nothing about which.
const REJECTED = 'Invalid Telegram sign-in data';

// Creates a browser session from a Login Widget payload. The signature is checked first, then
// the session, its first refresh token and the one-time claim of the signature are written in one
// atomic batch (see SessionStore.createBrowserSessionOnce).
export async function signInWithWidget(
  deps: WidgetSignInDeps,
  fields: Readonly<Record<string, WidgetField>>
): Promise<IssuedBrowserTokens> {
  if (deps.botToken === undefined || deps.botToken === '') {
    throw new AppError('UNAVAILABLE', 'Sign-in is not configured');
  }
  // Telegram user ids are positive, so 0 matches nobody: with no owner a valid signature ends in
  // 403 and a forged one still in 401.
  const ownerTelegramId = parseOwnerTelegramId(deps.ownerTelegramId) ?? 0;

  const result = await verifyWidgetData({ fields, botToken: deps.botToken, ownerTelegramId, now: deps.now });
  if (!result.ok) {
    if (result.reason === 'FOREIGN_USER') throw new AppError('FORBIDDEN', 'Access denied');
    throw new AppError('UNAUTHORIZED', REJECTED);
  }

  const accessToken = deps.newToken();
  const refreshToken = deps.newToken();
  const hardExpiresAt = deps.now + BROWSER_SESSION_MAX_MS;
  const expiresAt = accessTokenExpiry(deps.now, hardExpiresAt);
  const refreshExpiresAt = Math.min(deps.now + REFRESH_TOKEN_TTL_MS, hardExpiresAt);
  const created = await deps.sessions.createBrowserSessionOnce({
    session: {
      id: deps.newId(),
      tokenHash: await sha256Hex(accessToken),
      telegramId: String(result.user.id),
      kind: 'browser',
      name: displayName(result.user),
      createdAt: deps.now,
      expiresAt,
      hardExpiresAt
    },
    refreshTokenHash: await sha256Hex(refreshToken),
    refreshExpiresAt,
    // The hash is a string here: verifyWidgetData accepted it as 64 hex characters.
    signInKey: await sha256Hex(String(fields.hash)),
    signInExpiresAt: deps.now + WIDGET_REPLAY_TTL_MS
  });
  if (!created) throw new AppError('UNAUTHORIZED', REJECTED);

  return { accessToken, expiresAt, refreshToken, refreshExpiresAt };
}
