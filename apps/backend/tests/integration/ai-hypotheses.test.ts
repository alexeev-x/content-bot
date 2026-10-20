import { aiHypothesesSchema } from '@alexeev/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAiQueue } from '../../src/app/ai-queue';
import { createContainer } from '../../src/app/container';
import { type AiTextProvider, createD1AiRepository, updateAiSettings } from '../../src/modules/ai';
import { createD1ContentDailyReportRepository } from '../../src/modules/content-analytics';
import { testDb } from '../helpers/db';
import { fakeOwnerMessenger } from '../helpers/fake-owner-messenger';
import { expectError } from '../helpers/expect-error';
import { createApi, fakeClock, OWNER_ID, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

const FOREIGN_TOKEN = 'foreign-token-00000000000000000000000000';
import { meteredDb } from '../helpers/metered-db';

// The analyst's memory (owner, 20.10.2026: «он считает, советует, запоминает — и от этого зависит написание
// текстов»): the daily review raises hypotheses, Monday's job weighs them against the week's numbers, and a supported
// writing hypothesis reaches the writer only as a question the owner answers «Учитывать».

const TOKEN = '123456:TEST-BOT-TOKEN-PLACEHOLDER';
const USAGE = { inputTokens: 3000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 400 };

/** A stored report whose facts hold one reference: TR1 «БКБ…» with its 591к and 5.07% of shares. */
function reportData(asOf: number) {
  return JSON.stringify({
    daily: {
      asOf,
      partial: false,
      platforms: [
        {
          platform: 'tiktok',
          state: 'ok',
          lastSuccessAt: asOf,
          errorCode: null,
          rows: [],
          references: [
            {
              platform: 'tiktok',
              title: 'БКБ покупают только те, кто не умеет играть в Доту',
              url: 'https://www.tiktok.com/@a/video/1',
              format: 'fidit',
              views: 591_000,
              ageDays: 15,
              likesRate: 10.6,
              sharesRate: 5.07
            }
          ]
        }
      ]
    },
    accuracy: { scored: 0, inBand: 0 }
  });
}

const review = (hypothesis: { text: string; scope: string; kind: string }) =>
  JSON.stringify({ main: 'День ровный.', points: [], question: '', steps: [], hypothesis });

const hypothesisRows = () =>
  testDb()
    .prepare(
      'SELECT code, text, kind, status, confidence, note, lesson_id AS lessonId FROM ai_hypotheses ORDER BY code'
    )
    .all<{
      code: number;
      text: string;
      kind: string;
      status: string;
      confidence: string;
      note: string | null;
      lessonId: string | null;
    }>()
    .then((rows) => rows.results);

let answers: string[];
let inputs: string[];
let provider: AiTextProvider;
let messenger: ReturnType<typeof fakeOwnerMessenger>;
let queued: unknown[];

beforeEach(async () => {
  await resetDb();
  answers = [];
  inputs = [];
  queued = [];
  messenger = fakeOwnerMessenger();
  provider = {
    provider: 'openai',
    complete: async (request) => {
      inputs.push(request.input);
      return { text: answers.shift() ?? '', model: request.model, usage: USAGE };
    }
  };
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await updateAiSettings(
    { repo: createD1AiRepository(testDb()), clock: fakeClock() },
    {
      revision: 0,
      provider: 'openai',
      enabled: true,
      draftModel: 'gpt-6.1-sol',
      cheapModel: 'gpt-6-luna',
      videoReviews: false,
      prices: [],
      monthlyBudgetUsd: 5,
      dailyCapUsd: 1,
      warnAtPercent: 80
    }
  );
});

afterEach(() => vi.restoreAllMocks());

async function consume(body: unknown, db: D1Database = testDb()): Promise<void> {
  const container = createContainer({ DB: db, OWNER_TELEGRAM_ID: OWNER_ID, TELEGRAM_BOT_TOKEN: TOKEN }, {
    clock: fakeClock(START),
    aiProvider: provider,
    ownerMessenger: messenger,
    aiJobs: { send: async (job: unknown) => void queued.push(job) }
  } as Parameters<typeof createContainer>[1]);
  const message = { id: crypto.randomUUID(), timestamp: new Date(), body, attempts: 1, ack() {}, retry() {} };
  await handleAiQueue(
    { queue: 'q', messages: [message], ackAll() {}, retryAll() {} } as unknown as MessageBatch<unknown>,
    container,
    TOKEN
  );
}

async function storeReport(id: string): Promise<void> {
  await createD1ContentDailyReportRepository(testDb()).claim({
    id,
    asOf: START,
    timezone: 'Europe/Moscow',
    data: reportData(START),
    now: START
  });
}

async function dailyReview(id: string, answer: string): Promise<void> {
  await storeReport(id);
  answers.push(answer);
  await consume({ id: crypto.randomUUID(), kind: 'daily_review', reportId: id });
}

describe('the analyst’s hypotheses', () => {
  it('a day raises a hypothesis once, the next day sees it as memory', async () => {
    const hook = { text: 'Если хук — спорный тезис, пересылок больше', scope: 'fidit', kind: 'writing' };
    await dailyReview('daily:2026-10-19:v1', review(hook));
    // The same text again (any case) is not a second hypothesis.
    await dailyReview('daily:2026-10-20:v1', review({ ...hook, text: hook.text.toUpperCase() }));
    expect(await hypothesisRows()).toEqual([
      { code: 1, text: hook.text, kind: 'writing', status: 'open', confidence: 'low', note: null, lessonId: null }
    ]);
    expect(inputs[0]).not.toContain('Гипотезы:');
    expect(inputs[1]).toContain('Гипотезы:\nH1 · «Учу фидить» · как писать · открыта (низкая): Если хук');
  });

  it('a hypothesis with a number of its own is dropped alone; the day’s review still goes out', async () => {
    await dailyReview(
      'daily:2026-10-19:v1',
      review({ text: 'Если хук спорный, пересылок станет 9%', scope: 'fidit', kind: 'writing' })
    );
    expect(await hypothesisRows()).toEqual([]);
    const report = await testDb()
      .prepare('SELECT status, review_error AS reviewError FROM content_daily_reports WHERE id = ?')
      .bind('daily:2026-10-19:v1')
      .first();
    expect(report).toEqual({ status: 'reviewed', reviewError: null });
  });

  it('Monday weighs them: supported asks the owner, low confidence stays open, a foreign number or code is dropped', async () => {
    await dailyReview(
      'daily:2026-10-18:v1',
      review({ text: 'Если хук — спорный тезис, пересылок больше', scope: 'fidit', kind: 'writing' })
    );
    await dailyReview(
      'daily:2026-10-19:v1',
      review({ text: 'Герои-керри набирают больше саппортов', scope: 'igrat', kind: 'topic' })
    );
    await dailyReview(
      'daily:2026-10-20:v1',
      review({ text: 'Концовка-закон держит до конца', scope: 'fidit', kind: 'writing' })
    );
    await storeReport('weekly:2026-10-20:v1');
    answers.push(
      JSON.stringify({
        verdicts: [
          { code: 1, status: 'supported', confidence: 'medium', note: 'TR1: пересылки 5.07% против обычных' },
          { code: 2, status: 'supported', confidence: 'low', note: 'Пока один ролик TR1.' },
          { code: 3, status: 'refuted', confidence: 'medium', note: 'Концовки не помогли: 12%.' },
          { code: 9, status: 'refuted', confidence: 'medium', note: 'Нет такой.' }
        ]
      })
    );
    await consume({ id: crypto.randomUUID(), kind: 'hypotheses', reportId: 'weekly:2026-10-20:v1' });
    const rows = await hypothesisRows();
    expect(rows.map(({ code, status }) => ({ code, status }))).toEqual([
      { code: 1, status: 'supported' },
      // «supported» with low confidence is not enough.
      { code: 2, status: 'open' },
      // 12% is not in the facts: the verdict is dropped, the hypothesis stays open.
      { code: 3, status: 'open' }
    ]);
    expect(rows[0]?.lessonId).not.toBeNull();
    const lesson = await testDb()
      .prepare('SELECT status, origin, scope, text FROM ai_style_lessons WHERE id = ?')
      .bind(rows[0]?.lessonId)
      .first();
    expect(lesson).toEqual({
      status: 'asked',
      origin: 'analytics',
      scope: 'fidit',
      text: 'Если хук — спорный тезис, пересылок больше'
    });
    const alerts = await testDb()
      .prepare('SELECT id, html FROM content_alerts ORDER BY id')
      .all<{ id: string; html: string }>();
    const digest = alerts.results.find((alert) => alert.id.startsWith('hypotheses:'));
    expect(digest?.html).toContain('🧪 <b>Гипотезы недели</b>');
    expect(digest?.html).toContain('<b>H1</b> ✅ подтверждается');
    // Only what changed: H2 stays open, so it is not listed (review 20.10.2026: the message must fit Telegram).
    expect(digest?.html).not.toContain('<b>H2</b>');
    const question = alerts.results.find((alert) => alert.id === `style:${rows[0]?.lessonId}`);
    expect(question?.html).toContain('💡 <b>Аналитика подтверждает</b> для «Учу фидить»');

    // A redelivered job is claimed once: nothing changes and nothing is asked twice.
    const before = await hypothesisRows();
    answers.push('{"verdicts":[]}');
    await consume({ id: crypto.randomUUID(), kind: 'hypotheses', reportId: 'weekly:2026-10-20:v1' });
    expect(await hypothesisRows()).toEqual(before);
    expect(
      (await testDb().prepare("SELECT count(*) AS n FROM ai_style_lessons WHERE origin = 'analytics'").first())?.n
    ).toBe(1);
  });

  it('the Monday job fits one consumer call of 50 D1 statements with sixteen hypotheses', async () => {
    for (let index = 1; index <= 16; index += 1)
      await testDb()
        .prepare(
          `INSERT INTO ai_hypotheses (id, code, text, scope, kind, status, confidence, source_ref, created_at, updated_at)
           VALUES (?1, ?2, ?3, 'fidit', 'writing', 'open', 'low', 'daily:x', ?4, ?4)`
        )
        .bind(crypto.randomUUID(), index, `Гипотеза номер ${index} про хуки`, START)
        .run();
    await storeReport('weekly:2026-10-20:v1');
    answers.push(
      JSON.stringify({
        verdicts: Array.from({ length: 16 }, (_, index) => ({
          code: index + 1,
          status: 'supported',
          confidence: 'medium',
          note: 'TR1: пересылки 5.07%'
        }))
      })
    );
    const metered = meteredDb(testDb());
    await consume({ id: crypto.randomUUID(), kind: 'hypotheses', reportId: 'weekly:2026-10-20:v1' }, metered.db);
    expect((await hypothesisRows()).filter((row) => row.status === 'supported')).toHaveLength(16);
    // Two questions at most per Monday.
    expect((await hypothesisRows()).filter((row) => row.lessonId !== null)).toHaveLength(2);
    expect(metered.meter.statements).toBeLessThanOrEqual(50);
    expect(metered.meter.roundTrips).toBeLessThanOrEqual(50);
  });

  it('the studio lists them for the owner only', async () => {
    await dailyReview(
      'daily:2026-10-19:v1',
      review({ text: 'Если хук — спорный тезис, пересылок больше', scope: 'fidit', kind: 'writing' })
    );
    await seedSession({ token: OWNER_TOKEN, expiresAt: START + 86_400_000 });
    const api = createApi({ clock: fakeClock() });
    const response = await api.request('/api/v1/ai/hypotheses');
    expect(response.status).toBe(200);
    expect(aiHypothesesSchema.parse(await response.json()).items).toMatchObject([
      { code: 1, scope: 'fidit', kind: 'writing', status: 'open', confidence: 'low', note: null, asked: false }
    ]);
    await expectError(await api.request('/api/v1/ai/hypotheses', { token: null }), 401, 'UNAUTHORIZED');
    await seedSession({ token: FOREIGN_TOKEN, telegramId: '777', expiresAt: START + 86_400_000 });
    await expectError(await api.request('/api/v1/ai/hypotheses', { token: FOREIGN_TOKEN }), 403, 'FORBIDDEN');
  });
});
