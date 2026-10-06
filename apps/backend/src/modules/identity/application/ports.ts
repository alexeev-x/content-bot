export interface ActiveSession {
  id: string;
  telegramId: string;
  kind: 'browser' | 'miniapp';
  name: string;
  /** SHA-256 hex of the access token the session was found by. */
  tokenHash: string;
  /** End of the current access token. */
  expiresAt: number;
  /** End of the whole session; a refresh never goes past it. */
  hardExpiresAt: number;
}

export interface NewSession {
  id: string;
  tokenHash: string;
  telegramId: string;
  kind: 'browser' | 'miniapp';
  name: string;
  createdAt: number;
  expiresAt: number;
  hardExpiresAt: number;
}

export interface NewBrowserSession {
  session: NewSession;
  refreshTokenHash: string;
  refreshExpiresAt: number;
  /** SHA-256 hex of the widget signature this sign-in consumes; it can be consumed once. */
  signInKey: string;
  /** Until when the signature is remembered. */
  signInExpiresAt: number;
}

export interface RefreshTokenRecord {
  sessionId: string;
  telegramId: string;
  kind: 'browser' | 'miniapp';
  expiresAt: number;
  /** Set once the token was exchanged; presenting it again is theft evidence. */
  usedAt: number | null;
  sessionRevokedAt: number | null;
  sessionHardExpiresAt: number;
}

export interface SessionStore {
  /** A session that is not revoked and not expired at `now`, found by the SHA-256 hash of its token. */
  findActiveByTokenHash(tokenHash: string, now: number): Promise<ActiveSession | null>;
  create(session: NewSession): Promise<void>;
  /**
   * One atomic step: consumes `signInKey`, creates the session and its first refresh token. False
   * when the key was consumed before: nothing was created, so a replay (sequential or concurrent)
   * can never mint a second session.
   */
  createBrowserSessionOnce(input: NewBrowserSession): Promise<boolean>;
  /**
   * Swaps the access token of a live Mini App session. False when `oldTokenHash` is no longer the
   * session's token or the session ended: another request won, so the caller must not retry.
   */
  rotateAccessToken(input: {
    sessionId: string;
    oldTokenHash: string;
    newTokenHash: string;
    newExpiresAt: number;
    now: number;
  }): Promise<boolean>;
  findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /**
   * One atomic step: marks the refresh token used, stores its successor and swaps the session's
   * access token. False when the token was already used or the session ended.
   */
  rotateRefreshToken(input: {
    sessionId: string;
    oldRefreshHash: string;
    newRefreshHash: string;
    newRefreshExpiresAt: number;
    newAccessHash: string;
    newAccessExpiresAt: number;
    now: number;
  }): Promise<boolean>;
  revoke(sessionIds: readonly string[], now: number): Promise<void>;
  /**
   * Hourly cleanup, at most `limit` rows per table (sessions: per reason, revoked or expired): spent Login Widget signatures, then sessions that
   * can no longer be used (revoked, or past both token and hard expiry) together with their refresh
   * tokens, which have no ON DELETE. Rows younger than `graceMs` past their end are kept for diagnosis.
   */
  purgeEnded(input: { now: number; limit: number; graceMs: number }): Promise<{ signIns: number; sessions: number }>;
}
