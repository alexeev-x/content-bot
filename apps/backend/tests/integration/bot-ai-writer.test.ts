import type { UpdateAiSettingsInput } from '@alexeev/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createD1AiRepository, type AiTextProvider, updateAiSettings } from '../../src/modules/ai';
import { testDb } from '../helpers/db';
import { fakeBotAdminApi } from '../helpers/fake-bot-admin-api';
import { type Api, createApi, fakeClock, OWNER_ID, resetDb } from '../helpers/harness';
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
  const answers = [
    writerAnswer({ kind: 'ideas', question: 'Что случилось с хуками в твоём матче?', ideas: ['Пудж и хуки'] }),
    writerAnswer({
      hooks: ['Пять хуков — один крип.', 'Я думал, что попал.', 'Пудж и промахи.'],
      text: 'Пять хуков — один крип. Вчера я промахнулся четыре раза, а на пятом зацепил крипа.',
      topic: 'Пудж и промахи хуком',
      device: 'личная неудача',
      ending: 'крип вместо героя'
    })
  ];
  const provider: AiTextProvider = {
    provider: 'openai',
    complete: (request) => {
      modelInputs.push(request.input);
      return Promise.resolve({
        text: answers.shift() ?? '',
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
});
