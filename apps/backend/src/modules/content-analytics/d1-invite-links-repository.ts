import { INVITE_LINKS_MAX } from '@alexeev/contracts';
import {
  STALE_RESERVATION_MS,
  type InviteCountsRow,
  type InviteLinkRepository,
  type InviteLinkRow
} from './invite-links';

const LINK_COLUMNS = 'id, name, url, created_at AS createdAt, revoked_at AS revokedAt';

export function createD1InviteLinkRepository(db: D1Database): InviteLinkRepository {
  return {
    async read(since) {
      const [links, counts, first] = await db.batch([
        db
          .prepare(
            // Active links first, so revoked ones never push a working link off the bounded list.
            `SELECT ${LINK_COLUMNS} FROM invite_links WHERE url IS NOT NULL
             ORDER BY revoked_at IS NOT NULL, created_at DESC, rowid DESC LIMIT ?1`
          )
          .bind(INVITE_LINKS_MAX),
        db
          .prepare(
            `SELECT invite_link_id AS linkId, COUNT(*) AS joined,
                    SUM(CASE WHEN left_at IS NOT NULL THEN 1 ELSE 0 END) AS "left"
             FROM channel_joins WHERE joined_at >= ?1 GROUP BY invite_link_id`
          )
          .bind(since),
        db.prepare('SELECT MIN(joined_at) AS at FROM channel_joins')
      ]);
      return {
        links: (links?.results ?? []) as InviteLinkRow[],
        counts: (counts?.results ?? []) as InviteCountsRow[],
        trackingSince: ((first?.results ?? [])[0] as { at: number | null } | undefined)?.at ?? null
      };
    },

    async find(id) {
      return db
        .prepare(`SELECT ${LINK_COLUMNS} FROM invite_links WHERE id = ?1 AND url IS NOT NULL`)
        .bind(id)
        .first<InviteLinkRow>();
    },

    async reserve({ id, name, now }) {
      const [, inserted, existing] = await db.batch([
        // A reservation whose Telegram call never finished (the Worker was cut off) frees the name.
        db
          .prepare('DELETE FROM invite_links WHERE name = ?1 AND url IS NULL AND created_at < ?2')
          .bind(name, now - STALE_RESERVATION_MS),
        db
          .prepare(
            `INSERT INTO invite_links (id, name, url, created_at)
             SELECT ?1, ?2, NULL, ?3 WHERE (SELECT COUNT(*) FROM invite_links WHERE revoked_at IS NULL) < ?4
             ON CONFLICT DO NOTHING`
          )
          .bind(id, name, now, INVITE_LINKS_MAX),
        db
          .prepare('SELECT 1 AS taken FROM invite_links WHERE name = ?1 AND revoked_at IS NULL AND id <> ?2')
          .bind(name, id)
      ]);
      if (inserted?.meta.changes === 1) return 'reserved';
      return (existing?.results ?? []).length > 0 ? 'taken' : 'full';
    },

    async complete(id, url) {
      await db.prepare('UPDATE invite_links SET url = ?2 WHERE id = ?1 AND url IS NULL').bind(id, url).run();
    },

    async release(id) {
      await db.prepare('DELETE FROM invite_links WHERE id = ?1 AND url IS NULL').bind(id).run();
    },

    async revoke(id, now) {
      await db
        .prepare('UPDATE invite_links SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL')
        .bind(id, now)
        .run();
    },

    async recordJoin({ id, userId, inviteUrl, at }) {
      await db.batch([
        // A leave that never arrived: the person is joining again, so the earlier stay ended before now.
        db.prepare('UPDATE channel_joins SET left_at = ?2 WHERE user_id = ?1 AND left_at IS NULL').bind(userId, at),
        db
          .prepare(
            `INSERT INTO channel_joins (id, user_id, invite_link_id, joined_at)
             VALUES (?1, ?2, (SELECT id FROM invite_links WHERE url = ?3), ?4)`
          )
          .bind(id, userId, inviteUrl, at)
      ]);
    },

    async recordLeave({ userId, at }) {
      await db
        .prepare('UPDATE channel_joins SET left_at = ?2 WHERE user_id = ?1 AND left_at IS NULL')
        .bind(userId, at)
        .run();
    }
  };
}
