import type { UpdateAiSettingsInput } from '@alexeev/contracts';
import { Api as BotApi } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AiProviderError,
  createD1AiRepository,
  createD1WriterRepository,
  type AiTextProvider,
  updateAiSettings
} from '../../src/modules/ai';
import { testDb } from '../helpers/db';
import { fakeBotAdminApi } from '../helpers/fake-bot-admin-api';
import { type Api, createApi, fakeClock, OWNER_ID, resetDb, START } from '../helpers/harness';
import { writerAnswer } from '../helpers/writer-answer';
import { runAiJob } from '../../src/app/bot/ai-writer';

const SECRET = 'hook-secret-PLACEHOLDER';
const BOT_INFO = JSON.stringify({ id: 123456, is_bot: true, first_name: 'Bot', username: 'content_bot' });
const ORIGIN = 'https://studio.example.com';
const CHAT_ID = Number(OWNER_ID);
const ORIGINAL_TASK = 'Учусь играть про Пуджа: хочу сценарий про мои промахи хуком';
const OWNER_FACTS = 'Вчера промахнулся хуком четыре раза, на пятом зацепил крипа.';

type TelegramCall = { method: string; body: { text?: string; reply_markup?: unknown; message_id?: number } };

let api: Api;
let calls: TelegramCall[];
let modelInputs: string[];
let modelSchemas: (string | undefined)[];
let nextMessageId: number;
let nextUpdateId: number;
let modelAnswers: (string | AiProviderError)[];
let provider: AiTextProvider;
let failEdits: boolean;

const questionAnswer = writerAnswer({
  kind: 'ideas',
  question: 'Что случилось с хуками в твоём матче?',
  ideas: ['Пудж и хуки']
});
const draftAnswer = writerAnswer({
  hooks: ['Пять хуков — один крип.', 'Я думал, что попал.', 'Пудж и промахи.'],
  text: 'Пять хуков — один крип. Вчера я промахнулся четыре раза, а на пятом зацепил крипа.',
  topic: 'Пудж и промахи хуком',
  device: 'личная неудача',
  ending: 'крип вместо героя'
});

const settings: Omit<UpdateAiSettingsInput, 'revision'> = {
  provider: 'openai',
  enabled: true,
  draftModel: 'gpt-6.1-sol',
  cheapModel: 'gpt-6-luna',
  videoReviews: false,
  prices: [],
  monthlyBudgetUsd: 5,
  dailyCapUsd: 1,
  warnAtPercent: 80
};

beforeEach(async () => {
  await resetDb();
  await updateAiSettings({ repo: createD1AiRepository(testDb()), clock: fakeClock() }, { revision: 0, ...settings });
  calls = [];
  modelInputs = [];
  modelSchemas = [];
  nextMessageId = 20;
  nextUpdateId = 9000;
  modelAnswers = [questionAnswer, draftAnswer];
  failEdits = false;
  provider = {
    provider: 'openai',
    complete: (request) => {
      modelInputs.push(request.input);
      modelSchemas.push(request.jsonSchema?.name);
      const answer = modelAnswers.shift();
      if (answer instanceof AiProviderError) return Promise.reject(answer);
      return Promise.resolve({
        text: answer ?? '',
        model: 'gpt-6.1-sol',
        usage: { inputTokens: 3000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 400 }
      });
    }
  };
  api = createApi({
    clock: fakeClock(),
    botInfo: BOT_INFO,
    webhookSecret: SECRET,
    botAdminApi: fakeBotAdminApi(),
    aiProvider: provider
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const method =
      String(input instanceof Request ? input.url : input)
        .split('/')
        .pop() ?? '';
    const body = JSON.parse(String(init?.body ?? '{}')) as TelegramCall['body'];
    calls.push({ method, body });
    const visibleText = body.text
      ?.replace(/<[^>]+>/g, '')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&');
    if (method === 'editMessageText' && (visibleText?.length ?? 0) > 4096)
      return Promise.resolve(Response.json({ ok: false, error_code: 400, description: 'message is too long' }));
    if (method === 'editMessageText' && failEdits)
      return Promise.resolve(Response.json({ ok: false, error_code: 500, description: 'DEV Telegram failure' }));
    const result =
      method === 'sendMessage'
        ? {
            message_id: ++nextMessageId,
            date: 1,
            chat: { id: CHAT_ID, type: 'private', first_name: 'X' },
            text: body.text
          }
        : true;
    return Promise.resolve(Response.json({ ok: true, result }));
  });
});

afterEach(() => vi.restoreAllMocks());

function message(text: string, command = false, replyToMessageId?: number) {
  return {
    update_id: ++nextUpdateId,
    message: {
      message_id: nextUpdateId,
      date: 1,
      chat: { id: CHAT_ID, type: 'private', first_name: 'X' },
      from: { id: CHAT_ID, is_bot: false, first_name: 'X' },
      text,
      ...(replyToMessageId === undefined
        ? {}
        : {
            reply_to_message: {
              message_id: replyToMessageId,
              date: 1,
              chat: { id: CHAT_ID, type: 'private', first_name: 'X' },
              from: { id: 123456, is_bot: true, first_name: 'Bot' },
              text: 'Что случилось с хуками?'
            }
          }),
      ...(command ? { entities: [{ type: 'bot_command', offset: 0, length: 9 }] } : {})
    }
  };
}

function callback(data: string, messageId: number) {
  return {
    update_id: ++nextUpdateId,
    callback_query: {
      id: `cb-${nextUpdateId}`,
      chat_instance: 'x',
      from: { id: CHAT_ID, is_bot: false, first_name: 'X' },
      data,
      message: { message_id: messageId, date: 1, chat: { id: CHAT_ID, type: 'private', first_name: 'X' }, text: 'x' }
    }
  };
}

const deliver = (update: unknown) =>
  api.request(`${ORIGIN}/webhooks/telegram`, {
    method: 'POST',
    token: null,
    headers: { 'x-telegram-bot-api-secret-token': SECRET },
    json: update
  });

async function askForFacts() {
  expect((await deliver(message('/redactor', true))).status).toBe(200);
  const promptId = nextMessageId;
  expect((await deliver(callback('rd:igrat', promptId))).status).toBe(200);
  expect((await deliver(message(ORIGINAL_TASK))).status).toBe(200);
  await api.settle();
}

describe('Telegram AI writer', () => {
  it('keeps the saved facts through a hook choice and a shorter rewrite', async () => {
    modelAnswers = [
      questionAnswer,
      writerAnswer({
        hooks: ['Пять хуков — один крип.', 'Я думал, что попал.', 'Пудж и промахи.'],
        // The draft is a single factual line and does not start with a proposed hook.
        text: OWNER_FACTS,
        topic: 'Пудж и промахи хуком',
        device: 'личная неудача',
        ending: 'крип вместо героя'
      })
    ];
    await askForFacts();
    expect((await deliver(message(OWNER_FACTS))).status).toBe(200);
    await api.settle();
    const draft = await testDb()
      .prepare("SELECT id, chat_message_id AS messageId FROM ai_generations WHERE result = 'draft'")
      .first<{ id: string; messageId: number }>();
    const firstRevision = await testDb()
      .prepare('SELECT id FROM ai_text_revisions WHERE generation_id = ? ORDER BY created_at, rowid LIMIT 1')
      .bind(draft?.id)
      .first<{ id: string }>();
    expect(
      (await deliver(callback(`ai:${draft?.id}:h1:${firstRevision?.id.slice(-12)}`, draft?.messageId ?? 0))).status
    ).toBe(200);
    const chosen = await testDb()
      .prepare(
        'SELECT id, text FROM ai_text_revisions WHERE generation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'
      )
      .bind(draft?.id)
      .first<{ id: string; text: string }>();
    expect(chosen?.text.startsWith('Я думал, что попал.')).toBe(true);
    expect(chosen?.text).toContain(OWNER_FACTS);
    modelAnswers.push(draftAnswer);
    expect(
      (await deliver(callback(`ai:${draft?.id}:short:${chosen?.id.slice(-12)}`, draft?.messageId ?? 0))).status
    ).toBe(200);
    await api.settle();
    expect(modelInputs).toHaveLength(3);
    expect(modelInputs[2]).toContain(OWNER_FACTS);
    expect(modelInputs[2]).toContain(chosen?.text ?? '');
  });

  it('keeps buttons and revision identities separate for two drafts in one chat', async () => {
    await askForFacts();
    expect((await deliver(message(OWNER_FACTS))).status).toBe(200);
    await api.settle();
    const first = await testDb()
      .prepare(
        "SELECT id, chat_message_id AS messageId FROM ai_generations WHERE result = 'draft' ORDER BY created_at, rowid LIMIT 1"
      )
      .first<{ id: string; messageId: number }>();
    modelAnswers.push(draftAnswer);
    expect((await deliver(message('Напиши пост про выбор героя в Dota'))).status).toBe(200);
    await api.settle();
    const second = await testDb()
      .prepare(
        "SELECT id, chat_message_id AS messageId FROM ai_generations WHERE result = 'draft' ORDER BY created_at DESC, rowid DESC LIMIT 1"
      )
      .first<{ id: string; messageId: number }>();
    expect(second?.id).not.toBe(first?.id);
    expect(second?.messageId).not.toBe(first?.messageId);
    const firstRevision = await testDb()
      .prepare('SELECT id FROM ai_text_revisions WHERE generation_id = ? ORDER BY created_at, rowid LIMIT 1')
      .bind(first?.id)
      .first<{ id: string }>();
    expect(
      (await deliver(callback(`ai:${first?.id}:h1:${firstRevision?.id.slice(-12)}`, first?.messageId ?? 0))).status
    ).toBe(200);
    expect(
      await testDb()
        .prepare('SELECT COUNT(*) AS n FROM ai_text_revisions WHERE generation_id = ?')
        .bind(first?.id)
        .first<{ n: number }>()
    ).toEqual({ n: 2 });
    expect(
      await testDb()
        .prepare('SELECT COUNT(*) AS n FROM ai_text_revisions WHERE generation_id = ?')
        .bind(second?.id)
        .first<{ n: number }>()
    ).toEqual({ n: 1 });
  });

  it('renders long HTML and emoji text without cutting a Unicode character', async () => {
    modelAnswers = [
      questionAnswer,
      writerAnswer({
        hooks: ['<Хук & 1>', 'Хук 2', 'Хук 3'],
        text: `X<&${'😀'.repeat(2300)} конец`,
        topic: 'Игра',
        device: 'ирония',
        ending: 'вывод'
      })
    ];
    await askForFacts();
    expect((await deliver(message(OWNER_FACTS))).status).toBe(200);
    await api.settle();
    const shown = calls.filter((call) => call.method === 'editMessageText').at(-1)?.body.text ?? '';
    expect(shown).toContain('&lt;Хук &amp; 1&gt;');
    expect(shown).toContain('X&lt;&amp;');
    expect(Array.from(shown).some((character) => /^[\uD800-\uDFFF]$/.test(character))).toBe(false);
    expect(shown).not.toContain('конец');
    const saved = await testDb()
      .prepare("SELECT text FROM ai_text_revisions WHERE provenance = 'AI_DRAFT'")
      .first<{ text: string }>();
    expect((saved?.text.length ?? 0) > 4096).toBe(true);
    expect(saved?.text).toContain('конец');
  });

  it('keeps an HTML-heavy preview under the visible Telegram limit', async () => {
    modelAnswers = [
      questionAnswer,
      writerAnswer({
        hooks: ['Хук <&>', 'Ещё хук', 'Третий хук'],
        text: '<&'.repeat(2700),
        topic: 'Игра',
        device: 'ирония',
        ending: 'вывод'
      })
    ];
    await askForFacts();
    expect((await deliver(message(OWNER_FACTS))).status).toBe(200);
    await api.settle();
    const shown = calls.filter((call) => call.method === 'editMessageText').at(-1)?.body.text ?? '';
    expect(shown.length).toBeGreaterThan(4096); // Raw HTML is escaped; Telegram checks after entity parsing.
    const visible = shown
      .replace(/<[^>]+>/g, '')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&');
    expect(visible.length).toBeLessThanOrEqual(4096);
    expect(shown).toContain('&lt;&amp;');
  });

  it('keeps the brief through a facts question and permits approval only after a draft', async () => {
    await askForFacts();

    const question = await testDb()
      .prepare("SELECT id, result, task, chat_message_id FROM ai_generations WHERE result = 'needs_facts'")
      .first<{ id: string; result: string; task: string; chat_message_id: number }>();
    expect(question).toMatchObject({ result: 'needs_facts', task: ORIGINAL_TASK });
    const questionEdit = calls.find(
      (call) => call.method === 'editMessageText' && call.body.message_id === question?.chat_message_id
    );
    expect(questionEdit?.body.reply_markup).toBeUndefined();
    expect(await testDb().prepare('SELECT COUNT(*) AS n FROM ai_text_revisions').first<{ n: number }>()).toEqual({
      n: 0
    });

    expect((await deliver(message(OWNER_FACTS))).status).toBe(200);
    await api.settle();
    expect(modelInputs).toHaveLength(2);
    expect(modelInputs[1]).toContain(ORIGINAL_TASK);
    expect(modelInputs[1]).toContain(OWNER_FACTS);
    const draft = await testDb()
      .prepare("SELECT id, result, chat_message_id FROM ai_generations WHERE result = 'draft'")
      .first<{ id: string; result: string; chat_message_id: number }>();
    expect(draft?.result).toBe('draft');
    expect((await deliver(callback(`ai:${draft?.id}:ok`, draft?.chat_message_id ?? 0))).status).toBe(200);
    expect((await deliver(callback(`ai:${draft?.id}:ok`, draft?.chat_message_id ?? 0))).status).toBe(200);
    const revisions = await testDb()
      .prepare('SELECT provenance FROM ai_text_revisions WHERE generation_id = ? ORDER BY created_at')
      .bind(draft?.id)
      .all<{ provenance: string }>();
    expect(revisions.results.map((row) => row.provenance)).toEqual(['AI_DRAFT', 'OWNER_APPROVED']);
  });

  it('ignores a stranger: no facts answer, approval, rewrite or Telegram call (TG-10)', async () => {
    await askForFacts();
    const asStranger = <T extends { message?: { from: { id: number } }; callback_query?: { from: { id: number } } }>(
      update: T
    ): T => {
      if (update.message) update.message.from.id = 777;
      if (update.callback_query) update.callback_query.from.id = 777;
      return update;
    };
    calls.length = 0;
    expect((await deliver(asStranger(message(OWNER_FACTS)))).status).toBe(200);
    await api.settle();
    expect(modelInputs).toHaveLength(1);
    expect(calls).toEqual([]);

    expect((await deliver(message(OWNER_FACTS))).status).toBe(200);
    await api.settle();
    const draft = await testDb()
      .prepare("SELECT id, chat_message_id FROM ai_generations WHERE result = 'draft'")
      .first<{ id: string; chat_message_id: number }>();
    calls.length = 0;
    for (const action of ['ok', 'short'])
      expect(
        (await deliver(asStranger(callback(`ai:${draft?.id}:${action}`, draft?.chat_message_id ?? 0)))).status
      ).toBe(200);
    await api.settle();
    expect(calls).toEqual([]);
    expect(modelInputs).toHaveLength(2);
    const revisions = await testDb()
      .prepare('SELECT provenance FROM ai_text_revisions WHERE generation_id = ?')
      .bind(draft?.id)
      .all<{ provenance: string }>();
    expect(revisions.results.map((row) => row.provenance)).toEqual(['AI_DRAFT']);
  });

  it('treats a typed rubric name in /redactor as the task, not a chat answer (owner DEV run 19.10.2026)', async () => {
    expect((await deliver(message('/redactor', true))).status).toBe(200);
    expect((await deliver(message('Учусь играть на Пудже'))).status).toBe(200);
    await api.settle();
    expect(
      await testDb().prepare('SELECT format, result, task FROM ai_generations').all<Record<string, string>>()
    ).toMatchObject({ results: [{ format: 'igrat', result: 'needs_facts', task: 'Учусь играть на Пудже' }] });

    expect((await deliver(message(OWNER_FACTS))).status).toBe(200);
    await api.settle();
    expect(modelInputs[1]).toContain(OWNER_FACTS);
    // One question per task (TG-03, owner DEV run 19.10.2026): the answer may only produce a draft.
    expect(modelSchemas).toEqual(['writer_answer', 'writer_draft']);
    expect(modelInputs[1]).toContain('второй вопрос не задавай');
    expect(
      await testDb().prepare("SELECT COUNT(*) AS n FROM ai_generations WHERE result = 'draft'").first<{ n: number }>()
    ).toEqual({ n: 1 });
  });

  it('names the reason of a failed draft and says an unchanged approval is only saved (owner DEV run 19.10.2026)', async () => {
    modelAnswers = [new AiProviderError('AI_TIMEOUT')];
    expect((await deliver(message('Учу фидить на Пудже'))).status).toBe(200);
    await api.settle();
    expect(calls.filter((call) => call.method === 'editMessageText').at(-1)?.body.text).toBe(
      'Не получилось написать: модель не ответила за 25 секунд (AI_TIMEOUT). Попробуйте ещё раз.'
    );

    modelAnswers = [draftAnswer];
    expect((await deliver(message('Учусь играть на Пудже'))).status).toBe(200);
    await api.settle();
    const draft = await testDb()
      .prepare("SELECT id, chat_message_id FROM ai_generations WHERE result = 'draft'")
      .first<{ id: string; chat_message_id: number }>();
    expect((await deliver(callback(`ai:${draft?.id}:ok`, draft?.chat_message_id ?? 0))).status).toBe(200);
    expect(calls.filter((call) => call.method === 'sendMessage').at(-1)?.body.text).toBe('Одобрено. Текст сохранён.');
  });

  it('calls the model once for a queued job delivered twice, and drops a malformed message (Queue AI_JOBS)', async () => {
    modelAnswers = [draftAnswer];
    expect((await deliver(message('Учусь играть на Пудже'))).status).toBe(200);
    await api.settle();
    expect(api.aiJobs.sent).toHaveLength(1);
    expect(api.aiJobs.sent[0]).toMatchObject({ kind: 'draft', format: 'igrat', task: 'Учусь играть на Пудже' });

    await api.aiJobs.deliver(api.aiJobs.sent[0]);
    await api.aiJobs.deliver({ kind: 'draft', task: 'no id' });
    expect(modelInputs).toHaveLength(1);
    expect(await testDb().prepare('SELECT COUNT(*) AS n FROM ai_generations').first<{ n: number }>()).toEqual({
      n: 1
    });
  });

  it('shows a failure, not «Пишу…» forever, when D1 fails at the claim before the model', async () => {
    const errors: unknown[] = [];
    await runAiJob(
      {
        id: crypto.randomUUID(),
        chatId: CHAT_ID,
        messageId: 77,
        appOrigin: ORIGIN,
        kind: 'draft',
        format: 'igrat',
        task: 'Учусь играть на Пудже'
      },
      {
        api: new BotApi('123456:PLACEHOLDER'),
        clock: fakeClock(),
        claim: () => Promise.reject(new Error('D1 down')),
        writer: () => Promise.reject(new Error('not reached')),
        onError: (error) => errors.push(error)
      }
    );
    expect(calls.at(-1)).toMatchObject({
      method: 'editMessageText',
      body: { message_id: 77, text: 'Не получилось написать. Попробуйте ещё раз.' }
    });
    expect(modelInputs).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it('says so when the queue refuses a job and frees the saved facts answer for the retry at once', async () => {
    await askForFacts();
    const refusing = createApi({
      clock: fakeClock(),
      botInfo: BOT_INFO,
      webhookSecret: SECRET,
      botAdminApi: fakeBotAdminApi(),
      aiProvider: provider,
      env: { AI_JOBS: { send: () => Promise.reject(new Error('queue down')) } as never }
    });
    calls.length = 0;
    const response = await refusing.request(`${ORIGIN}/webhooks/telegram`, {
      method: 'POST',
      token: null,
      headers: { 'x-telegram-bot-api-secret-token': SECRET },
      json: message(OWNER_FACTS)
    });
    expect(response.status).toBe(200);
    expect(calls.find((call) => call.method === 'editMessageText')?.body.text).toBe(
      'Не получилось написать. Попробуйте ещё раз.'
    );
    expect(modelInputs).toHaveLength(1);
    expect(await testDb().prepare('SELECT status FROM ai_writer_fact_answers').first<{ status: string }>()).toEqual({
      status: 'failed'
    });
  });

  it('/stop ends the editor and its open question: the next text is no answer (owner, 19.10.2026)', async () => {
    await askForFacts();
    expect((await deliver(message('/stop', true))).status).toBe(200);
    expect(calls.at(-1)?.body.text).toBe('Готово, режим закончен.');

    expect((await deliver(message(OWNER_FACTS))).status).toBe(200);
    await api.settle();
    expect(modelInputs).toHaveLength(1);
    expect(calls.at(-1)?.body.text).toBe('Чтобы сделать пост — /post, чтобы написать с ИИ — /redactor.');
  });

  describe('«Что не так?» fixes the version by the owner remark (plan P2)', () => {
    const REMARK = 'Шутка банальная, в начале долго. Концовку сохрани.';
    const fixAnswer = JSON.stringify({
      ...JSON.parse(draftAnswer),
      text: 'Четыре промаха, пятый — в крипа. Вчера я промахнулся четыре раза, а на пятом зацепил крипа.',
      changes: 'Изменил начало и шутку; оставил концовку',
      reasons: ['joke_missed', 'too_long']
    });

    async function readyDraft() {
      modelAnswers = [draftAnswer];
      expect((await deliver(message('Учусь играть на Пудже'))).status).toBe(200);
      await api.settle();
      const draft = await testDb()
        .prepare("SELECT id, chat_message_id AS messageId FROM ai_generations WHERE result = 'draft'")
        .first<{ id: string; messageId: number }>();
      const revision = await testDb()
        .prepare('SELECT id FROM ai_text_revisions WHERE generation_id = ?')
        .bind(draft?.id)
        .first<{ id: string }>();
      return { id: draft?.id ?? '', messageId: draft?.messageId ?? 0, token: revision?.id.slice(-12) ?? '' };
    }

    const feedback = () =>
      testDb()
        .prepare('SELECT generation_id AS generationId, kind, note FROM ai_feedback')
        .all<{ generationId: string; kind: string; note: string | null }>()
        .then((rows) => rows.results);

    it('takes the next message as the remark, writes a fixed version and records the remark once (TG-06, TG-07)', async () => {
      const draft = await readyDraft();
      expect((await deliver(callback(`ai:${draft.id}:why:${draft.token}`, draft.messageId))).status).toBe(200);
      expect(calls.at(-1)?.body.text).toContain('Напишите своими словами, что не так');

      modelAnswers = [fixAnswer];
      const both = await Promise.all([deliver(message(REMARK)), deliver(message('Второе сообщение'))]);
      expect(both.map((response) => response.status)).toEqual([200, 200]);
      await api.settle();
      expect(modelInputs).toHaveLength(2);
      expect(modelSchemas.at(-1)).toBe('writer_fix');
      expect(modelInputs[1]).toContain(REMARK);
      expect(modelInputs[1]).toContain('Пять хуков — один крип.');

      const shown = calls.filter((call) => call.method === 'editMessageText').at(-1);
      expect(shown?.body.text).toContain('Что изменил: Изменил начало и шутку; оставил концовку');
      expect(JSON.stringify(shown?.body.reply_markup)).toContain('↩ Вернуть прошлый');
      // Recorded on the judged draft, with the first reason the model named; only recorded, never a rule.
      expect(await feedback()).toEqual([{ generationId: draft.id, kind: 'joke_missed', note: REMARK }]);
    });

    it('fixes by the note after a reason button, without a second verdict', async () => {
      const draft = await readyDraft();
      await deliver(callback(`ai:${draft.id}:why:${draft.token}`, draft.messageId));
      await deliver(callback(`ai:${draft.id}:r:hook:${draft.token}`, draft.messageId));
      modelAnswers = [fixAnswer];
      expect((await deliver(message('Нет интриги в первой фразе'))).status).toBe(200);
      await api.settle();
      expect(modelInputs[1]).toContain('причина: слабый хук');
      expect(modelInputs[1]).toContain('Нет интриги в первой фразе');
      expect(await feedback()).toEqual([
        { generationId: draft.id, kind: 'weak_hook', note: 'Нет интриги в первой фразе' }
      ]);
    });

    it('two notes at the same moment make one paid fix (review 19.10.2026)', async () => {
      const draft = await readyDraft();
      await deliver(callback(`ai:${draft.id}:r:hook:${draft.token}`, draft.messageId));
      modelAnswers = [fixAnswer, fixAnswer];
      await Promise.all([deliver(message('Нет интриги')), deliver(message('Совсем нет интриги'))]);
      await api.settle();
      expect(modelSchemas.filter((name) => name === 'writer_fix')).toHaveLength(1);
      expect(calls.some((call) => call.body.text === 'Замечание уже принято, исправляю.')).toBe(true);
    });

    it('«Своё время» ends the remark wait: the time is no remark and starts no fix (review 19.10.2026)', async () => {
      const draft = await readyDraft();
      await deliver(callback(`ai:${draft.id}:why:${draft.token}`, draft.messageId));
      const repo = createD1WriterRepository(testDb());
      // What the «Своё время» handler does to the editor's waits (create-bot.ts).
      await repo.setFixing({ chatId: CHAT_ID, generationId: null, now: START, expiresAt: START });
      expect((await repo.touchRequest(CHAT_ID, START, START + 1000))?.fixing ?? null).toBeNull();
    });

    it('«↩ Вернуть прошлый» shows the version the fix came from, with its own buttons', async () => {
      const draft = await readyDraft();
      await deliver(callback(`ai:${draft.id}:why:${draft.token}`, draft.messageId));
      modelAnswers = [fixAnswer];
      await deliver(message(REMARK));
      await api.settle();
      const fixed = await testDb()
        .prepare('SELECT id, chat_message_id AS messageId FROM ai_generations WHERE parent_generation_id = ?')
        .bind(draft.id)
        .first<{ id: string; messageId: number }>();
      expect((await deliver(callback(`ai:${fixed?.id}:undo`, fixed?.messageId ?? 0))).status).toBe(200);
      const back = calls.filter((call) => call.method === 'sendMessage').at(-1);
      expect(back?.body.text).toContain('Вчера я промахнулся четыре раза');
      expect(JSON.stringify(back?.body.reply_markup)).toContain(`ai:${draft.id}:ok`);
      expect(modelInputs).toHaveLength(2);
    });

    it('«← Назад» ends the wait: the next message is no remark', async () => {
      const draft = await readyDraft();
      await deliver(callback(`ai:${draft.id}:why:${draft.token}`, draft.messageId));
      await deliver(callback(`ai:${draft.id}:back:${draft.token}`, draft.messageId));
      await deliver(message(REMARK));
      await api.settle();
      expect(modelSchemas).not.toContain('writer_fix');
    });
  });

  it('consumes an open facts question once when two replies arrive together', async () => {
    await askForFacts();
    const responses = await Promise.all([
      deliver(message(OWNER_FACTS)),
      deliver(message('Ещё одна версия того же ответа.'))
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    await api.settle();
    expect(modelInputs).toHaveLength(2);
    const rows = await testDb()
      .prepare("SELECT result FROM ai_generations WHERE result = 'draft'")
      .all<{ result: string }>();
    expect(rows.results).toHaveLength(1);
  });

  it('does not regenerate from a reply to an answered facts question', async () => {
    await askForFacts();
    const question = await testDb()
      .prepare("SELECT chat_message_id AS messageId FROM ai_generations WHERE result = 'needs_facts'")
      .first<{ messageId: number }>();
    expect((await deliver(message(OWNER_FACTS))).status).toBe(200);
    await api.settle();
    expect((await deliver(message('Повторяю ответ', false, question?.messageId))).status).toBe(200);
    await api.settle();
    expect(modelInputs).toHaveLength(2);
  });

  it('keeps the owner answer after a provider failure and retries only on an explicit tap', async () => {
    modelAnswers = [questionAnswer, new AiProviderError('AI_PROVIDER_UNREACHABLE'), draftAnswer];
    await askForFacts();
    const question = await testDb()
      .prepare("SELECT id, chat_message_id AS messageId FROM ai_generations WHERE result = 'needs_facts'")
      .first<{ id: string; messageId: number }>();
    expect((await deliver(message(OWNER_FACTS, false, question?.messageId))).status).toBe(200);
    await api.settle();

    const saved = await testDb()
      .prepare('SELECT answer, status FROM ai_writer_fact_answers WHERE question_generation_id = ?')
      .bind(question?.id)
      .first<{ answer: string; status: string }>();
    expect(saved).toEqual({ answer: OWNER_FACTS, status: 'failed' });
    expect(modelInputs).toHaveLength(2);
    expect(calls.filter((call) => call.method === 'editMessageText').at(-1)?.body.reply_markup).toEqual(
      expect.objectContaining({
        inline_keyboard: [[expect.objectContaining({ callback_data: `ai:${question?.id}:retry` })]]
      })
    );

    // The saved answer survives a new Worker instance; a retry does not depend on isolate memory.
    api = createApi({
      clock: fakeClock(),
      botInfo: BOT_INFO,
      webhookSecret: SECRET,
      botAdminApi: fakeBotAdminApi(),
      aiProvider: provider
    });
    const retryMessageId = nextMessageId;
    const retries = await Promise.all([
      deliver(callback(`ai:${question?.id}:retry`, retryMessageId)),
      deliver(callback(`ai:${question?.id}:retry`, retryMessageId))
    ]);
    expect(retries.map((response) => response.status)).toEqual([200, 200]);
    await api.settle();
    expect(modelInputs).toHaveLength(3);
    expect(modelInputs[2]).toContain(OWNER_FACTS);
    expect(
      await testDb()
        .prepare('SELECT status FROM ai_writer_fact_answers WHERE question_generation_id = ?')
        .bind(question?.id)
        .first<{ status: string }>()
    ).toEqual({ status: 'ready' });
  });

  it('recovers a persisted answer after Worker stops before the model finishes', async () => {
    await askForFacts();
    const question = await testDb()
      .prepare("SELECT id, chat_message_id AS messageId FROM ai_generations WHERE result = 'needs_facts'")
      .first<{ id: string; messageId: number }>();
    expect(question).not.toBeNull();
    expect(
      await createD1WriterRepository(testDb()).claimFactAnswer({
        chatId: CHAT_ID,
        generationId: question?.id ?? '',
        answer: OWNER_FACTS,
        now: START
      })
    ).toBe(true);

    // A fresh isolate sees only D1. A tap within the 5-minute lease may overlap a queued two-minute model call.
    expect((await deliver(message(OWNER_FACTS, false, question?.messageId))).status).toBe(200);
    const retryMessageId = nextMessageId;
    expect((await deliver(callback(`ai:${question?.id}:retry`, retryMessageId))).status).toBe(200);
    expect(modelInputs).toHaveLength(1);

    const at = (offset: number) =>
      createApi({
        clock: fakeClock(START + offset),
        botInfo: BOT_INFO,
        webhookSecret: SECRET,
        botAdminApi: fakeBotAdminApi(),
        aiProvider: provider
      });
    api = at(4 * 60_000);
    expect((await deliver(callback(`ai:${question?.id}:retry`, retryMessageId))).status).toBe(200);
    await api.settle();
    expect(modelInputs).toHaveLength(1);

    api = at(5 * 60_000 + 1000);
    expect((await deliver(callback(`ai:${question?.id}:retry`, retryMessageId))).status).toBe(200);
    await api.settle();
    expect(modelInputs).toHaveLength(2);
    expect(modelInputs[1]).toContain(OWNER_FACTS);
    expect(
      await testDb()
        .prepare('SELECT status FROM ai_writer_fact_answers WHERE question_generation_id = ?')
        .bind(question?.id)
        .first<{ status: string }>()
    ).toEqual({ status: 'ready' });
  });

  it('redelivers a saved ready draft without another model call after Telegram edit fails', async () => {
    await askForFacts();
    const question = await testDb()
      .prepare("SELECT id FROM ai_generations WHERE result = 'needs_facts'")
      .first<{ id: string }>();
    failEdits = true;
    expect((await deliver(message(OWNER_FACTS))).status).toBe(200);
    await api.settle();
    expect(modelInputs).toHaveLength(2);
    const saved = await testDb()
      .prepare(
        'SELECT status, draft_generation_id AS draftId FROM ai_writer_fact_answers WHERE question_generation_id = ?'
      )
      .bind(question?.id)
      .first<{ status: string; draftId: string }>();
    expect(saved?.status).toBe('ready');
    expect(saved?.draftId).toBeTruthy();

    failEdits = false;
    api = createApi({
      clock: fakeClock(),
      botInfo: BOT_INFO,
      webhookSecret: SECRET,
      botAdminApi: fakeBotAdminApi(),
      aiProvider: provider
    });
    const retryMessageId = nextMessageId;
    expect((await deliver(callback(`ai:${question?.id}:retry`, retryMessageId))).status).toBe(200);
    expect(modelInputs).toHaveLength(2);
    expect(calls.filter((call) => call.method === 'editMessageText').at(-1)?.body.text).toContain('Пять хуков');
    expect(
      await testDb()
        .prepare('SELECT chat_message_id AS messageId FROM ai_generations WHERE id = ?')
        .bind(saved?.draftId)
        .first<{ messageId: number }>()
    ).toEqual({ messageId: retryMessageId });
  });

  it('does not silently truncate long owner facts', async () => {
    await askForFacts();
    expect((await deliver(message('ф'.repeat(3990)))).status).toBe(200);
    expect(modelInputs).toHaveLength(1);
    expect(calls.filter((call) => call.method === 'sendMessage').at(-1)?.body.text).toContain('слишком длинные');
    expect(await testDb().prepare('SELECT COUNT(*) AS n FROM ai_writer_fact_answers').first<{ n: number }>()).toEqual({
      n: 0
    });

    expect((await deliver(message(OWNER_FACTS))).status).toBe(200);
    await api.settle();
    expect(modelInputs).toHaveLength(2);
    expect(modelInputs[1]).toContain(OWNER_FACTS);
  });
});
