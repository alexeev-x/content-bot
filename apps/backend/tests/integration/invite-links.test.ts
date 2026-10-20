import { inviteLinkSchema, inviteLinksSchema } from '@alexeev/contracts';
import { GrammyError } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelegramInviteLinkApi } from '../../src/integrations/telegram/telegram-api';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { type Api, createApi, fakeClock, OWNER_ID, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

// Plan B1 (owner 20.10.2026): named invite links into the analytics channel and the joins through them. A wrong
// count here sends the owner's money and effort to the wrong traffic source; a stranger's update must never reach
// the owner's commands.

const SECRET = 'hook-secret-PLACEHOLDER';
const BOT_INFO = JSON.stringify({ id: 123456, is_bot: true, first_name: 'Bot', username: 'content_bot' });
const ORIGIN = 'https://studio.example.com';
const CHANNEL = 'alexeev_x';

interface FakeInvites extends TelegramInviteLinkApi {
  created: { chatId: string; name: string }[];
  revoked: string[];
  refuse: boolean;
  /** The answer is lost (timeout, dropped connection): Telegram may still have made the link. */
  hang: boolean;
}

function fakeInvites(): FakeInvites {
  let next = 0;
  const fake: FakeInvites = {
    created: [],
    revoked: [],
    refuse: false,
    hang: false,
    createChatInviteLink(chatId, name) {
      // A lost answer (a timeout, a dropped connection): Telegram may have made the link anyway.
      if (fake.hang) return Promise.reject(new Error('connection reset'));
      if (fake.refuse) {
        return Promise.reject(
          new GrammyError(
            'Call to createChatInviteLink failed',
            { ok: false, error_code: 400, description: 'Bad Request: not enough rights to manage chat invite links' },
            'createChatInviteLink',
            {}
          )
        );
      }
      fake.created.push({ chatId, name });
      next += 1;
      return Promise.resolve({
        invite_link: `https://t.me/+link${next}`,
        name,
        creator: {},
        creates_join_request: false
      });
    },
    revokeChatInviteLink(_chatId, inviteLink) {
      fake.revoked.push(inviteLink);
      return Promise.resolve({ invite_link: inviteLink, is_revoked: true });
    }
  };
  return fake;
}

let api: Api;
let invites: FakeInvites;
let replies: unknown[];
let updateId = 5000;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN });
  invites = fakeInvites();
  api = createApi({
    clock: fakeClock(),
    botInfo: BOT_INFO,
    webhookSecret: SECRET,
    inviteLinkApi: invites,
    env: { ANALYTICS_TELEGRAM_CHANNEL: CHANNEL }
  });
  replies = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
    replies.push(JSON.parse(String(init?.body ?? '{}')));
    return Promise.resolve(Response.json({ ok: true, result: true }));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const create = (name: string) =>
  api.request('/api/v1/content-analytics/invite-links', { method: 'POST', json: { name } });

async function list(days = 30) {
  const response = await api.request(`/api/v1/content-analytics/invite-links?days=${days}`);
  expect(response.status).toBe(200);
  return inviteLinksSchema.parse(await response.json());
}

type Status = 'member' | 'left' | 'kicked' | 'administrator';
function memberUpdate(input: {
  userId: number;
  from: Status;
  to: Status;
  link?: string;
  chat?: string;
  isBot?: boolean;
  id?: number;
  at?: number;
}) {
  const user = { id: input.userId, is_bot: input.isBot ?? false, first_name: 'S' };
  return {
    update_id: input.id ?? ++updateId,
    chat_member: {
      chat: { id: -1001, type: 'channel', title: 'C', username: input.chat ?? CHANNEL },
      from: user,
      date: Math.floor((input.at ?? START) / 1000),
      old_chat_member: { status: input.from, user },
      new_chat_member: { status: input.to, user },
      ...(input.link === undefined
        ? {}
        : {
            invite_link: {
              invite_link: input.link,
              creator: { id: 123456, is_bot: true, first_name: 'Bot' },
              creates_join_request: false,
              is_primary: false,
              is_revoked: false
            }
          })
    }
  };
}

const deliver = (update: unknown) =>
  api.request(`${ORIGIN}/webhooks/telegram`, {
    method: 'POST',
    token: null,
    json: update,
    headers: { 'x-telegram-bot-api-secret-token': SECRET }
  });

describe('invite links', () => {
  it('creates a named link in the channel, and a repeat with the same name never makes a second one', async () => {
    const created = await create('TikTok — шапка');
    expect(created.status).toBe(201);
    const link = inviteLinkSchema.parse(await created.json());
    expect(link).toMatchObject({ name: 'TikTok — шапка', url: 'https://t.me/+link1', joined: 0, left: 0 });
    expect(invites.created).toEqual([{ chatId: `@${CHANNEL}`, name: 'TikTok — шапка' }]);

    await expectError(await create('TikTok — шапка'), 400, 'VALIDATION_ERROR', { reason: 'NAME_TAKEN' });
    expect(invites.created).toHaveLength(1);
    expect((await list()).links.map((item) => item.name)).toEqual(['TikTok — шапка']);
  });

  it('says the bot cannot invite when Telegram refuses, and frees the name for the next try', async () => {
    invites.refuse = true;
    await expectError(await create('YouTube'), 503, 'UNAVAILABLE', { reason: 'BOT_CANNOT_INVITE' });
    expect((await list()).links).toEqual([]);

    invites.refuse = false;
    expect((await create('YouTube')).status).toBe(201);
  });

  it('holds the name after a timeout, so a quick retry cannot make a second link Telegram may already have', async () => {
    invites.hang = true;
    await expectError(await create('YouTube'), 503, 'UNAVAILABLE');
    invites.hang = false;
    await expectError(await create('YouTube'), 400, 'VALIDATION_ERROR', { reason: 'NAME_TAKEN' });
    expect(invites.created).toEqual([]);
  });

  it('needs the analytics channel to be set', async () => {
    api = createApi({ clock: fakeClock(), inviteLinkApi: invites });
    await expectError(await create('YouTube'), 503, 'UNAVAILABLE', { reason: 'CHANNEL_NOT_CONFIGURED' });
    expect(invites.created).toEqual([]);
  });

  it('revokes a link in Telegram once, keeps it in the list with its joins, and is safe to repeat', async () => {
    const link = inviteLinkSchema.parse(await (await create('Реклама 1')).json());
    expect((await deliver(memberUpdate({ userId: 7, from: 'left', to: 'member', link: link.url }))).status).toBe(200);

    const first = await api.request(`/api/v1/content-analytics/invite-links/${link.id}/revoke`, { method: 'POST' });
    expect(first.status).toBe(200);
    expect(inviteLinkSchema.parse(await first.json()).revokedAt).not.toBeNull();
    const again = await api.request(`/api/v1/content-analytics/invite-links/${link.id}/revoke`, { method: 'POST' });
    expect(again.status).toBe(200);
    expect(invites.revoked).toEqual([link.url]);

    const [listed] = (await list()).links;
    expect(listed).toMatchObject({ id: link.id, joined: 1, left: 0 });
    expect(listed?.revokedAt).not.toBeNull();

    // A revoked name can be used again.
    expect((await create('Реклама 1')).status).toBe(201);
  });

  it('answers 404 for an unknown link', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';
    const response = await api.request(`/api/v1/content-analytics/invite-links/${unknown}/revoke`, { method: 'POST' });
    await expectError(response, 404, 'NOT_FOUND');
  });
});

describe('joins and leaves from chat_member updates', () => {
  it('counts joins per link and without a link, and who of them left', async () => {
    const tiktok = inviteLinkSchema.parse(await (await create('TikTok')).json());
    const youtube = inviteLinkSchema.parse(await (await create('YouTube')).json());

    await deliver(memberUpdate({ userId: 1, from: 'left', to: 'member', link: tiktok.url }));
    await deliver(memberUpdate({ userId: 2, from: 'left', to: 'member', link: tiktok.url }));
    await deliver(memberUpdate({ userId: 3, from: 'left', to: 'member', link: youtube.url }));
    await deliver(memberUpdate({ userId: 4, from: 'left', to: 'member' }));
    // A link the studio did not create counts as «без ссылки».
    await deliver(memberUpdate({ userId: 5, from: 'left', to: 'member', link: 'https://t.me/+someoneElse' }));
    await deliver(memberUpdate({ userId: 2, from: 'member', to: 'left' }));
    // A promotion to admin is neither a join nor a leave.
    await deliver(memberUpdate({ userId: 3, from: 'member', to: 'administrator' }));

    const result = await list();
    expect(result.links.map(({ name, joined, left }) => ({ name, joined, left }))).toEqual([
      { name: 'YouTube', joined: 1, left: 0 },
      { name: 'TikTok', joined: 2, left: 1 }
    ]);
    expect(result.withoutLink).toEqual({ joined: 2, left: 0 });
    expect(result.trackingSince).toBe(new Date(START).toISOString());
    expect(result.channel).toBe(CHANNEL);
    // Joins are never answered.
    expect(replies).toEqual([]);
  });

  it('counts a redelivered update once', async () => {
    const update = memberUpdate({ userId: 9, from: 'left', to: 'member', id: 777 });
    await deliver(update);
    await deliver(update);
    expect((await list()).withoutLink).toEqual({ joined: 1, left: 0 });
  });

  it('stores nothing at all for another chat, not even the update id', async () => {
    await deliver(memberUpdate({ userId: 13, from: 'left', to: 'member', chat: 'someone_else' }));
    const seen = await testDb().prepare('SELECT COUNT(*) AS n FROM webhook_updates').first<{ n: number }>();
    expect(seen?.n).toBe(0);
  });

  it('ignores another chat, bots, and joins outside the period', async () => {
    await deliver(memberUpdate({ userId: 10, from: 'left', to: 'member', chat: 'someone_else' }));
    await deliver(memberUpdate({ userId: 11, from: 'left', to: 'member', isBot: true }));
    await deliver(memberUpdate({ userId: 12, from: 'left', to: 'member', at: START - 40 * 24 * 60 * 60_000 }));
    expect((await list(30)).withoutLink).toEqual({ joined: 0, left: 0 });
    expect((await list(90)).withoutLink).toEqual({ joined: 1, left: 0 });
  });

  it('never runs an owner command for a subscriber, even one with the owner id in another chat', async () => {
    const response = await deliver(memberUpdate({ userId: Number(OWNER_ID), from: 'left', to: 'member' }));
    expect(response.status).toBe(200);
    expect(replies).toEqual([]);
    const rows = await testDb().prepare('SELECT COUNT(*) AS n FROM channel_joins').first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });
});
