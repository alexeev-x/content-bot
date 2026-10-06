export interface ActiveSession {
  telegramId: string;
  kind: 'browser' | 'miniapp';
}

export interface SessionStore {
  /** A session that is not revoked and not expired at `now`, found by the SHA-256 hash of its token. */
  findActiveByTokenHash(tokenHash: string, now: number): Promise<ActiveSession | null>;
}
