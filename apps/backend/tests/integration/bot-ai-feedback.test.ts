import { aiFeedbackListSchema, apiErrorSchema } from '@alexeev/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createD1WriterRepository } from '../../src/modules/ai';
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

const tapData = (data: string) =>
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
        data,
        message: {
          message_id: 21,
          date: 1,
          chat: { id: Number(OWNER_ID), type: 'private', first_name: 'X' },
          text: 'x'
        }
      }
    }
  });
const tap = async (action: string) => {
  const guarded =
    action === 'why' || action === 'back' || action === 'joke' || action.startsWith('r:') || /^h[0-2]$/.test(action);
  const revision = guarded
    ? await testDb()
        .prepare(
          'SELECT id FROM ai_text_revisions WHERE generation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'
        )
        .bind(GENERATION)
        .first<{ id: string }>()
    : null;
  return tapData(`ai:${GENERATION}:${action}${guarded ? `:${revision?.id.slice(-12)}` : ''}`);
};

const lastMarkup = () =>
  calls
    .filter((call) => call.method === 'editMessageReplyMarkup')
    .at(-1)
    ?.body.reply_markup?.inline_keyboard.flat()
    .map((button) => button.text);

describe('«Что не так?» under an AI draft', () => {
  it('an old cancel button cannot clear a newer draft edit wait', async () => {
    const newer = '00000000-0000-4000-8000-0000000000d2';
    await testDb()
      .prepare(
        `INSERT INTO ai_generations (id, kind, format, mode, source, task, status, pack_revision, created_at, updated_at)
         VALUES (?, 'draft', 'igrat', 'direct', 'bot', 'другое задание', 'ready', 'pack', ?, ?)`
      )
      .bind(newer, START, START)
      .run();
    await createD1WriterRepository(testDb()).setEditing({
      chatId: Number(OWNER_ID),
      generationId: newer,
      now: START,
      expiresAt: START + 60_000
    });

    expect((await tap('noedit')).status).toBe(200);
    const row = await testDb()
      .prepare('SELECT editing_generation_id AS editing FROM ai_writer_requests WHERE chat_id = ?')
      .bind(Number(OWNER_ID))
      .first<{ editing: string | null }>();
    expect(row?.editing).toBe(newer);
  });

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
  it('ignores old hook and feedback buttons after the owner edits the draft', async () => {
    await testDb()
      .prepare('UPDATE ai_generations SET hooks = ? WHERE id = ?')
      .bind(JSON.stringify(['Новый хук']), GENERATION)
      .run();
    await tap('edit');
    await say('Мой окончательный текст.');
    const staleToken = REVISION.slice(-12);
    expect((await tapData(`ai:${GENERATION}:h0:${staleToken}`)).status).toBe(200);
    expect((await tapData(`ai:${GENERATION}:r:hook:${staleToken}`)).status).toBe(200);
    const sentBeforeRewrite = sent().length;
    expect((await tapData(`ai:${GENERATION}:more:${staleToken}`)).status).toBe(200);
    expect(sent()).toHaveLength(sentBeforeRewrite);
    expect((await tapData(`ai:${GENERATION}:h0`)).status).toBe(200);
    const rows = await testDb()
      .prepare('SELECT provenance, text FROM ai_text_revisions WHERE generation_id = ? ORDER BY created_at, rowid')
      .bind(GENERATION)
      .all<{ provenance: string; text: string }>();
    expect(rows.results).toEqual([
      { provenance: 'AI_DRAFT', text: 'Текст черновика.' },
      { provenance: 'OWNER_EDITED', text: 'Мой окончательный текст.' }
    ]);
    expect(await testDb().prepare('SELECT COUNT(*) AS n FROM ai_feedback').first<{ n: number }>()).toEqual({ n: 0 });
  });

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

  it('approves the owner-edited text once and rejects a later edit', async () => {
    await tap('edit');
    await say('Исправленный хук. Остальное без изменений.');
    await tap('ok');
    await tap('ok');
    const approved = await testDb()
      .prepare("SELECT text FROM ai_text_revisions WHERE generation_id = ? AND provenance = 'OWNER_APPROVED'")
      .bind(GENERATION)
      .all<{ text: string }>();
    expect(approved.results).toEqual([{ text: 'Исправленный хук. Остальное без изменений.' }]);
    const sentBeforeStaleTap = sent().length;
    await tap('edit');
    expect(sent()).toHaveLength(sentBeforeStaleTap);
    await say('Поздняя правка.');
    expect(await edits()).toEqual(['Исправленный хук. Остальное без изменений.']);
  });
});

const noteOf = () =>
  testDb()
    .prepare('SELECT note FROM ai_feedback')
    .all<{ note: string | null }>()
    .then((rows) => rows.results.map((row) => row.note));
const waiting = () =>
  testDb().prepare('SELECT noting_feedback_id AS n, editing_generation_id AS e FROM ai_writer_requests').first<{
    n: string | null;
    e: string | null;
  }>();

describe('the note after a «Что не так?» reason', () => {
  it('stores the next plain message as the note, once, and shows it in the verdict list', async () => {
    await tap('r:hook');
    expect(sent().at(-1)).toContain('Следующее сообщение станет пояснением');
    expect(await waiting()).toMatchObject({ n: expect.any(String), e: null });

    // A command is not the note, and nothing goes to the paid model while a note is awaited.
    await say('/unknowncmd');
    expect(await noteOf()).toEqual([null]);
    expect(sent()).not.toContain('Думаю…');

    // A reply to the bot's prompt is the natural way to answer it: it is the note.
    await say('  Хук слабый: нет интриги.  ', 777);
    expect(sent()).not.toContain('Думаю…');
    expect(await noteOf()).toEqual(['Хук слабый: нет интриги.']);
    expect(sent().at(-1)).toBe('Записал пояснение.');
    expect(await testDb().prepare('SELECT COUNT(*) AS n FROM ai_writer_requests').first('n')).toBe(0);

    await say('Это уже не пояснение.');
    expect(await noteOf()).toEqual(['Хук слабый: нет интриги.']);

    const list = aiFeedbackListSchema.parse(await (await api.request('/api/v1/ai/feedback')).json());
    expect(list.items[0]?.note).toBe('Хук слабый: нет интриги.');
  });

  it('refuses a note over 500 characters but keeps waiting; «Без пояснения» stops waiting', async () => {
    await tap('r:hook');
    await say('я'.repeat(501));
    expect(await noteOf()).toEqual([null]);
    expect(await waiting()).toMatchObject({ n: expect.any(String) });
    await say('Коротко.');
    expect(await noteOf()).toEqual(['Коротко.']);

    await tap('r:style');
    const current = await waiting();
    await tapData(`ai:nonote:${current?.n}`);
    await say('Уже не пояснение.');
    expect((await noteOf()).sort()).toEqual([null, 'Коротко.']);
  });

  it('an old note-cancel button cannot clear a newer note wait', async () => {
    await tap('r:hook');
    const older = (await waiting())?.n;
    await tap('r:style');
    const newer = (await waiting())?.n;
    expect(older).not.toBe(newer);
    await tapData(`ai:nonote:${older}`);
    expect((await waiting())?.n).toBe(newer);
  });

  it('never takes a message that an awaited edit owns: the last wait started wins', async () => {
    await tap('r:hook');
    await tap('edit');
    expect(await waiting()).toMatchObject({ n: null, e: GENERATION });
    await say('Моя версия текста.');
    expect(await edits()).toEqual(['Моя версия текста.']);
    expect(await noteOf()).toEqual([null]);

    // And the other way round: a reason after «✏️ Изменить» turns the wait into a note.
    await tap('edit');
    await tap('r:style');
    expect(await waiting()).toMatchObject({ n: expect.any(String), e: null });
    await say('Не правка, а пояснение.');
    expect(await edits()).toEqual(['Моя версия текста.']);
    expect((await noteOf()).sort()).toEqual([null, 'Не правка, а пояснение.']);
  });
});
