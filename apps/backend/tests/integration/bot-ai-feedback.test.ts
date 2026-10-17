import { aiFeedbackListSchema, apiErrorSchema } from '@alexeev/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBotAdminApi } from '../helpers/fake-bot-admin-api';
import { testDb } from '../helpers/db';
import { type Api, createApi, fakeClock, OWNER_ID, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

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
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 86_400_000 });
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

describe('/api/v1/ai/feedback', () => {
  it('lists the recorded verdicts with the draft and lets the owner take one back, safely repeated', async () => {
    await tap('r:hook');
    const list = aiFeedbackListSchema.parse(await (await api.request('/api/v1/ai/feedback')).json());
    expect(list.items).toEqual([
      expect.objectContaining({ kind: 'weak_hook', format: 'igrat', task: 'задание', text: 'Текст черновика.' })
    ]);
    const id = list.items[0]?.id ?? '';
    for (let n = 0; n < 2; n += 1) {
      expect((await api.request(`/api/v1/ai/feedback/${id}`, { method: 'DELETE' })).status).toBe(204);
    }
    expect(aiFeedbackListSchema.parse(await (await api.request('/api/v1/ai/feedback')).json()).items).toEqual([]);
    const bad = await api.request('/api/v1/ai/feedback/not-an-id', { method: 'DELETE' });
    expect(bad.status).toBe(400);
    expect(apiErrorSchema.parse(await bad.json()).error.code).toBe('VALIDATION_ERROR');
  });
});

const say = (text: string, replyTo?: number) =>
  api.request(`${ORIGIN}/webhooks/telegram`, {
    method: 'POST',
    token: null,
    headers: { 'x-telegram-bot-api-secret-token': SECRET },
    json: {
      update_id: ++updateId,
      message: {
        message_id: updateId,
        date: 1,
        chat: { id: Number(OWNER_ID), type: 'private', first_name: 'X' },
        from: { id: Number(OWNER_ID), is_bot: false, first_name: 'X' },
        text,
        ...(replyTo === undefined
          ? {}
          : {
              reply_to_message: {
                message_id: replyTo,
                date: 1,
                chat: { id: Number(OWNER_ID), type: 'private', first_name: 'X' },
                from: { id: 123456, is_bot: true, first_name: 'Bot' },
                text: 'черновик'
              }
            })
      }
    }
  });

const edits = () =>
  testDb()
    .prepare("SELECT text FROM ai_text_revisions WHERE provenance = 'OWNER_EDITED' ORDER BY text")
    .all<{ text: string }>()
    .then((rows) => rows.results.map((row) => row.text));
const sent = () => calls.filter((call) => call.method === 'sendMessage').map((call) => call.body.text ?? '');

describe('«✏️ Изменить» under an AI draft', () => {
  it('takes the next plain message as the edit, once; «Отмена» stops waiting; a reply still works', async () => {
    await tap('edit');
    expect(sent().at(-1)).toContain('Пришлите свою версию следующим сообщением');
    expect(sent().at(-1)).toContain('Текст черновика.');

    await say('Моя версия текста.');
    expect(await edits()).toEqual(['Моя версия текста.']);
    expect(sent().at(-1)).toBe('Сохранил вашу версию. Одобрить её?');

    // One message only: the next one is not an edit, and no /redactor chat was left open (no paid model call).
    await say('А это уже просто вопрос.');
    expect(await edits()).toEqual(['Моя версия текста.']);
    expect(sent()).not.toContain('Думаю…');
    expect(await testDb().prepare('SELECT COUNT(*) AS n FROM ai_writer_requests').first('n')).toBe(0);

    await tap('edit');
    await tap('noedit');
    await say('После отмены не правка.');
    expect(await edits()).toEqual(['Моя версия текста.']);
    expect(sent()).not.toContain('Думаю…');
    expect(await testDb().prepare('SELECT COUNT(*) AS n FROM ai_writer_requests').first('n')).toBe(0);

    // The reply to the draft message keeps working.
    await testDb().prepare('UPDATE ai_generations SET chat_message_id = 77 WHERE id = ?').bind(GENERATION).run();
    await say('Версия ответом.', 77);
    expect(await edits()).toEqual(['Версия ответом.', 'Моя версия текста.']);
  });
});
