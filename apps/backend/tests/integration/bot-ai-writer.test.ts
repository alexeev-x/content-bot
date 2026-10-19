import type { UpdateAiSettingsInput } from '@alexeev/contracts';
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
  nextMessageId = 20;
  nextUpdateId = 9000;
  modelAnswers = [questionAnswer, draftAnswer];
  failEdits = false;
  provider = {
    provider: 'openai',
    complete: (request) => {
      modelInputs.push(request.input);
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

    // A fresh isolate sees only D1. The first tap is too early to overlap a live 25 s model call.
    expect((await deliver(message(OWNER_FACTS, false, question?.messageId))).status).toBe(200);
    const retryMessageId = nextMessageId;
    expect((await deliver(callback(`ai:${question?.id}:retry`, retryMessageId))).status).toBe(200);
    expect(modelInputs).toHaveLength(1);

    api = createApi({
      clock: fakeClock(START + 61_000),
      botInfo: BOT_INFO,
      webhookSecret: SECRET,
      botAdminApi: fakeBotAdminApi(),
      aiProvider: provider
    });
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
