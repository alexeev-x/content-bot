import type { Logger } from '../../../platform/logging/logger';
import { TOKEN_PATTERN } from '../../../platform/security/random-token';
import { sha256Hex } from '../../../platform/security/sha256';
import { AppError } from '../../../shared/app-error';
import { authenticateOwner } from './authenticate-owner';
import { isOwner } from './owner';
import type { SessionStore } from './ports';
import { accessTokenExpiry, REFRESH_TOKEN_TTL_MS } from './session-policy';
import type { IssuedAccessToken } from './sign-in-with-telegram';

export interface RefreshDeps {
  sessions: SessionStore;
  ownerTelegramId: string | undefined;
  now: number;
  newToken: () => string;
  logger: Logger;
  requestId: string;
}

export interface IssuedBrowserTokens extends IssuedAccessToken {
  refreshToken: string;
  /** UTC epoch milliseconds. */
  refreshExpiresAt: number;
}

// Mini App: the still-valid access token is exchanged for a new one and dies with the exchange.
// The session never lives past its hard end, whatever the access token says.
export async function refreshMiniAppSession(
  deps: RefreshDeps,
  authorization: string | undefined
): Promise<IssuedAccessToken> {
  const { session } = await authenticateOwner(deps, authorization);
  // A browser session renews through its refresh cookie, which is what keeps the rotation chain.
  if (session.kind !== 'miniapp' || session.hardExpiresAt <= deps.now) {
    throw new AppError('UNAUTHORIZED', 'Session cannot be refreshed');
  }

  const accessToken = deps.newToken();
  const expiresAt = accessTokenExpiry(deps.now, session.hardExpiresAt);
  const rotated = await deps.sessions.rotateAccessToken({
    sessionId: session.id,
    oldTokenHash: session.tokenHash,
    newTokenHash: await sha256Hex(accessToken),
    newExpiresAt: expiresAt,
    now: deps.now
  });
  // Lost the race: a parallel refresh already replaced this token, so this one is dead.
  if (!rotated) throw new AppError('UNAUTHORIZED', 'Session cannot be refreshed');
  return { accessToken, expiresAt };
}

// Browser: a refresh token works once. Presenting one that was already exchanged means two parties
// hold it, so the whole session is revoked and the legitimate holder signs in again.
export async function refreshBrowserSession(
  deps: RefreshDeps,
  refreshToken: string | undefined
): Promise<IssuedBrowserTokens> {
  if (refreshToken === undefined || !TOKEN_PATTERN.test(refreshToken)) {
    throw new AppError('UNAUTHORIZED', 'Authentication required');
  }
  const oldRefreshHash = await sha256Hex(refreshToken);
  const record = await deps.sessions.findRefreshToken(oldRefreshHash);
  if (record === null) throw new AppError('UNAUTHORIZED', 'Authentication required');

  const revokeAsReused = async (): Promise<never> => {
    await deps.sessions.revoke([record.sessionId], deps.now);
    deps.logger.warn({
      component: 'auth',
      operation: 'refresh_token_reuse',
      requestId: deps.requestId,
      status: 'session_revoked',
      errorCode: 'UNAUTHORIZED'
    });
    throw new AppError('UNAUTHORIZED', 'Authentication required');
  };

  if (record.usedAt !== null) return revokeAsReused();
  if (
    record.kind !== 'browser' ||
    record.sessionRevokedAt !== null ||
    record.expiresAt <= deps.now ||
    record.sessionHardExpiresAt <= deps.now
  ) {
    throw new AppError('UNAUTHORIZED', 'Authentication required');
  }
  if (!isOwner(record.telegramId, deps.ownerTelegramId)) throw new AppError('FORBIDDEN', 'Access denied');

  const newRefreshToken = deps.newToken();
  const accessToken = deps.newToken();
  const accessExpiresAt = accessTokenExpiry(deps.now, record.sessionHardExpiresAt);
  const refreshExpiresAt = Math.min(deps.now + REFRESH_TOKEN_TTL_MS, record.sessionHardExpiresAt);
  const rotated = await deps.sessions.rotateRefreshToken({
    sessionId: record.sessionId,
    oldRefreshHash,
    newRefreshHash: await sha256Hex(newRefreshToken),
    newRefreshExpiresAt: refreshExpiresAt,
    newAccessHash: await sha256Hex(accessToken),
    newAccessExpiresAt: accessExpiresAt,
    now: deps.now
  });
  // Another request exchanged the token between our read and the claim: same evidence as a replay.
  if (!rotated) return revokeAsReused();

  return { accessToken, expiresAt: accessExpiresAt, refreshToken: newRefreshToken, refreshExpiresAt };
}
