import { sha256Hex } from '../../../platform/security/sha256';
import type { SessionStore } from './ports';
import type { IssuedBrowserTokens } from './refresh-session';
import {
  accessTokenExpiry,
  BROWSER_SESSION_MAX_MS,
  REFRESH_TOKEN_TTL_MS,
  WIDGET_REPLAY_TTL_MS
} from './session-policy';

export interface IssueBrowserSessionDeps {
  sessions: SessionStore;
  now: number;
  newId: () => string;
  newToken: () => string;
}

/**
 * Writes a browser session, its first refresh token and the one-time claim of `signInKey` in one atomic batch.
 * Null when the key was consumed before: nothing was created.
 */
export async function issueBrowserSession(
  deps: IssueBrowserSessionDeps,
  owner: { telegramId: string; name: string; signInKey: string }
): Promise<IssuedBrowserTokens | null> {
  const accessToken = deps.newToken();
  const refreshToken = deps.newToken();
  const hardExpiresAt = deps.now + BROWSER_SESSION_MAX_MS;
  const expiresAt = accessTokenExpiry(deps.now, hardExpiresAt);
  const refreshExpiresAt = Math.min(deps.now + REFRESH_TOKEN_TTL_MS, hardExpiresAt);
  const created = await deps.sessions.createBrowserSessionOnce({
    session: {
      id: deps.newId(),
      tokenHash: await sha256Hex(accessToken),
      telegramId: owner.telegramId,
      kind: 'browser',
      name: owner.name,
      createdAt: deps.now,
      expiresAt,
      hardExpiresAt
    },
    refreshTokenHash: await sha256Hex(refreshToken),
    refreshExpiresAt,
    signInKey: owner.signInKey,
    signInExpiresAt: deps.now + WIDGET_REPLAY_TTL_MS
  });
  return created ? { accessToken, expiresAt, refreshToken, refreshExpiresAt } : null;
}
