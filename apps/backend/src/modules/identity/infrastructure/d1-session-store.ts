import type { SessionStore } from '../application/ports';

interface SessionRow {
  telegram_id: string;
  kind: 'browser' | 'miniapp';
}

export function createD1SessionStore(db: D1Database): SessionStore {
  return {
    async findActiveByTokenHash(tokenHash, now) {
      const row = await db
        .prepare(
          'SELECT telegram_id, kind FROM sessions WHERE token_hash = ?1 AND revoked_at IS NULL AND expires_at > ?2'
        )
        .bind(tokenHash, now)
        .first<SessionRow>();
      return row === null ? null : { telegramId: row.telegram_id, kind: row.kind };
    }
  };
}
