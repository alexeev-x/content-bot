import { aiDraftResultSchema, aiOverviewSchema, type UpdateAiSettingsInput } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AiProviderError,
  type AiTextProvider,
  costMicroUsd,
  createOpenAiProvider,
  priceFor
} from '../../src/modules/ai';
import { draftLimit } from '../../src/app/ai-routes';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { writerAnswer } from '../helpers/writer-answer';
import { fakeOwnerMessenger } from '../helpers/fake-owner-messenger';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession } from '../helpers/harness';

const SETTINGS: Omit<UpdateAiSettingsInput, 'revision'> = {
  provider: 'openai',
  enabled: true,
  draftModel: 'gpt-6.1-sol',
  cheapModel: 'gpt-6-luna',
  prices: [
    { model: 'gpt-6.1-sol', inputPerMillion: 2, cachedInputPerMillion: 0.1, outputPerMillion: 10 },
    { model: 'gpt-6-luna', inputPerMillion: 0.1, cachedInputPerMillion: 0.01, outputPerMillion: 0.5 }
  ],
  monthlyBudgetUsd: 5,
  dailyCapUsd: 1,
  warnAtPercent: 80
};

function fakeProvider(answer: () => Promise<Awaited<ReturnType<AiTextProvider['complete']>>>): AiTextProvider {
  return { provider: 'openai', complete: () => answer() };
}

const ok = () =>
  Promise.resolve({
    text: 'работает',
    model: 'gpt-6-luna-2026-09-01',
    usage: { inputTokens: 1000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 100 }
  });

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN });
});

describe('AI settings, spend and connection', () => {
  it('starts off with defaults, saves under a revision and refuses a stale one', async () => {
    const api = createApi({ clock: fakeClock() });
    const first = aiOverviewSchema.parse(await (await api.request('/api/v1/ai')).json());
    expect(first.settings).toMatchObject({ enabled: false, revision: 0, provider: 'openai' });
    expect(first.connection).toMatchObject({ keyConfigured: false, keyName: 'OPENAI_API_KEY', lastCheck: null });
    expect(first.spend).toMatchObject({ spentUsd: 0, requests: 0, leftUsd: 5, blockedBy: 'disabled' });

    const saved = await api.request('/api/v1/ai/settings', { method: 'PUT', json: { revision: 0, ...SETTINGS } });
    expect(aiOverviewSchema.parse(await saved.json()).settings).toMatchObject({ enabled: true, revision: 1 });
    // Without a key AI cannot run, whatever the settings say.
    const stale = await api.request('/api/v1/ai/settings', { method: 'PUT', json: { revision: 0, ...SETTINGS } });
    await expectError(stale, 409, 'CONFLICT');
    await expectError(await api.request('/api/v1/ai/check', { method: 'POST' }), 503, 'UNAVAILABLE');
  });

  it('records a check with its cost, and the bot is told once when the budget runs out', async () => {
    const messenger = fakeOwnerMessenger();
    const api = createApi({ clock: fakeClock(), aiProvider: fakeProvider(ok), ownerMessenger: messenger });
    await api.request('/api/v1/ai/settings', {
      method: 'PUT',
      json: { revision: 0, ...SETTINGS, monthlyBudgetUsd: 0.00018 }
    });
    const checked = aiOverviewSchema.parse(await (await api.request('/api/v1/ai/check', { method: 'POST' })).json());
    // 1 000 × $0.10 + 100 × $0.50 per million: 150 micro-USD (83 % of the budget: the warning); the dated
    // snapshot bills as its base model. The second check passes the budget: the stop.
    expect(checked.spend).toMatchObject({ requests: 1, spentUsd: 0.00015, unpricedRequests: 0 });
    expect(checked.connection.lastCheck).toMatchObject({ ok: true, model: 'gpt-6-luna-2026-09-01', errorCode: null });

    await api.request('/api/v1/ai/check', { method: 'POST' });
    await api.settle();
    const alerts = messenger.sent.map((message) => message.html);
    expect(alerts.filter((html) => html.includes('ИИ: бюджет на исходе'))).toHaveLength(1);
    expect(alerts.filter((html) => html.includes('деньги на этот месяц кончились'))).toHaveLength(1);
    // Spent: no more requests until the owner raises the budget.
    await expectError(await api.request('/api/v1/ai/check', { method: 'POST' }), 503, 'UNAVAILABLE');
  });

  it('stores a provider failure as the check result without spending', async () => {
    const api = createApi({
      clock: fakeClock(),
      aiProvider: fakeProvider(() => Promise.reject(new AiProviderError('AI_KEY_REJECTED')))
    });
    await api.request('/api/v1/ai/settings', { method: 'PUT', json: { revision: 0, ...SETTINGS } });
    const checked = aiOverviewSchema.parse(await (await api.request('/api/v1/ai/check', { method: 'POST' })).json());
    expect(checked.connection.lastCheck).toMatchObject({ ok: false, errorCode: 'AI_KEY_REJECTED' });
    expect(checked.spend.requests).toBe(0);
  });

  it('writes a studio draft as AI_DRAFT, counts it in «Качество», and refuses bad input or AI off', async () => {
    const answer = () =>
      Promise.resolve({
        text: writerAnswer({ hooks: ['Первый хук.'], text: 'Патч вышел. Стоит отметить, что Тинкер снова в игре.' }),
        model: 'gpt-6.1-sol',
        usage: { inputTokens: 3000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 300 }
      });
    const api = createApi({ clock: fakeClock(), aiProvider: fakeProvider(answer) });
    const draftJson = { format: 'telegram', mode: 'automatic', task: 'Патч 7.40: Тинкер вернулся в Captains Mode' };
    // Off by default: refused before any request.
    await expectError(await api.request('/api/v1/ai/drafts', { method: 'POST', json: draftJson }), 503, 'UNAVAILABLE');
    await api.request('/api/v1/ai/settings', { method: 'PUT', json: { revision: 0, ...SETTINGS } });
    await expectError(
      await api.request('/api/v1/ai/drafts', { method: 'POST', json: { ...draftJson, format: 'reel' } }),
      400,
      'VALIDATION_ERROR'
    );

    const response = await api.request('/api/v1/ai/drafts', { method: 'POST', json: draftJson });
    expect(response.status).toBe(200);
    const result = aiDraftResultSchema.parse(await response.json());
    expect(result).toMatchObject({ status: 'ready', hooks: ['Первый хук.'], warnings: ['AI_PHRASE:стоит отметить'] });

    const overview = aiOverviewSchema.parse(await (await api.request('/api/v1/ai')).json());
    expect(overview.quality).toMatchObject({
      days: 30,
      drafts: 1,
      withWarnings: 1,
      approved: 0,
      averageEditRatio: null
    });
    expect(overview.quality.averageDraftUsd).toBeGreaterThan(0);
  });

  it('bounds studio drafts per 10 minutes: a refused one never reaches the model or the ledger', async () => {
    let calls = 0;
    const answer = () => {
      calls += 1;
      return Promise.resolve({
        text: writerAnswer({ hooks: ['Хук.'], text: 'Патч вышел, Тинкер вернулся.' }),
        model: 'gpt-6.1-sol',
        usage: { inputTokens: 3000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 300 }
      });
    };
    const draftJson = { format: 'telegram', mode: 'automatic', task: 'Патч 7.40' };
    const api = createApi({ clock: fakeClock(), aiProvider: fakeProvider(answer), env: { AI_DRAFT_LIMIT: '2' } });
    await api.request('/api/v1/ai/settings', { method: 'PUT', json: { revision: 0, ...SETTINGS } });
    for (let n = 0; n < 2; n += 1) {
      expect((await api.request('/api/v1/ai/drafts', { method: 'POST', json: draftJson })).status).toBe(200);
    }
    await expectError(await api.request('/api/v1/ai/drafts', { method: 'POST', json: draftJson }), 429, 'RATE_LIMIT');
    expect(calls).toBe(2);
    const usage = await testDb()
      .prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE kind = 'draft'")
      .first<{ n: number }>();
    expect(usage?.n).toBe(2);

    // Production has no override: 20. A typo or a huge value never authorises more than 500.
    expect(draftLimit({})).toBe(20);
    expect(draftLimit({ AI_DRAFT_LIMIT: '200' })).toBe(200);
    expect(draftLimit({ AI_DRAFT_LIMIT: '100000' })).toBe(500);
    for (const bad of ['', 'abc', '0', '-5', '1.5']) expect(draftLimit({ AI_DRAFT_LIMIT: bad })).toBe(20);
  });

  it('refuses a chosen model without a price: its requests would never count against the budget', async () => {
    const api = createApi({ clock: fakeClock(), aiProvider: fakeProvider(ok) });
    const response = await api.request('/api/v1/ai/settings', {
      method: 'PUT',
      json: { revision: 0, ...SETTINGS, cheapModel: 'gpt-6-nova' }
    });
    await expectError(response, 400, 'VALIDATION_ERROR');
  });

  it('prices a dated snapshot as its base model, never by a bare prefix', () => {
    const price = (model: string) => ({ model, inputPerMillion: 1, cachedInputPerMillion: 1, outputPerMillion: 1 });
    const prices = [price('gpt-5'), price('gpt-5-pro')];
    expect(priceFor(prices, 'gpt-5-pro-2025-10-06')?.model).toBe('gpt-5-pro');
    expect(priceFor(prices, 'gpt-5-2025-08-07')?.model).toBe('gpt-5');
    expect(priceFor([price('gpt-5')], 'gpt-5-pro')).toBeUndefined();
  });

  it('prices cached reads and cache writes', () => {
    const price = { model: 'm', inputPerMillion: 2, cachedInputPerMillion: 0.1, outputPerMillion: 10 };
    const usage = { inputTokens: 3000, cachedInputTokens: 2000, cacheWriteTokens: 500, outputTokens: 400 };
    // 500 plain × 2 + 500 written × 2.5 + 2 000 cached × 0.1 + 400 × 10
    expect(costMicroUsd(usage, price)).toBe(1000 + 1250 + 200 + 4000);
    expect(costMicroUsd(usage, undefined)).toBeNull();
  });
});

describe('OpenAI adapter', () => {
  it('sends a Responses request, joins the message text and reads the usage', async () => {
    let body: Record<string, unknown> = {};
    let auth: string | null = null;
    const fetchImpl = async function (this: unknown, _url: RequestInfo | URL, init?: RequestInit) {
      // Like the runtime's fetch: refuses to be called as a method of another object.
      if (this !== undefined) throw new TypeError('Illegal invocation');
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      auth = new Headers(init?.headers).get('authorization');
      return Response.json({
        model: 'gpt-6-luna-2026-09-01',
        status: 'completed',
        output: [
          { type: 'reasoning', content: [] },
          {
            type: 'message',
            content: [
              { type: 'output_text', text: 'Раздал ' },
              { type: 'output_text', text: 'стиля' }
            ]
          }
        ],
        usage: { input_tokens: 1200, output_tokens: 40, input_tokens_details: { cached_tokens: 1024 } }
      });
    } as typeof fetch;
    const provider = createOpenAiProvider('sk-test', fetchImpl);
    const result = await provider.complete({
      model: 'gpt-6-luna',
      instructions: 'профиль',
      input: 'тема',
      maxOutputTokens: 300,
      signal: AbortSignal.timeout(1000)
    });
    expect(result).toEqual({
      text: 'Раздал стиля',
      model: 'gpt-6-luna-2026-09-01',
      usage: { inputTokens: 1200, cachedInputTokens: 1024, cacheWriteTokens: 0, outputTokens: 40 }
    });
    expect(auth).toBe('Bearer sk-test');
    expect(body).toMatchObject({
      model: 'gpt-6-luna',
      instructions: 'профиль',
      input: 'тема',
      store: false,
      max_output_tokens: 300
    });

    const rejected = createOpenAiProvider('bad', (async () => new Response('{}', { status: 401 })) as typeof fetch);
    await expect(
      rejected.complete({
        model: 'm',
        instructions: 'i',
        input: 'x',
        maxOutputTokens: 10,
        signal: AbortSignal.timeout(1000)
      })
    ).rejects.toMatchObject({ code: 'AI_KEY_REJECTED' });
  });
});
