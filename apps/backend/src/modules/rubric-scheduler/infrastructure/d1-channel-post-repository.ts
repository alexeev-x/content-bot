import type { ChannelPostRepository } from '../application/ports';

// Direct channel posts (migration 0125): written by the webhook, read by the tick. A replay of an update is a no-op.

const READ_MAX = 200;

export function createD1ChannelPostRepository(db: D1Database): ChannelPostRepository {
  return {
    async record(chatId, messageId, at) {
      await db
        .prepare(
          'INSERT INTO channel_posts (chat_id, message_id, posted_at) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING'
        )
        .bind(chatId, messageId, at)
        .run();
    },
    async since(chatId, since) {
      const { results } = await db
        .prepare(
          'SELECT posted_at FROM channel_posts WHERE chat_id = ?1 AND posted_at >= ?2 ORDER BY posted_at LIMIT ?3'
        )
        .bind(chatId, since, READ_MAX)
        .all<{ posted_at: number }>();
      return results.map((row) => row.posted_at);
    },
    async purge(before, limit) {
      const result = await db
        .prepare(
          `DELETE FROM channel_posts WHERE rowid IN
             (SELECT rowid FROM channel_posts WHERE posted_at < ?1 ORDER BY posted_at LIMIT ?2)`
        )
        .bind(before, limit)
        .run();
      return result.meta.changes;
    }
  };
}
