import { apiErrorSchema, destinationCheckSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { expectError } from '../helpers/expect-error';
import { apiError, BOT_ID, channelChat, type FakeChatApi, fakeChatApi, networkError } from '../helpers/fake-chat-api';
import { type Api, createApi, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { seedDestination } from '../helpers/publishing';

let api: Api;
let telegram: FakeChatApi;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 7 * 24 * 60 * 60 * 1000 });
});

function use(script: Parameters<typeof fakeChatApi>[0], options: Parameters<typeof createApi>[0] = {}): void {
  telegram = fakeChatApi(script);
  api = createApi({ ...options, chatApi: telegram });
}

const check = (json: unknown = { chatId: '@dev_news' }, token: string | null = OWNER_TOKEN) =>
  api.request('/api/v1/destinations/check', { method: 'POST', json, token });

async function parsed(response: Response) {
  expect(response.status).toBe(200);
  return destinationCheckSchema.parse(await response.json());
}

describe('POST /api/v1/destinations/check', () => {
  it('reports a channel where the bot is an administrator with the post right', async () => {
    use({ chat: channelChat(), member: { status: 'administrator', can_post_messages: true } });

    expect(await parsed(await check())).toEqual({
      chatId: '-1001234567890',
      username: 'dev_news',
      title: 'Dev news',
      kind: 'channel',
      botCanPost: true,
      problem: null,
      alreadyAddedId: null
    });
    expect(telegram.calls).toEqual(['getChat @dev_news', 'getMe', `getChatMember -1001234567890 ${BOT_ID}`]);
  });

  it('treats the channel creator as able to post', async () => {
    use({ chat: channelChat(), member: { status: 'creator' } });
    expect(await parsed(await check())).toMatchObject({ botCanPost: true, problem: null });
  });

  it('reports BOT_NOT_ADMIN for a channel where the bot is a plain member', async () => {
    use({ chat: channelChat(), member: { status: 'member' } });
    expect(await parsed(await check())).toMatchObject({ botCanPost: false, problem: 'BOT_NOT_ADMIN' });
  });

  it('reports BOT_CANNOT_POST for an administrator without can_post_messages', async () => {
    use({ chat: channelChat(), member: { status: 'administrator', can_post_messages: false } });
    expect(await parsed(await check())).toMatchObject({ botCanPost: false, problem: 'BOT_CANNOT_POST' });
  });

  it.each(['left', 'kicked'])('reports BOT_NOT_MEMBER when the bot status is %s', async (status) => {
    use({ chat: channelChat(), member: { status } });
    expect(await parsed(await check())).toMatchObject({ botCanPost: false, problem: 'BOT_NOT_MEMBER' });
  });

  it('accepts a supergroup member as a group the bot can post to, without a username', async () => {
    use({
      chat: { id: -1009876543210, type: 'supergroup', title: 'Chat', permissions: { can_send_messages: true } },
      member: { status: 'member' }
    });

    expect(await parsed(await check({ chatId: '-1009876543210' }))).toEqual({
      chatId: '-1009876543210',
      username: null,
      title: 'Chat',
      kind: 'group',
      botCanPost: true,
      problem: null,
      alreadyAddedId: null
    });
  });

  it('reports BOT_CANNOT_POST for a group whose members are muted by default', async () => {
    use({
      chat: { id: -4001, type: 'group', title: 'Quiet', permissions: { can_send_messages: false } },
      member: { status: 'member' }
    });
    expect(await parsed(await check({ chatId: '-4001' }))).toMatchObject({ kind: 'group', problem: 'BOT_CANNOT_POST' });
  });

  it('reports BOT_CANNOT_POST for a restricted group member', async () => {
    use({
      chat: { id: -4002, type: 'group', title: 'Restricted' },
      member: { status: 'restricted', can_send_messages: false, is_member: true }
    });
    expect(await parsed(await check({ chatId: '-4002' }))).toMatchObject({ problem: 'BOT_CANNOT_POST' });
  });

  it('skips getMe when BOT_INFO carries the bot id (two subrequests)', async () => {
    use({ chat: channelChat() }, { botInfo: JSON.stringify({ id: 4321, is_bot: true, username: 'content_bot' }) });

    await parsed(await check());

    expect(telegram.calls).toEqual(['getChat @dev_news', 'getChatMember -1001234567890 4321']);
  });

  it('falls back to getMe when BOT_INFO is not usable', async () => {
    use({ chat: channelChat() }, { botInfo: '{oops' });

    await parsed(await check());

    expect(telegram.calls).toHaveLength(3);
  });

  it('answers 400 NOT_A_CHANNEL_OR_GROUP for a private chat and asks nothing more', async () => {
    use({ chat: { id: 5, type: 'private', first_name: 'Ann', username: 'ann_user' } });

    await expectError(await check({ chatId: '@ann_user' }), 400, 'VALIDATION_ERROR', {
      reason: 'NOT_A_CHANNEL_OR_GROUP'
    });
    expect(telegram.calls).toEqual(['getChat @ann_user']);
  });

  it.each([
    ['400 chat not found', () => apiError(400, 'Bad Request: chat not found')],
    ['403 bot was kicked', () => apiError(403, 'Forbidden: bot was kicked from the channel chat')]
  ])('answers 404 CHAT_NOT_FOUND on Telegram %s', async (_name, chat) => {
    use({
      chat: () => {
        throw chat();
      }
    });

    await expectError(await check(), 404, 'NOT_FOUND', { reason: 'CHAT_NOT_FOUND' });
    expect(telegram.calls).toEqual(['getChat @dev_news']);
  });

  it('answers 404 CHAT_NOT_FOUND when getChatMember is refused with 403', async () => {
    use({
      chat: channelChat(),
      member: () => {
        throw apiError(403, 'Forbidden: bot is not a member of the channel chat');
      }
    });
    await expectError(await check(), 404, 'NOT_FOUND', { reason: 'CHAT_NOT_FOUND' });
  });

  it('answers 503 UNAVAILABLE when the request times out', async () => {
    use({
      chat: () => {
        throw new DOMException('The operation timed out', 'TimeoutError');
      }
    });
    await expectError(await check(), 503, 'UNAVAILABLE');
  });

  it.each([
    ['a network failure', () => networkError()],
    ['a 5xx', () => apiError(502, 'Bad Gateway')],
    ['a bad bot token (401)', () => apiError(401, 'Unauthorized')],
    ['a malformed token path (404)', () => apiError(404, 'Not Found')]
  ])('answers 503 UNAVAILABLE (never 401) on %s', async (_name, failure) => {
    use({
      chat: () => {
        throw failure();
      }
    });
    await expectError(await check(), 503, 'UNAVAILABLE');
  });

  it('answers 503 when Telegram answers in an unexpected shape', async () => {
    use({ chat: { nope: true } });
    await expectError(await check(), 503, 'UNAVAILABLE');
    use({ chat: channelChat(), member: { status: 'something_new' } });
    await expectError(await check(), 503, 'UNAVAILABLE');
  });

  it('answers 429 RATE_LIMIT with Retry-After from Telegram', async () => {
    use({
      chat: () => {
        throw apiError(429, 'Too Many Requests: retry after 7', { retry_after: 7 });
      }
    });

    const response = await check();

    await expectError(response, 429, 'RATE_LIMIT');
    expect(response.headers.get('retry-after')).toBe('7');
  });

  it('answers 503 without calling Telegram when the bot token is missing', async () => {
    api = createApi({ botToken: null });
    await expectError(await check(), 503, 'UNAVAILABLE');
  });

  it('answers 503 when the bot token is only whitespace', async () => {
    api = createApi({ botToken: '  \n' });
    await expectError(await check(), 503, 'UNAVAILABLE');
  });

  it('returns the destination id when the numeric chat id is already added', async () => {
    use({ chat: channelChat() });
    const saved = await seedDestination(api, { chatId: '-1001234567890' });

    expect(await parsed(await check())).toMatchObject({ alreadyAddedId: saved.id });
  });

  it('returns the destination id when the @username is already added, in any letter case', async () => {
    use({ chat: channelChat() });
    const saved = await seedDestination(api, { chatId: '@Dev_News' });

    expect(await parsed(await check({ chatId: '-1001234567890' }))).toMatchObject({ alreadyAddedId: saved.id });
  });

  it('does not match a different chat', async () => {
    use({ chat: channelChat() });
    await seedDestination(api, { chatId: '-1009999999999' });
    await seedDestination(api, { chatId: '@other_channel' });

    expect(await parsed(await check())).toMatchObject({ alreadyAddedId: null });
  });

  it('stores nothing', async () => {
    use({ chat: channelChat() });
    await check();
    const rows = await api.request('/api/v1/destinations');
    expect(await rows.json()).toMatchObject({ items: [] });
  });

  it('rejects unknown fields, a malformed chat id and an oversized body without calling Telegram', async () => {
    use({ chat: channelChat() });

    await expectError(await check({ chatId: '@dev_news', extra: 1 }), 400, 'VALIDATION_ERROR');
    await expectError(await check({ chatId: 'not a chat' }), 400, 'VALIDATION_ERROR');
    await expectError(await check({}), 400, 'VALIDATION_ERROR');
    const large = await check({ chatId: '@dev_news', pad: 'x'.repeat(9 * 1024) });
    expect(large.status).toBe(413);
    expect(apiErrorSchema.parse(await large.json()).error.code).toBe('VALIDATION_ERROR');
    expect(telegram.calls).toEqual([]);
  });

  it('requires a session', async () => {
    use({ chat: channelChat() });
    await expectError(await check(undefined, null), 401, 'UNAUTHORIZED');
    expect(telegram.calls).toEqual([]);
  });

  it('refuses a session of someone who is not the owner', async () => {
    use({ chat: channelChat() }, { ownerTelegramId: '9999' });

    await expectError(await check(), 403, 'FORBIDDEN');
    expect(telegram.calls).toEqual([]);
  });

  it('allows 20 checks per client in 10 minutes, then answers 429 with Retry-After, before any Telegram call', async () => {
    use({ chat: channelChat() });
    for (let i = 0; i < 20; i += 1) expect((await check()).status).toBe(200);
    const callsBefore = telegram.calls.length;

    const limited = await check();

    await expectError(limited, 429, 'RATE_LIMIT');
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(telegram.calls).toHaveLength(callsBefore);
  });

  it('keeps its bucket apart from other endpoints', async () => {
    use({ chat: channelChat() });
    for (let i = 0; i < 20; i += 1) await check();
    expect((await api.request('/api/v1/destinations')).status).toBe(200);
  });
});
