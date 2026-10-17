import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBotAdminApi } from '../helpers/fake-bot-admin-api';
import { testDb } from '../helpers/db';
import { type Api, createApi, fakeClock, OWNER_ID, resetDb, START } from '../helpers/harness';

const SECRET = 'hook-secret-PLACEHOLDER';
const BOT_INFO = JSON.stringify({ id: 123456, is_bot: true, first_name: 'Bot', username: 'content_bot' });
const ORIGIN = 'https://studio.example.com';
const GENERATION = '00000000-0000-4000-8000-0000000000d1';
const REVISION = '00000000-0000-4000-8000-0000000000c1';

type Button = { text: string; callback_data?: string };
interface Call {
  method: string;
  body: { text?: string; reply_markup?: { inline_keyboard: Button[][] } };
}

let api: Api;
let calls: Call[];
let updateId = 8000;

beforeEach(async () => {
  await resetDb();
  api = createApi({ clock: fakeClock(), botInfo: BOT_INFO, webhookSecret: SECRET, botAdminApi: fakeBotAdminApi() });
  await testDb().batch([
    testDb()
      .prepare(
        `INSERT INTO ai_generations (id, kind, format, mode, source, task, status, pack_revision, created_at, updated_at)
         VALUES (?, 'draft', 'igrat', 'direct', 'bot', 'задание', 'ready', 'pack', ?, ?)`
      )
      .bind(GENERATION, START, START),
    testDb()
      .prepare(
        `INSERT INTO ai_text_revisions (id, generation_id, provenance, text, created_at)
         VALUES (?, ?, 'AI_DRAFT', 'Текст черновика.', ?)`
      )
      .bind(REVISION, GENERATION, START)
  ]);
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

const tap = (action: string) =>
  api.request(`${ORIGIN}/webhooks/telegram`, {
    method: 'POST',
    token: null,
    headers: { 'x-telegram-bot-api-secret-token': SECRET },
    json: {
      update_id: ++updateId,
      callback_query: {
        id: `cb-${updateId}`,
        chat_instance: 'x',
        from: { id: Number(OWNER_ID), is_bot: false, first_name: 'X' },
        data: `ai:${GENERATION}:${action}`,
        message: {
          message_id: 21,
          date: 1,
          chat: { id: Number(OWNER_ID), type: 'private', first_name: 'X' },
          text: 'x'
        }
      }
    }
  });

const lastMarkup = () =>
  calls
    .filter((call) => call.method === 'editMessageReplyMarkup')
    .at(-1)
    ?.body.reply_markup?.inline_keyboard.flat()
    .map((button) => button.text);

describe('«Что не так?» under an AI draft', () => {
  it('opens the reasons, records the tapped one on the current text and brings the draft buttons back', async () => {
    await tap('why');
    expect(lastMarkup()).toEqual([
      'Тема повторяется',
      'Слабый хук',
      'Шутка не зашла',
      'Не мой стиль',
      'Слишком длинно',
      'Ошибка в фактах',
      'Не то задание',
      '← Назад'
    ]);

    await tap('r:hook');
    const rows = await testDb()
      .prepare('SELECT kind, revision_id AS revisionId FROM ai_feedback')
      .all<{ kind: string; revisionId: string }>();
    expect(rows.results).toEqual([{ kind: 'weak_hook', revisionId: REVISION }]);
    expect(calls.filter((call) => call.method === 'answerCallbackQuery').at(-1)?.body.text).toBe('Записал: слабый хук');
    expect(lastMarkup()).toContain('Что не так?');

    // «Назад» records nothing; the old «Шутка не зашла» button of earlier messages still works.
    await tap('back');
    await tap('joke');
    const kinds = await testDb().prepare('SELECT kind FROM ai_feedback ORDER BY kind').all<{ kind: string }>();
    expect(kinds.results.map((row) => row.kind)).toEqual(['joke_missed', 'weak_hook']);
  });
});
