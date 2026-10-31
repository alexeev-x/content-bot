import type { AudienceChat, AudienceRepository, CommentRow } from '../application/ports';

// Audience signals in D1 (migration 0118). Every write is idempotent by its key, so a replayed update costs one
// statement and changes nothing; a foreign chat or an unregistered poll changes nothing either.

const DAY_MS = 86_400_000;

interface ChatRow {
  chat_id: number;
  role: 'channel' | 'group';
  channel_chat_id: number | null;
  username: string | null;
  title: string;
  bot_admin: number;
  sees_all: number;
  checked_at: number;
}

interface CommentDbRow {
  group_chat_id: number;
  message_id: number;
  channel_chat_id: number;
  channel_message_id: number;
  created_at: number;
  author_key: string;
  username: string | null;
  kind: 'text' | 'media';
  text: string | null;
}

const toChat = (row: ChatRow): AudienceChat => ({
  chatId: row.chat_id,
  role: row.role,
  channelChatId: row.channel_chat_id,
  username: row.username,
  title: row.title,
  botAdmin: row.bot_admin === 1,
  seesAll: row.sees_all === 1,
  checkedAt: row.checked_at
});

export function createD1AudienceRepository(db: D1Database): AudienceRepository {
  return {
    async saveReactions({ chatId, messageId, total, kindsJson, reportedAt }) {
      await db
        .prepare(
          `INSERT INTO tg_message_reactions (chat_id, message_id, total, kinds_json, reported_at)
           SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM tg_chats WHERE chat_id = ?1 AND role = 'channel')
           ON CONFLICT (chat_id, message_id) DO UPDATE SET
             total = excluded.total, kinds_json = excluded.kinds_json, reported_at = excluded.reported_at
           WHERE excluded.reported_at >= tg_message_reactions.reported_at`
        )
        .bind(chatId, messageId, total, kindsJson, reportedAt)
        .run();
    },

    // The count at 24 h and 72 h of age is the last one seen inside that window.
    async savePollState({ pollId, voters, optionsJson, closed, now }) {
      await db
        .prepare(
          `UPDATE tg_polls SET voters = ?2, options_json = ?3, closed = ?4, updated_at = ?5,
             voters_24h = CASE WHEN ?5 - published_at <= ${DAY_MS} THEN ?2 ELSE voters_24h END,
             voters_72h = CASE WHEN ?5 - published_at <= ${3 * DAY_MS} THEN ?2 ELSE voters_72h END,
             final_at = CASE WHEN ?4 = 1 THEN ?5 ELSE final_at END
           WHERE poll_id = ?1 AND closed = 0`
        )
        .bind(pollId, voters, optionsJson, closed ? 1 : 0, now)
        .run();
    },

    async chat(chatId) {
      const row = await db
        .prepare(
          `SELECT chat_id, role, channel_chat_id, username, title, bot_admin, sees_all, checked_at
           FROM tg_chats WHERE chat_id = ?1`
        )
        .bind(chatId)
        .first<ChatRow>();
      return row === null ? null : toChat(row);
    },

    async thread(groupChatId, rootMessageId) {
      const row = await db
        .prepare(
          `SELECT channel_chat_id, channel_message_id, post_at, capped FROM tg_comment_threads
           WHERE group_chat_id = ?1 AND root_message_id = ?2`
        )
        .bind(groupChatId, rootMessageId)
        .first<{ channel_chat_id: number; channel_message_id: number; post_at: number; capped: number }>();
      return row === null
        ? null
        : {
            channelChatId: row.channel_chat_id,
            channelMessageId: row.channel_message_id,
            postAt: row.post_at,
            capped: row.capped === 1
          };
    },

    async saveThread({ groupChatId, rootMessageId, channelChatId, channelMessageId, postAt }) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO tg_comment_threads
             (group_chat_id, root_message_id, channel_chat_id, channel_message_id, post_at)
           VALUES (?1, ?2, ?3, ?4, ?5)`
        )
        .bind(groupChatId, rootMessageId, channelChatId, channelMessageId, postAt)
        .run();
    },

    // One batch: the insert counts the thread's comments in its own condition, and the cap mark follows only when the
    // insert was refused for the count.
    async saveComment(comment, cap) {
      const count = `(SELECT count(*) FROM tg_comments WHERE channel_chat_id = ?3 AND channel_message_id = ?4)`;
      await db.batch([
        db
          .prepare(
            `INSERT OR IGNORE INTO tg_comments (group_chat_id, message_id, channel_chat_id, channel_message_id,
               created_at, author_key, username, kind, text)
             SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9 WHERE ${count} < ?10`
          )
          .bind(
            comment.groupChatId,
            comment.messageId,
            comment.channelChatId,
            comment.channelMessageId,
            comment.createdAt,
            comment.authorKey,
            comment.username,
            comment.kind,
            comment.text,
            cap
          ),
        db
          .prepare(
            `UPDATE tg_comment_threads SET capped = 1
             WHERE channel_chat_id = ?1 AND channel_message_id = ?2 AND capped = 0
               AND (SELECT count(*) FROM tg_comments WHERE channel_chat_id = ?1 AND channel_message_id = ?2) >= ?3`
          )
          .bind(comment.channelChatId, comment.channelMessageId, cap)
      ]);
    },

    async registerPoll({ pollId, chatId, messageId, publishedAt, closesAt }) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO tg_polls (poll_id, chat_id, message_id, published_at, closes_at)
           VALUES (?1, ?2, ?3, ?4, ?5)`
        )
        .bind(pollId, chatId, messageId, publishedAt, closesAt)
        .run();
    },

    // stopPoll's answer is the final word: it overrides the last update and closes the poll.
    async recordFinalPoll({ pollId, voters, optionsJson, now }) {
      await db
        .prepare(
          `UPDATE tg_polls SET voters = ?2, options_json = ?3, closed = 1, final_at = coalesce(final_at, ?4),
             updated_at = ?4,
             voters_24h = CASE WHEN ?4 - published_at <= ${DAY_MS} THEN ?2 ELSE voters_24h END,
             voters_72h = CASE WHEN ?4 - published_at <= ${3 * DAY_MS} THEN ?2 ELSE voters_72h END
           WHERE poll_id = ?1`
        )
        .bind(pollId, voters, optionsJson, now)
        .run();
    },

    async threadComments({ channelChatId, channelMessageId, since, limit }) {
      const { results } = await db
        .prepare(
          `SELECT group_chat_id, message_id, channel_chat_id, channel_message_id, created_at, author_key, username,
                  kind, text
           FROM tg_comments WHERE channel_chat_id = ?1 AND channel_message_id = ?2 AND created_at >= ?3
           ORDER BY created_at, message_id LIMIT ?4`
        )
        .bind(channelChatId, channelMessageId, since, limit)
        .all<CommentDbRow>();
      return results.map((row): CommentRow => ({
        groupChatId: row.group_chat_id,
        messageId: row.message_id,
        channelChatId: row.channel_chat_id,
        channelMessageId: row.channel_message_id,
        createdAt: row.created_at,
        authorKey: row.author_key,
        username: row.username,
        kind: row.kind,
        text: row.text
      }));
    },

    async chats() {
      const { results } = await db
        .prepare(
          `SELECT chat_id, role, channel_chat_id, username, title, bot_admin, sees_all, checked_at
           FROM tg_chats ORDER BY role, chat_id LIMIT 20`
        )
        .all<ChatRow>();
      return results.map(toChat);
    },

    // One batch: the chats checked now are written, every other row (a channel no longer published to) goes.
    async replaceChats(chats, keep) {
      await db.batch([
        db
          .prepare('DELETE FROM tg_chats WHERE chat_id NOT IN (SELECT value FROM json_each(?1))')
          .bind(JSON.stringify(keep)),
        ...chats.map((chat) =>
          db
            .prepare(
              `INSERT INTO tg_chats (chat_id, role, channel_chat_id, username, title, bot_admin, sees_all, checked_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
               ON CONFLICT (chat_id) DO UPDATE SET role = excluded.role, channel_chat_id = excluded.channel_chat_id,
                 username = excluded.username, title = excluded.title, bot_admin = excluded.bot_admin,
                 sees_all = excluded.sees_all, checked_at = excluded.checked_at`
            )
            .bind(
              chat.chatId,
              chat.role,
              chat.channelChatId,
              chat.username,
              chat.title.slice(0, 128),
              chat.botAdmin ? 1 : 0,
              chat.seesAll ? 1 : 0,
              chat.checkedAt
            )
        )
      ]);
    },

    async freeze(now, minAgeMs, limit) {
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO tg_post_audience
             (channel_chat_id, channel_message_id, comments24, comments72, commenters72, capped, frozen_at)
           SELECT t.channel_chat_id, t.channel_message_id,
             (SELECT count(*) FROM tg_comments c WHERE c.channel_chat_id = t.channel_chat_id
                AND c.channel_message_id = t.channel_message_id AND c.created_at < t.post_at + ${DAY_MS}),
             (SELECT count(*) FROM tg_comments c WHERE c.channel_chat_id = t.channel_chat_id
                AND c.channel_message_id = t.channel_message_id AND c.created_at < t.post_at + ${3 * DAY_MS}),
             (SELECT count(DISTINCT c.author_key) FROM tg_comments c WHERE c.channel_chat_id = t.channel_chat_id
                AND c.channel_message_id = t.channel_message_id AND c.created_at < t.post_at + ${3 * DAY_MS}),
             t.capped, ?1
           FROM tg_comment_threads t
           WHERE t.post_at <= ?1 - ?2
             AND NOT EXISTS (SELECT 1 FROM tg_post_audience a
                             WHERE a.channel_chat_id = t.channel_chat_id AND a.channel_message_id = t.channel_message_id)
           ORDER BY t.post_at LIMIT ?3`
        )
        .bind(now, minAgeMs, limit)
        .run();
      return result.meta.changes;
    },

    async purge({ commentsBefore, threadsBefore, limit }) {
      const results = await db.batch([
        db
          .prepare(
            `DELETE FROM tg_comments WHERE (group_chat_id, message_id) IN (
               SELECT group_chat_id, message_id FROM tg_comments WHERE created_at < ?1 LIMIT ?2)`
          )
          .bind(commentsBefore, limit),
        db
          .prepare(
            `DELETE FROM tg_comment_threads WHERE (group_chat_id, root_message_id) IN (
               SELECT group_chat_id, root_message_id FROM tg_comment_threads WHERE post_at < ?1 LIMIT ?2)`
          )
          .bind(threadsBefore, limit)
      ]);
      return results.reduce((sum, result) => sum + result.meta.changes, 0);
    },

    async updatesSince(since) {
      const row = await db
        .prepare(
          `SELECT
             (SELECT count(*) FROM tg_message_reactions WHERE reported_at >= ?1) AS reactions,
             (SELECT count(*) FROM tg_polls WHERE updated_at >= ?1) AS polls,
             (SELECT count(*) FROM tg_comments WHERE created_at >= ?1) AS comments,
             max(coalesce((SELECT max(reported_at) FROM tg_message_reactions), 0),
                 coalesce((SELECT max(updated_at) FROM tg_polls), 0),
                 coalesce((SELECT max(created_at) FROM tg_comments), 0)) AS last_at`
        )
        .bind(since)
        .first<{ reactions: number; polls: number; comments: number; last_at: number }>();
      return {
        reactions: row?.reactions ?? 0,
        polls: row?.polls ?? 0,
        comments: row?.comments ?? 0,
        lastAt: row === null || row.last_at === 0 ? null : row.last_at
      };
    }
  };
}
