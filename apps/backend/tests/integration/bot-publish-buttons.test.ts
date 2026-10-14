import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBotAdminApi } from '../helpers/fake-bot-admin-api';
import { testDb } from '../helpers/db';
import {
  type Api,
  createApi,
  fakeClock,
  type FakeClock,
  OWNER_ID,
  OWNER_TOKEN,
  resetDb,
  seedSession
} from '../helpers/harness';
import { createContainer } from '../../src/app/container';
import { count, seedDestination, seedPublication } from '../helpers/publishing';

const SECRET = 'hook-secret-PLACEHOLDER';
const BOT_INFO = JSON.stringify({ id: 123456, is_bot: true, first_name: 'Bot', username: 'content_bot' });
const ORIGIN = 'https://studio.example.com';
const DAY_MS = 24 * 60 * 60 * 1000;

interface Call {
  method: string;
  body: {
    text?: string;
    reply_markup?: { inline_keyboard: { text: string; callback_data?: string; web_app?: { url: string } }[][] };
  };
}

let api: Api;
let clock: FakeClock;
let calls: Call[];
let updateId = 9000;

beforeEach(async () => {
  await resetDb();
  clock = fakeClock();
  api = createApi({ clock, botInfo: BOT_INFO, webhookSecret: SECRET, botAdminApi: fakeBotAdminApi() });
  await seedSession({ token: OWNER_TOKEN, createdAt: clock.now(), expiresAt: clock.now() + 10 * DAY_MS });
  calls = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const method =
      String(input instanceof Request ? input.url : input)
        .split('/')
        .pop() ?? '';
    calls.push({ method, body: JSON.parse(String(init?.body ?? '{}')) as Call['body'] });
    return Promise.resolve(Response.json({ ok: true, result: { message_id: 1 } }));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const deliver = (update: unknown) =>
  api.request(`${ORIGIN}/webhooks/telegram`, {
    method: 'POST',
    token: null,
    json: update,
    headers: { 'x-telegram-bot-api-secret-token': SECRET }
  });

const chat = (fromId: string) => ({ id: Number(fromId), type: 'private', first_name: 'X' });

async function sendText(text = 'Заголовок\nТекст поста') {
  await deliver({
    update_id: ++updateId,
    message: {
      message_id: 10,
      date: 1,
      chat: chat(OWNER_ID),
      from: { id: Number(OWNER_ID), is_bot: false, first_name: 'X' },
      text
    }
  });
  const reply = calls.filter((call) => call.method === 'sendMessage').at(-1);
  return reply?.body.reply_markup?.inline_keyboard.flat() ?? [];
}

const tap = (data: string, options: { fromId?: string; id?: number } = {}) => {
  const fromId = options.fromId ?? OWNER_ID;
  return deliver({
    update_id: options.id ?? ++updateId,
    callback_query: {
      id: `cb-${updateId}`,
      chat_instance: 'x',
      from: { id: Number(fromId), is_bot: false, first_name: 'X' },
      data,
      message: { message_id: 11, date: 1, chat: chat(fromId), text: 'Черновик создан' }
    }
  });
};

const edits = () => calls.filter((call) => call.method === 'editMessageText');
const lastEditText = () => edits().at(-1)?.body.text;
const publications = () => count('publications');
const postRow = () =>
  testDb().prepare('SELECT id, status, revision FROM posts').first<{ id: string; status: string; revision: number }>();

describe('publish buttons under a draft reply', () => {
  it('offers one button per enabled channel and a Studio button', async () => {
    await seedDestination(api, { title: 'Main channel' });
    await seedDestination(api, { title: 'Second' });
    const buttons = await sendText();
    const post = await postRow();
    expect(buttons.map((button) => button.text)).toEqual([
      'Опубликовать сейчас → Main channel',
      'Опубликовать сейчас → Second',
      'Открыть в Студии'
    ]);
    expect(buttons.at(-1)?.web_app?.url).toBe(`${ORIGIN}/posts/${post?.id}/publish`);
    for (const button of buttons.slice(0, -1)) {
      expect(new TextEncoder().encode(button.callback_data).length).toBeLessThanOrEqual(64);
    }
  });

  it('shows only the Studio button with more than three channels', async () => {
    for (const title of ['A', 'B', 'C', 'D']) await seedDestination(api, { title });
    const buttons = await sendText();
    expect(buttons.map((button) => button.text)).toEqual(['Открыть в Студии']);
    expect(await count('bot_publish_actions')).toBe(0);
  });

  it('shows only the Studio button without channels', async () => {
    expect((await sendText()).map((button) => button.text)).toEqual(['Открыть в Студии']);
  });
});

describe('tapping «publish now»', () => {
  async function prepared() {
    await seedDestination(api, { title: 'Main <channel>' });
    const [publish] = await sendText();
    return publish?.callback_data ?? '';
  }

  it('creates exactly one queued publication and never claims it was published', async () => {
    const data = await prepared();
    const response = await tap(data);
    expect(response.status).toBe(200);
    expect(await publications()).toBe(1);
    expect(await count('jobs')).toBe(1);
    expect(await postRow()).toMatchObject({ status: 'approved', revision: 1 });
    expect(lastEditText()).toBe('Поставлено в очередь: Main &lt;channel&gt;');
    expect(lastEditText()).not.toContain('Опубликовано');
    const order = calls.map((call) => call.method);
    expect(order.indexOf('answerCallbackQuery')).toBeLessThan(order.indexOf('editMessageText'));
    const keyboard = edits().at(-1)?.body.reply_markup?.inline_keyboard.flat();
    expect(keyboard?.map((button) => button.text)).toEqual(['Открыть в Студии']);
  });

  it('answers a repeated tap and a redelivered callback with the same single publication', async () => {
    const data = await prepared();
    await tap(data, { id: 1 });
    await tap(data, { id: 1 });
    await tap(data);
    await tap(data);
    expect(await publications()).toBe(1);
    expect(await count('jobs')).toBe(1);
    expect(edits().map((call) => call.body.text)).toEqual(Array(3).fill('Поставлено в очередь: Main &lt;channel&gt;'));
  });

  it('creates one publication for concurrent taps', async () => {
    const data = await prepared();
    await Promise.all(Array.from({ length: 6 }, () => tap(data)));
    expect(await publications()).toBe(1);
    expect(await count('jobs')).toBe(1);
    expect(await count('bot_publish_actions', "status = 'done'")).toBe(1);
    for (const edit of edits()) expect(edit.body.text).toBe('Поставлено в очередь: Main &lt;channel&gt;');
  });

  it('ignores a tap from anyone but the owner', async () => {
    const data = await prepared();
    calls.length = 0;
    await tap(data, { fromId: '777' });
    expect(calls).toEqual([]);
    expect(await publications()).toBe(0);
    expect(await postRow()).toMatchObject({ status: 'draft' });
  });

  it('creates nothing when the post changed after the button was made', async () => {
    const data = await prepared();
    const post = await postRow();
    const edited = await api.request(`/api/v1/posts/${post?.id}`, {
      method: 'PATCH',
      json: { revision: post?.revision, body: 'Другой текст', entities: [] }
    });
    expect(edited.status).toBe(200);
    await tap(data);
    expect(await publications()).toBe(0);
    expect(await postRow()).toMatchObject({ status: 'draft' });
    expect(lastEditText()).toBe('Пост изменился — откройте в Студии');
    expect(
      edits()
        .at(-1)
        ?.body.reply_markup?.inline_keyboard.flat()
        .map((b) => b.text)
    ).toEqual(['Открыть в Студии']);
    // The refusal is final: the same button never publishes later.
    await tap(data);
    expect(await publications()).toBe(0);
  });

  it('creates nothing when the channel was disabled meanwhile', async () => {
    const data = await prepared();
    const destination = await testDb()
      .prepare('SELECT id, revision FROM destinations')
      .first<{ id: string; revision: number }>();
    const response = await api.request(`/api/v1/destinations/${destination?.id}`, {
      method: 'PATCH',
      json: { revision: destination?.revision, enabled: false }
    });
    expect(response.status).toBe(200);
    await tap(data);
    expect(await publications()).toBe(0);
    expect(lastEditText()).toBe('Пост изменился — откройте в Студии');
  });

  it('continues when the owner approved the same revision in the Studio first', async () => {
    const data = await prepared();
    const post = await postRow();
    await api.request(`/api/v1/posts/${post?.id}/approve`, { method: 'POST', json: { revision: post?.revision } });
    await tap(data);
    expect(await publications()).toBe(1);
  });

  it('refuses an expired button', async () => {
    const data = await prepared();
    clock.advance(DAY_MS + 1);
    await tap(data);
    expect(await publications()).toBe(0);
    expect(lastEditText()).toBe('Кнопка устарела, откройте в Студии');
    expect(await postRow()).toMatchObject({ status: 'draft' });
  });

  it('treats an unknown token as an expired button', async () => {
    await prepared();
    await tap('pub:doesnotexist0000');
    expect(await publications()).toBe(0);
    expect(lastEditText()).toBe('Кнопка устарела, откройте в Студии');
  });

  it('refuses a tap while the post files are still being imported, then works after the report', async () => {
    const data = await prepared();
    const post = await postRow();
    const container = createContainer({ DB: testDb(), OWNER_TELEGRAM_ID: OWNER_ID }, { clock });
    await container.mediaImports.enqueue({
      postId: post?.id ?? '',
      file: { fileId: 'f1', uniqueId: 'u-f1', kind: 'photo', fileName: null, mimeType: 'image/jpeg', size: 29 },
      messageId: 1,
      caption: null,
      oversized: false,
      captionTooLong: false,
      now: clock.now()
    });
    await tap(data);
    expect(await publications()).toBe(0);
    expect(await postRow()).toMatchObject({ status: 'draft', revision: 0 });
    expect(lastEditText()).toBe('Файлы ещё загружаются — дождитесь отчёта или откройте в Студии');
    expect(
      edits()
        .at(-1)
        ?.body.reply_markup?.inline_keyboard.flat()
        .map((b) => b.text)
    ).toEqual(['Открыть в Студии']);
    // The tap consumed nothing: a later one still works after the schedule window of the first has passed.
    expect(await testDb().prepare('SELECT status, used_at FROM bot_publish_actions').first()).toMatchObject({
      status: 'pending',
      used_at: null
    });
    clock.advance(10 * 60_000);
    // The refusal is not final: once the import is reported the same button publishes.
    await testDb().prepare('UPDATE bot_media_imports SET reported_at = ?1').bind(clock.now()).run();
    await testDb().prepare("UPDATE bot_media_import_files SET status = 'done'").run();
    await tap(data);
    expect(await publications()).toBe(1);
  });

  it('reuses the token when the same report is sent twice, so one publication results', async () => {
    const first = await prepared();
    const post = await postRow();
    const container = createContainer({ DB: testDb(), OWNER_TELEGRAM_ID: OWNER_ID }, { clock });
    const again = await container.publishActions.create(
      [{ id: 'abcdef0123456789abcd', postId: post?.id ?? '', destinationId: await destinationId(), postRevision: 0 }],
      clock.now()
    );
    expect(again).toEqual([first.replace('pub:', '')]);
    expect(await count('bot_publish_actions')).toBe(1);
    await tap(first);
    await tap(`pub:${again[0]}`);
    expect(await publications()).toBe(1);
  });

  it('refuses when the post is already published or queued to that channel', async () => {
    const data = await prepared();
    const post = await postRow();
    const dest = await destinationId();
    await api.request(`/api/v1/posts/${post?.id}/approve`, { method: 'POST', json: { revision: post?.revision } });
    await seedPublication(api, {
      postId: post?.id ?? '',
      revision: 1,
      destinationId: dest,
      scheduledAt: new Date(clock.now() + 3_600_000).toISOString()
    });
    await tap(data);
    expect(await publications()).toBe(1);
    expect(lastEditText()).toBe('Уже в очереди или опубликовано в этом канале — откройте в Студии');
  });

  it('purges actions older than a day in bounded steps', async () => {
    await prepared();
    const container = createContainer({ DB: testDb(), OWNER_TELEGRAM_ID: OWNER_ID }, { clock });
    expect(await container.publishActions.purgeOlderThan(clock.now() - DAY_MS, 10)).toBe(0);
    expect(await container.publishActions.purgeOlderThan(clock.now() + DAY_MS, 10)).toBe(1);
    expect(await count('bot_publish_actions')).toBe(0);
  });
});

const destinationId = async () =>
  (await testDb().prepare('SELECT id FROM destinations').first<{ id: string }>())?.id ?? '';
