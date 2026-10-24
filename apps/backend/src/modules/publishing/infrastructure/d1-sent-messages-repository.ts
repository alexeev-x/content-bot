// Which studio post a channel message was sent from (plan B3): analytics knows a Telegram post by its message id in
// the public channel. Only a destination saved as that channel's @username matches, so the message numbers of a
// test channel never land on the real channel's posts. Album parts all point to their post.

export interface SentMessagesReader {
  postsOfMessages(input: {
    channel: string;
    messageIds: readonly string[];
  }): Promise<{ messageId: string; postId: string }[]>;
}

export function createD1SentMessagesReader(db: D1Database): SentMessagesReader {
  return {
    async postsOfMessages({ channel, messageIds }) {
      const ids = messageIds.slice(0, 100);
      if (ids.length === 0) return [];
      const rows = await db
        .prepare(
          `SELECT p.post_id AS postId, CAST(m.value AS TEXT) AS messageId
           FROM destinations AS d
           JOIN publications AS p ON p.destination_id = d.id
           JOIN json_each(COALESCE(p.external_message_ids, json_array(p.external_message_id))) AS m
           WHERE d.chat_id = ?1 AND p.external_message_id IS NOT NULL
             AND CAST(m.value AS TEXT) IN (SELECT value FROM json_each(?2))
           LIMIT 1000`
        )
        // chat_id is COLLATE NOCASE: the @username matches in any letter case through the unique index.
        .bind(`@${channel}`, JSON.stringify(ids))
        .all<{ postId: string; messageId: string }>();
      return rows.results;
    }
  };
}
