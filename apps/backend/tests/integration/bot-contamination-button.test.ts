import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBotAdminApi } from '../helpers/fake-bot-admin-api';
import { testDb } from '../helpers/db';
import { type Api, createApi, fakeClock, OWNER_ID, resetDb, START } from '../helpers/harness';

const SECRET = 'hook-secret-PLACEHOLDER';
const BOT_INFO = JSON.stringify({ id: 123456, is_bot: true, first_name: 'Bot', username: 'content_bot' });
const ORIGIN = 'https://studio.example.com';
const ITEM = 'tiktok:7696861824037227809';
const DATA = `cc:r:${ITEM}`;

interface Call {
  method: string;
  body: { text?: string; reply_markup?: { inline_keyboard: unknown[][] } };
}

let api: Api;
let calls: Call[];
let updateId = 7000;

beforeEach(async () => {
  await resetDb();
  api = createApi({ clock: fakeClock(), botInfo: BOT_INFO, webhookSecret: SECRET, botAdminApi: fakeBotAdminApi() });
  await testDb()
    .prepare(
      `INSERT INTO content_items (id, platform, title, url, published_at, views, observed_at)
       VALUES (?, 'tiktok', 'ролик', 'https://example.com/v', ?, 500, ?)`
    )
    .bind(ITEM, START - 86_400_000, START)
    .run();
  calls = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const method =
      String(input instanceof Request ? input.url : input)
        .split('/')
        .pop() ?? '';
    calls.push({ method, body: JSON.parse(String(init?.body ?? '{}')) as Call['body'] });
    return Promise.resolve(Response.json({ ok: true, result: true }));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const KEYBOARD = [
  [{ text: 'Ограничение подтвердилось', callback_data: DATA }],
  [{ text: 'Открыть в студии', web_app: { url: `${ORIGIN}/analytics` } }]
];

const tap = (data: string, fromId = OWNER_ID) =>
  api.request(`${ORIGIN}/webhooks/telegram`, {
    method: 'POST',
    token: null,
    headers: { 'x-telegram-bot-api-secret-token': SECRET },
    json: {
      update_id: ++updateId,
      callback_query: {
        id: `cb-${updateId}`,
        chat_instance: 'x',
        from: { id: Number(fromId), is_bot: false, first_name: 'X' },
        data,
        message: {
          message_id: 11,
          date: 1,
          chat: { id: Number(fromId), type: 'private', first_name: 'X' },
          text: 'Ролик перестал набирать',
          reply_markup: { inline_keyboard: KEYBOARD }
        }
      }
    }
  });

const mark = () =>
  testDb().prepare('SELECT reason FROM content_item_contamination WHERE item_id = ?').bind(ITEM).first('reason');
const answers = () => calls.filter((call) => call.method === 'answerCallbackQuery').map((call) => call.body.text);

describe('«Ограничение подтвердилось» under an alert', () => {
  it("marks the video on the owner's tap, drops the button, and stays safe to repeat", async () => {
    expect((await tap(DATA)).status).toBe(200);
    expect(await mark()).toBe('restricted');
    expect(answers()).toEqual(['Отмечено: ролик больше не входит в сравнения других роликов.']);
    expect(calls.find((call) => call.method === 'editMessageReplyMarkup')?.body.reply_markup).toEqual({
      inline_keyboard: [KEYBOARD[1]]
    });

    await tap(DATA);
    expect(await mark()).toBe('restricted');
  });

  it('ignores a stranger, and answers an unknown item or a malformed button without marking', async () => {
    await tap(DATA, '777');
    expect(calls).toEqual([]);
    expect(await mark()).toBeNull();

    await tap('cc:d:tiktok:404');
    await tap('cc:r:not an id');
    expect(answers()).toEqual([
      'Ролик не найден в аналитике — откройте в Студии',
      'Кнопка устарела, откройте в Студии'
    ]);
    expect(calls.some((call) => call.method === 'editMessageReplyMarkup')).toBe(false);
    expect(await testDb().prepare('SELECT COUNT(*) AS n FROM content_item_contamination').first('n')).toBe(0);
  });
});
