import { beforeEach, describe, expect, it } from 'vitest';
import { checkAudienceSetup, createD1AudienceRepository, purgeAudience } from '../../src/modules/audience';
import { testDb } from '../helpers/db';
import { fakeBotAdminApi } from '../helpers/fake-bot-admin-api';
import { type Api, createApi, fakeClock, type FakeClock, OWNER_ID, resetDb, START } from '../helpers/harness';

// The channel's audience (migration 0118): reaction counts, registered polls and discussion comments arrive through the
// owner's webhook, are kept without any raw user id, and never reach the owner's own flow. Asserts D1 state.

const SECRET = 'hook-secret-PLACEHOLDER';
const BOT_INFO = JSON.stringify({ id: 123456, is_bot: true, first_name: 'Bot', username: 'content_bot' });
const ORIGIN = 'https://studio.example.com';
const CHANNEL = -1001111;
const GROUP = -1002222;
const DAY = 86_400_000;

let api: Api;
let clock: FakeClock;
let updateId = 9000;

const build = (hashKey: string | undefined) =>
  createApi({
    clock,
    botInfo: BOT_INFO,
    webhookSecret: SECRET,
    botAdminApi: fakeBotAdminApi(),
    env: { AUDIENCE_HASH_KEY: hashKey ?? '' }
  });

beforeEach(async () => {
  await resetDb();
  clock = fakeClock();
  api = build('test-key-PLACEHOLDER');
  const repo = createD1AudienceRepository(testDb());
  await repo.replaceChats(
    [
      chat({ chatId: CHANNEL, role: 'channel', channelChatId: null }),
      chat({ chatId: GROUP, role: 'group', channelChatId: CHANNEL })
    ],
    [CHANNEL, GROUP]
  );
});

function chat(input: { chatId: number; role: 'channel' | 'group'; channelChatId: number | null }) {
  return { ...input, username: null, title: 'Канал', botAdmin: true, seesAll: true, checkedAt: START };
}

const deliver = (update: Record<string, unknown>, target = api) =>
  target.request(`${ORIGIN}/webhooks/telegram`, {
    method: 'POST',
    token: null,
    json: { update_id: ++updateId, ...update },
    headers: { 'x-telegram-bot-api-secret-token': SECRET }
  });

const reactionUpdate = (chatId: number, messageId: number, counts: number[], date: number) => ({
  message_reaction_count: {
    chat: { id: chatId, type: 'channel', title: 'Канал' },
    message_id: messageId,
    date,
    reactions: counts.map((total_count, index) => ({
      type: { type: 'emoji', emoji: ['👍', '🔥', '😁'][index] },
      total_count
    }))
  }
});

const forward = (rootId: number, channelMessageId: number) => ({
  message: {
    message_id: rootId,
    date: START / 1000,
    chat: { id: GROUP, type: 'supergroup', title: 'Обсуждение' },
    sender_chat: { id: CHANNEL, type: 'channel', title: 'Канал' },
    is_automatic_forward: true,
    forward_origin: {
      type: 'channel',
      chat: { id: CHANNEL, type: 'channel' },
      message_id: channelMessageId,
      date: START / 1000
    }
  }
});

const comment = (messageId: number, rootId: number, fromId: number, text: string) => ({
  message: {
    message_id: messageId,
    date: START / 1000 + 60,
    chat: { id: GROUP, type: 'supergroup', title: 'Обсуждение' },
    from: { id: fromId, is_bot: false, first_name: 'Вася Пупкин', username: 'vasya' },
    message_thread_id: rootId,
    reply_to_message: { message_id: rootId },
    text
  }
});

const rows = <T>(sql: string) =>
  testDb()
    .prepare(sql)
    .all<T>()
    .then((result) => result.results);

describe('audience branch of the webhook', () => {
  it('keeps the newest reaction count of a channel post and ignores a foreign chat', async () => {
    expect((await deliver(reactionUpdate(CHANNEL, 7, [3, 2], 100))).status).toBe(200);
    await deliver(reactionUpdate(CHANNEL, 7, [1], 50));
    await deliver(reactionUpdate(-100999, 7, [9], 200));

    expect(await rows('SELECT chat_id, message_id, total, kinds_json FROM tg_message_reactions')).toEqual([
      { chat_id: CHANNEL, message_id: 7, total: 5, kinds_json: '{"👍":3,"🔥":2}' }
    ]);
  });

  it('updates only a registered open poll, the 24 h count while it is young', async () => {
    const repo = createD1AudienceRepository(testDb());
    await repo.registerPoll({ pollId: 'p1', chatId: CHANNEL, messageId: 8, publishedAt: START, closesAt: null });
    const poll = (id: string, voters: number, closed = false) => ({
      poll: {
        id,
        question: 'Нерф или баф?',
        total_voter_count: voters,
        is_closed: closed,
        options: [
          { text: 'Нерф', voter_count: voters },
          { text: 'Баф', voter_count: 0 }
        ]
      }
    });
    await deliver(poll('p1', 4));
    await deliver(poll('unknown', 9));
    clock.advance(2 * DAY);
    await deliver(poll('p1', 6, true));
    await deliver(poll('p1', 99));

    expect(await rows('SELECT poll_id, voters, voters_24h, voters_72h, closed FROM tg_polls')).toEqual([
      { poll_id: 'p1', voters: 6, voters_24h: 4, voters_72h: 6, closed: 1 }
    ]);
  });

  it('keeps a comment as a hashed author with sanitised text, once, and drops the owner and bots', async () => {
    await deliver(forward(500, 7));
    await deliver(comment(501, 500, 4242001, 'Ну и ‮имба​   же'));
    await deliver(comment(501, 500, 4242001, 'повтор того же апдейта'));
    await deliver(comment(502, 500, Number(OWNER_ID), 'я владелец'));

    const kept = await rows<{ author_key: string; username: string; text: string; channel_message_id: number }>(
      'SELECT author_key, username, text, channel_message_id FROM tg_comments'
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ username: 'vasya', text: 'Ну и имба же', channel_message_id: 7 });
    expect(kept[0]?.author_key).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(kept)).not.toContain('4242001');
    expect(JSON.stringify(kept)).not.toContain('Вася');
  });

  it('keeps no comment while AUDIENCE_HASH_KEY is not set', async () => {
    const keyless = build(undefined);
    await deliver(forward(600, 9), keyless);
    await deliver(comment(601, 600, 77, 'текст'), keyless);

    expect(await rows('SELECT message_id FROM tg_comments')).toEqual([]);
    expect(await rows('SELECT root_message_id FROM tg_comment_threads')).toEqual([{ root_message_id: 600 }]);
  });

  it('answers 200 and stays quiet on a database without migration 0118', async () => {
    await testDb().prepare('DROP TABLE tg_message_reactions').run();
    try {
      expect((await deliver(reactionUpdate(CHANNEL, 7, [1], 100))).status).toBe(200);
    } finally {
      await testDb()
        .prepare(
          `CREATE TABLE tg_message_reactions (chat_id INTEGER NOT NULL, message_id INTEGER NOT NULL,
             total INTEGER NOT NULL CHECK (total >= 0),
             kinds_json TEXT NOT NULL CHECK (json_valid(kinds_json) AND length(kinds_json) <= 2048),
             reported_at INTEGER NOT NULL, PRIMARY KEY (chat_id, message_id)) WITHOUT ROWID`
        )
        .run();
    }
  });
});

describe('retention', () => {
  it('freezes the counts at 73 h, then purges comments after 10 days and threads after 14', async () => {
    await deliver(forward(500, 7));
    await deliver(comment(501, 500, 1, 'раз'));
    await deliver(comment(502, 500, 2, 'два'));
    const repo = createD1AudienceRepository(testDb());

    expect(await purgeAudience({ repo, now: START + 74 * 3_600_000 })).toEqual({ frozen: 1, purged: 0 });
    expect(await rows('SELECT comments24, comments72, commenters72 FROM tg_post_audience')).toEqual([
      { comments24: 2, comments72: 2, commenters72: 2 }
    ]);
    expect((await purgeAudience({ repo, now: START + 11 * DAY })).purged).toBe(2);
    expect(await rows('SELECT message_id FROM tg_comments')).toEqual([]);
    expect((await purgeAudience({ repo, now: START + 15 * DAY })).purged).toBe(1);
    expect(await rows('SELECT comments72 FROM tg_post_audience')).toEqual([{ comments72: 2 }]);
  });
});

describe('setup check', () => {
  it('finds the channel, its discussion group and what the bot can see there', async () => {
    const repo = createD1AudienceRepository(testDb());
    const answers: Record<string, unknown> = {
      '-100555': { id: -100555, title: 'Канал', username: 'chan', linked_chat_id: -100666 },
      '-100666': { id: -100666, title: 'Чат канала' }
    };
    const chats = await checkAudienceSetup({
      repo,
      targets: { channels: async () => [{ chatId: '-100555', title: 'Канал' }] },
      telegram: {
        getChat: async (chatId) => answers[chatId],
        getChatMember: async (chatId) => ({ status: chatId === '-100555' ? 'administrator' : 'member' })
      },
      bot: { id: 123456, readsAllGroupMessages: false },
      now: START
    });

    expect(chats.map((each) => [each.chatId, each.role, each.botAdmin, each.seesAll])).toEqual([
      [-100555, 'channel', true, true],
      [-100666, 'group', false, false]
    ]);
    // The chats of the earlier setup are gone: only what was checked now stays.
    expect(await rows('SELECT chat_id FROM tg_chats ORDER BY chat_id')).toEqual([
      { chat_id: -100666 },
      { chat_id: -100555 }
    ]);
  });
});
