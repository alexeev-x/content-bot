import type { RubricPostSource, ScoreSources, ThemeCandidate, WeekSlotsSource } from '../../modules/rubric-analytics';

// The rubric analytics' sources over the other modules' tables (area-backend-analytics.md §2.1): the scheduler's sent
// slots, content analytics' checkpoints and snapshots, the audience's threads, comments and polls. Read-only SQL in
// the app layer, which is where modules meet; every list is bounded and every IN list stays under 100 parameters.

const HOUR_MS = 3_600_000;
const IN_MAX = 90;
const marks = (count: number) => Array.from({ length: count }, () => '?').join(', ');
const chunk = <T>(items: readonly T[]) => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += IN_MAX) out.push(items.slice(i, i + IN_MAX));
  return out;
};

interface SlotDbRow {
  id: string;
  rubric_key: string;
  kind: string;
  sent_at: number;
  message_ids_json: string | null;
  facts_json: string | null;
  build_json: string | null;
  explore: number;
  dest_chat: string;
  dest_username: string | null;
}

/** The channel a destination posts to, as a lower-case username (null when it has none we know). */
const channelOf = (row: SlotDbRow) =>
  row.dest_chat.startsWith('@') ? row.dest_chat.slice(1).toLowerCase() : (row.dest_username?.toLowerCase() ?? null);

function toPost(row: SlotDbRow): RubricPostSource | null {
  const ids = (row.message_ids_json === null ? [] : (JSON.parse(row.message_ids_json) as string[])).map(Number);
  const first = ids[0];
  if (first === undefined || !Number.isSafeInteger(first) || first <= 0) return null;
  const facts = (row.facts_json === null ? {} : JSON.parse(row.facts_json)) as {
    heroIds?: number[];
    bankLine?: string;
    look?: string;
    topic?: string;
  };
  const build = (row.build_json === null ? {} : JSON.parse(row.build_json)) as {
    hasPicture?: boolean;
    hasPoll?: boolean;
    bankTurn?: number | null;
  };
  const line = facts.bankLine ?? facts.topic ?? (typeof build.bankTurn === 'number' ? `#${build.bankTurn}` : null);
  return {
    slotId: row.id,
    rubric: row.rubric_key,
    role: row.kind === 'follow_up' ? 'followup' : 'main',
    sentAt: row.sent_at,
    channel: channelOf(row),
    messageId: first,
    // The poll is the last message of the post (a picture inside the poll makes it the only one).
    pollMessageId: build.hasPoll === true ? (ids.at(-1) ?? null) : null,
    slices: {
      hero: facts.heroIds?.[0] === undefined ? null : String(facts.heroIds[0]),
      line: line === null ? null : line.slice(0, 80),
      look: facts.look ?? null,
      picture: build.hasPicture === true,
      exploration: row.explore === 1
    }
  };
}

export function createRubricAnalyticsSources(
  db: D1Database,
  channelSetting: string | undefined
): ScoreSources & {
  themeCandidates(since: number, limit: number): Promise<ThemeCandidate[]>;
  audienceConnected(): Promise<boolean>;
  channelChatId(): Promise<number | null>;
} {
  const channel = channelSetting?.trim().replace(/^@/, '').toLowerCase() || null;
  const channelChatId = async (): Promise<number | null> => {
    if (channel === null) return null;
    const row = await db
      .prepare("SELECT chat_id FROM tg_chats WHERE role = 'channel' AND lower(username) = ? LIMIT 1")
      .bind(channel)
      .first<{ chat_id: number }>();
    return row?.chat_id ?? null;
  };

  const sources = {
    channel,
    channelChatId,

    async sentRubricPosts(since: number, until: number, limit: number) {
      const { results } = await db
        .prepare(
          `SELECT s.id, s.rubric_key, s.kind, s.sent_at, s.message_ids_json, s.facts_json, s.build_json, s.explore,
                  d.chat_id AS dest_chat, c.username AS dest_username
             FROM rubric_slots s
             JOIN publications p ON p.id = s.publication_id
             JOIN destinations d ON d.id = p.destination_id
             LEFT JOIN tg_chats c ON c.chat_id = CAST(d.chat_id AS INTEGER) AND d.chat_id NOT LIKE '@%'
            WHERE s.sent_at >= ? AND s.sent_at <= ? AND s.status IN ('sent', 'partial')
              AND s.kind IN ('pool', 'event', 'anchor', 'follow_up')
            ORDER BY s.sent_at DESC LIMIT ?`
        )
        .bind(since, until, limit)
        .all<SlotDbRow>();
      return results.flatMap((row) => {
        const post = toPost(row);
        return post === null ? [] : [post];
      });
    },

    async channelSamples(range: { from: number; to: number } | { messageIds: number[] }) {
      // likes at 24/72 h: the first hourly snapshot inside the 90-minute window after that age.
      const select = `SELECT i.id, i.published_at, i.v24h, i.v72h,
          (SELECT s.likes FROM content_item_snapshots s WHERE s.item_id = i.id
              AND s.observed_at >= i.published_at + ${24 * HOUR_MS} AND s.observed_at <= i.published_at + ${25.5 * HOUR_MS}
            ORDER BY s.observed_at LIMIT 1) AS likes24,
          (SELECT s.likes FROM content_item_snapshots s WHERE s.item_id = i.id
              AND s.observed_at >= i.published_at + ${72 * HOUR_MS} AND s.observed_at <= i.published_at + ${73.5 * HOUR_MS}
            ORDER BY s.observed_at LIMIT 1) AS likes72,
          EXISTS (SELECT 1 FROM content_item_contamination x WHERE x.item_id = i.id) AS contaminated
        FROM content_items i`;
      type Row = {
        id: string;
        published_at: number;
        v24h: number | null;
        v72h: number | null;
        likes24: number | null;
        likes72: number | null;
        contaminated: number;
      };
      let rows: Row[] = [];
      if ('messageIds' in range) {
        for (const part of chunk(range.messageIds)) {
          const { results } = await db
            .prepare(`${select} WHERE i.id IN (${marks(part.length)})`)
            .bind(...part.map((id) => `telegram:${id}`))
            .all<Row>();
          rows = rows.concat(results);
        }
      } else {
        const { results } = await db
          .prepare(
            `${select} WHERE i.platform = 'telegram' AND i.published_at >= ? AND i.published_at < ?
              ORDER BY i.published_at DESC LIMIT 400`
          )
          .bind(range.from, range.to)
          .all<Row>();
        rows = results;
      }
      return rows.map((row) => ({
        messageId: Number(row.id.slice('telegram:'.length)),
        publishedAt: row.published_at,
        v24h: row.v24h,
        v72h: row.v72h,
        likes24: row.likes24,
        likes72: row.likes72,
        contaminated: row.contaminated === 1
      }));
    },

    async comments(messageIds: number[]) {
      const out = new Map<number, { c24: number; c72: number | null }>();
      const chat = await channelChatId();
      if (chat === null || messageIds.length === 0) return out;
      for (const part of chunk(messageIds)) {
        const { results } = await db
          .prepare(
            `SELECT t.channel_message_id AS id,
                    COALESCE(a.comments24, (SELECT COUNT(*) FROM tg_comments c WHERE c.channel_chat_id = t.channel_chat_id
                       AND c.channel_message_id = t.channel_message_id AND c.created_at < t.post_at + ${24 * HOUR_MS})) AS c24,
                    a.comments72 AS c72
               FROM tg_comment_threads t
               LEFT JOIN tg_post_audience a ON a.channel_chat_id = t.channel_chat_id AND a.channel_message_id = t.channel_message_id
              WHERE t.channel_chat_id = ? AND t.channel_message_id IN (${marks(part.length)})`
          )
          .bind(chat, ...part)
          .all<{ id: number; c24: number; c72: number | null }>();
        for (const row of results) out.set(row.id, { c24: row.c24, c72: row.c72 });
      }
      return out;
    },

    async commentsInRange(from: number, to: number) {
      const out = new Map<number, number>();
      const chat = await channelChatId();
      if (chat === null) return out;
      const { results } = await db
        .prepare(
          `SELECT t.channel_message_id AS id,
                  COALESCE(a.comments24, (SELECT COUNT(*) FROM tg_comments c WHERE c.channel_chat_id = t.channel_chat_id
                     AND c.channel_message_id = t.channel_message_id AND c.created_at < t.post_at + ${24 * HOUR_MS})) AS c24
             FROM tg_comment_threads t
             LEFT JOIN tg_post_audience a ON a.channel_chat_id = t.channel_chat_id AND a.channel_message_id = t.channel_message_id
            WHERE t.channel_chat_id = ? AND t.post_at >= ? AND t.post_at < ? LIMIT 400`
        )
        .bind(chat, from, to)
        .all<{ id: number; c24: number }>();
      for (const row of results) out.set(row.id, row.c24);
      return out;
    },

    async pollVoters(messageIds: number[]) {
      const out = new Map<number, { v24: number | null; v72: number | null }>();
      const chat = await channelChatId();
      if (chat === null || messageIds.length === 0) return out;
      for (const part of chunk(messageIds)) {
        const { results } = await db
          .prepare(
            `SELECT message_id, voters_24h, voters_72h FROM tg_polls
              WHERE chat_id = ? AND message_id IN (${marks(part.length)})`
          )
          .bind(chat, ...part)
          .all<{ message_id: number; voters_24h: number | null; voters_72h: number | null }>();
        for (const row of results) out.set(row.message_id, { v24: row.voters_24h, v72: row.voters_72h });
      }
      return out;
    },

    async pollsInRange(from: number, to: number) {
      const chat = await channelChatId();
      if (chat === null) return [];
      const { results } = await db
        .prepare(
          `SELECT message_id, voters_24h FROM tg_polls
            WHERE chat_id = ? AND published_at >= ? AND published_at < ? AND voters_24h IS NOT NULL LIMIT 200`
        )
        .bind(chat, from, to)
        .all<{ message_id: number; voters_24h: number }>();
      return results.map((row) => ({ messageId: row.message_id, voters24: row.voters_24h }));
    },

    /** Rubric posts whose comment counts are frozen (73 h) and still have text (kept 10 days), not themed yet. */
    async themeCandidates(since: number, limit: number): Promise<ThemeCandidate[]> {
      const chat = await channelChatId();
      if (chat === null || channel === null) return [];
      const { results: posts } = await db
        .prepare(
          `SELECT r.message_id, r.rubric_key FROM rubric_post_scores r
             JOIN tg_post_audience a ON a.channel_chat_id = ? AND a.channel_message_id = r.message_id
            WHERE r.chat_id = ? AND r.sent_at >= ? AND a.comments72 > 0
              AND NOT EXISTS (SELECT 1 FROM rubric_comment_themes t WHERE t.chat_id = r.chat_id AND t.message_id = r.message_id)
            ORDER BY r.sent_at DESC LIMIT ?`
        )
        .bind(chat, channel, since, limit)
        .all<{ message_id: number; rubric_key: string }>();
      const out: ThemeCandidate[] = [];
      for (const post of posts) {
        const { results } = await db
          .prepare(
            `SELECT text, author_key FROM tg_comments WHERE channel_chat_id = ? AND channel_message_id = ?
                AND text IS NOT NULL ORDER BY created_at, message_id LIMIT 200`
          )
          .bind(chat, post.message_id)
          .all<{ text: string; author_key: string }>();
        out.push({
          chatId: channel,
          messageId: post.message_id,
          rubric: post.rubric_key,
          comments: results.map((row) => ({ text: row.text, author: row.author_key }))
        });
      }
      return out;
    },

    async audienceConnected() {
      const chat = await channelChatId();
      if (chat === null) return false;
      const row = await db
        .prepare(
          "SELECT bot_admin FROM tg_chats WHERE role = 'group' AND channel_chat_id = ? AND bot_admin = 1 LIMIT 1"
        )
        .bind(chat)
        .first<{ bot_admin: number }>();
      return row !== null;
    }
  };
  return sources;
}

/** The week's slot outcomes for the Monday block (the scheduler's table, read here). */
export function createWeekSlotsSource(db: D1Database): WeekSlotsSource {
  return {
    async summary(from, to) {
      const { results } = await db
        .prepare(
          `SELECT rubric_key, status, error_code, COUNT(*) AS n FROM rubric_slots
            WHERE slot_at >= ? AND slot_at < ? AND kind <> 'poll_close'
            GROUP BY rubric_key, status, error_code`
        )
        .bind(from, to)
        .all<{ rubric_key: string; status: string; error_code: string | null; n: number }>();
      const sum = (statuses: string[]) =>
        results.filter((row) => statuses.includes(row.status)).reduce((total, row) => total + row.n, 0);
      return {
        sent: sum(['sent', 'partial']),
        missed: sum(['missed']),
        empty: sum(['empty']),
        skipped: sum(['skipped']),
        failed: sum(['send_failed']),
        unresolved: sum(['unknown', 'unresolved']),
        causes: results
          .filter((row) => ['missed', 'empty', 'send_failed'].includes(row.status) && row.error_code !== null)
          .sort((a, b) => b.n - a.n)
          .slice(0, 5)
          .map((row) => ({ rubric: row.rubric_key, code: row.error_code as string, count: row.n }))
      };
    }
  };
}
