import type { ActiveSession, RefreshTokenRecord, SessionStore } from '../application/ports';

interface SessionRow {
  id: string;
  telegram_id: string;
  kind: 'browser' | 'miniapp';
  name: string;
  expires_at: number;
  hard_expires_at: number;
}

interface RefreshRow {
  session_id: string;
  telegram_id: string;
  kind: 'browser' | 'miniapp';
  expires_at: number;
  used_at: number | null;
  revoked_at: number | null;
  hard_expires_at: number;
}

// Expired signatures are deleted a few at a time by each sign-in, so the table stays small without
// a Cron job and no request pays for an unbounded delete.
const SIGN_IN_PURGE_BATCH = 20;

// Sessions the hourly cleanup may delete (?1 = cutoff, ?2 = limit per reason): revoked, or past both
// the access token and the hard expiry. One indexed, individually ordered and limited branch per
// reason (a plain OR would walk the whole table), so the refresh-token delete and the session
// delete of one batch pick the same rows. A session that is both is listed twice, which IN does
// not mind.
export const ENDED_SESSIONS_SQL = `SELECT id FROM (
    SELECT id FROM sessions WHERE revoked_at IS NOT NULL AND revoked_at <= ?1 ORDER BY revoked_at, id LIMIT ?2
  )
  UNION ALL
  SELECT id FROM (
    SELECT id FROM sessions WHERE expires_at <= ?1 AND hard_expires_at <= ?1 ORDER BY expires_at, id LIMIT ?2
  )`;

export function createD1SessionStore(db: D1Database): SessionStore {
  return {
    async findActiveByTokenHash(tokenHash, now): Promise<ActiveSession | null> {
      const row = await db
        .prepare(
          `SELECT id, telegram_id, kind, name, expires_at, hard_expires_at FROM sessions
           WHERE token_hash = ?1 AND revoked_at IS NULL AND expires_at > ?2`
        )
        .bind(tokenHash, now)
        .first<SessionRow>();
      if (row === null) return null;
      return {
        id: row.id,
        telegramId: row.telegram_id,
        kind: row.kind,
        name: row.name,
        tokenHash,
        expiresAt: row.expires_at,
        hardExpiresAt: row.hard_expires_at
      };
    },

    async create(session) {
      await db
        .prepare(
          `INSERT INTO sessions (id, token_hash, telegram_id, kind, name, created_at, expires_at, hard_expires_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
        )
        .bind(
          session.id,
          session.tokenHash,
          session.telegramId,
          session.kind,
          session.name,
          session.createdAt,
          session.expiresAt,
          session.hardExpiresAt
        )
        .run();
    },

    // The claim is the only decision point: INSERT OR IGNORE on the primary key of the signature.
    // The session and the refresh token are inserted only while the claim row carries this
    // request's session id, so the loser of a race (or a replay) changes nothing and gets false.
    async createBrowserSessionOnce({ session, refreshTokenHash, refreshExpiresAt, signInKey, signInExpiresAt }) {
      const claimed = `EXISTS (SELECT 1 FROM widget_sign_ins WHERE hash_sha256 = ?1 AND session_id = ?2)`;
      const [, claim] = await db.batch([
        db
          .prepare(
            `DELETE FROM widget_sign_ins WHERE hash_sha256 IN
               (SELECT hash_sha256 FROM widget_sign_ins WHERE expires_at <= ?1 LIMIT ${SIGN_IN_PURGE_BATCH})`
          )
          .bind(session.createdAt),
        db
          .prepare(
            `INSERT OR IGNORE INTO widget_sign_ins (hash_sha256, session_id, created_at, expires_at)
             VALUES (?1, ?2, ?3, ?4)`
          )
          .bind(signInKey, session.id, session.createdAt, signInExpiresAt),
        db
          .prepare(
            `INSERT INTO sessions (id, token_hash, telegram_id, kind, name, created_at, expires_at, hard_expires_at)
             SELECT ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9 WHERE ${claimed}`
          )
          .bind(
            signInKey,
            session.id,
            session.tokenHash,
            session.telegramId,
            session.kind,
            session.name,
            session.createdAt,
            session.expiresAt,
            session.hardExpiresAt
          ),
        db
          .prepare(
            `INSERT INTO refresh_tokens (token_hash, session_id, created_at, expires_at)
             SELECT ?3, ?2, ?4, ?5 WHERE ${claimed}`
          )
          .bind(signInKey, session.id, refreshTokenHash, session.createdAt, refreshExpiresAt)
      ]);
      return claim?.meta.changes === 1;
    },

    async rotateAccessToken({ sessionId, oldTokenHash, newTokenHash, newExpiresAt, now }) {
      const result = await db
        .prepare(
          `UPDATE sessions SET token_hash = ?1, expires_at = ?2
           WHERE id = ?3 AND token_hash = ?4 AND kind = 'miniapp' AND revoked_at IS NULL
             AND expires_at > ?5 AND hard_expires_at > ?5`
        )
        .bind(newTokenHash, newExpiresAt, sessionId, oldTokenHash, now)
        .run();
      return result.meta.changes === 1;
    },

    async findRefreshToken(tokenHash): Promise<RefreshTokenRecord | null> {
      const row = await db
        .prepare(
          `SELECT r.session_id, r.expires_at, r.used_at, s.telegram_id, s.kind, s.revoked_at, s.hard_expires_at
           FROM refresh_tokens r JOIN sessions s ON s.id = r.session_id
           WHERE r.token_hash = ?1`
        )
        .bind(tokenHash)
        .first<RefreshRow>();
      if (row === null) return null;
      return {
        sessionId: row.session_id,
        telegramId: row.telegram_id,
        kind: row.kind,
        expiresAt: row.expires_at,
        usedAt: row.used_at,
        sessionRevokedAt: row.revoked_at,
        sessionHardExpiresAt: row.hard_expires_at
      };
    },

    // The first statement is the only decision point: it claims the old token (used_at IS NULL)
    // and records the successor hash as `replaced_by`. The later statements run only when that
    // claim by this very request exists, so a lost race leaves no half-rotated state.
    async rotateRefreshToken(input) {
      const claimed = `EXISTS (SELECT 1 FROM refresh_tokens WHERE token_hash = ?1 AND replaced_by = ?2)`;
      const [claim] = await db.batch([
        db
          .prepare(
            `UPDATE refresh_tokens SET used_at = ?3, replaced_by = ?2
             WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?3
               AND EXISTS (SELECT 1 FROM sessions WHERE id = ?4 AND revoked_at IS NULL AND hard_expires_at > ?3)`
          )
          .bind(input.oldRefreshHash, input.newRefreshHash, input.now, input.sessionId),
        db
          .prepare(
            `INSERT INTO refresh_tokens (token_hash, session_id, created_at, expires_at)
             SELECT ?2, ?3, ?4, ?5 WHERE ${claimed}`
          )
          .bind(input.oldRefreshHash, input.newRefreshHash, input.sessionId, input.now, input.newRefreshExpiresAt),
        db
          .prepare(
            `UPDATE sessions SET token_hash = ?3, expires_at = ?4
             WHERE id = ?5 AND revoked_at IS NULL AND ${claimed}`
          )
          .bind(
            input.oldRefreshHash,
            input.newRefreshHash,
            input.newAccessHash,
            input.newAccessExpiresAt,
            input.sessionId
          ),
        db
          .prepare('DELETE FROM refresh_tokens WHERE session_id = ?1 AND expires_at <= ?2')
          .bind(input.sessionId, input.now)
      ]);
      return claim?.meta.changes === 1;
    },

    async revoke(sessionIds, now) {
      if (sessionIds.length === 0) return;
      await db.batch(
        sessionIds.map((id) =>
          db.prepare('UPDATE sessions SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL').bind(now, id)
        )
      );
    },

    // One batch: the refresh tokens of the ended sessions go first (their foreign key has no cascade),
    // then the sessions themselves. Both statements pick the same rows: each branch has a total
    // order and the sessions do not change between them.
    async purgeEnded({ now, limit, graceMs }) {
      const cutoff = now - graceMs;
      const ended = ENDED_SESSIONS_SQL;
      const [signIns, , sessions] = await db.batch([
        db
          .prepare(
            `DELETE FROM widget_sign_ins WHERE hash_sha256 IN
               (SELECT hash_sha256 FROM widget_sign_ins WHERE expires_at <= ?1 ORDER BY expires_at LIMIT ?2)`
          )
          .bind(now, limit),
        db.prepare(`DELETE FROM refresh_tokens WHERE session_id IN (${ended})`).bind(cutoff, limit),
        db.prepare(`DELETE FROM sessions WHERE id IN (${ended})`).bind(cutoff, limit)
      ]);
      return { signIns: signIns?.meta.changes ?? 0, sessions: sessions?.meta.changes ?? 0 };
    }
  };
}
