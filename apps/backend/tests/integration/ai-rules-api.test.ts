import { aiRuleSchema, aiRulesSchema, type UpdateAiSettingsInput } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AiTextProvider } from '../../src/modules/ai';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { writerAnswer } from '../helpers/writer-answer';

// The writer's rules in the studio (AI plan P8; SYS-02, SYS-09, MEM-08, MEM-13): the same rows as the bot's, so a
// rule switched off here leaves the next draft; a wrong observation removed counts the rule again.

const SETTINGS: Omit<UpdateAiSettingsInput, 'revision'> = {
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

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OWNER_RULE = uuid(1);
const ANALYSIS_RULE = uuid(2);
const CANDIDATE = uuid(3);
const SCRIPT = uuid(50);

let prompts: string[];

function studio() {
  const provider: AiTextProvider = {
    provider: 'openai',
    complete: (request) => {
      prompts.push(request.input);
      return Promise.resolve({
        text: writerAnswer({ hooks: ['Хук.'], text: 'Текст про героя.', topic: 't', device: 'd', ending: 'e' }),
        model: 'gpt-6.1-sol',
        usage: { inputTokens: 1000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 100 }
      });
    }
  };
  return createApi({ clock: fakeClock(), aiProvider: provider, env: { AI_DRAFT_LIMIT: '50' } });
}

async function seed() {
  const rule = (id: string, text: string, source: string, status: string, scope = 'igrat') =>
    testDb()
      .prepare(
        `INSERT INTO ai_rules (id, text, scope, source, status, approved_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?6)`
      )
      .bind(id, text, scope, source, status, START - 30 * 86_400_000);
  await testDb().batch([
    rule(OWNER_RULE, 'Правило автора про старт', 'owner', 'active'),
    rule(ANALYSIS_RULE, 'Правило из аналитики про промах', 'analysis', 'supported'),
    rule(CANDIDATE, 'Кандидат про концовку', 'analysis', 'candidate'),
    testDb()
      .prepare(
        `INSERT INTO ai_generations (id, kind, format, mode, source, task, status, pack_revision, created_at, updated_at)
         VALUES (?1, 'draft', 'igrat', 'direct', 'bot', 'задание', 'ready', 'pack', ?2, ?2)`
      )
      .bind(uuid(60), START - 20 * 86_400_000),
    testDb()
      .prepare(
        `INSERT INTO ai_text_revisions (id, generation_id, provenance, text, edit_ratio, created_at)
         VALUES (?1, ?2, 'OWNER_APPROVED', 'Сценарий: промахнулся хуком и проиграл линию.', 0.3, ?3)`
      )
      .bind(SCRIPT, uuid(60), START - 20 * 86_400_000),
    testDb()
      .prepare(
        `INSERT INTO ai_rule_evidence (rule_id, evidence_key, polarity, source_ref, created_at)
         VALUES (?1, ?2, 'support', 'origin', ?3), (?1, 'script:other', 'support', 'weekly:1', ?3),
                (?1, 'script:third', 'support', 'weekly:2', ?3)`
      )
      .bind(ANALYSIS_RULE, `script:${SCRIPT}`, START - 10 * 86_400_000)
  ]);
}

const draft = (api: ReturnType<typeof studio>) =>
  api.request('/api/v1/ai/drafts', {
    method: 'POST',
    json: { format: 'igrat', mode: 'direct', task: 'как я играл на пудже' }
  });
const change = (api: ReturnType<typeof studio>, id: string, action: string) =>
  api.request(`/api/v1/ai/rules/${id}`, { method: 'PUT', json: { action } });

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 86_400_000 });
  prompts = [];
  await seed();
});

describe('rules in the studio', () => {
  it('lists the rules with their evidence; approving and switching off change the next draft (SYS-02)', async () => {
    const api = studio();
    await api.request('/api/v1/ai/settings', { method: 'PUT', json: { revision: 0, ...SETTINGS } });
    const list = aiRulesSchema.parse(await (await api.request('/api/v1/ai/rules')).json());
    expect(list.inUseMax).toBe(15);
    expect(list.items.map((rule) => [rule.id, rule.inUse])).toEqual([
      [OWNER_RULE, true],
      [ANALYSIS_RULE, false],
      [CANDIDATE, false]
    ]);
    expect(list.items[1]).toMatchObject({ supports: 3, contradicts: 0 });
    expect(list.items[1]?.evidence).toContainEqual(
      expect.objectContaining({
        key: `script:${SCRIPT}`,
        origin: true,
        scriptExcerpt: 'Сценарий: промахнулся хуком и проиграл линию.'
      })
    );

    expect(aiRuleSchema.parse(await (await change(api, ANALYSIS_RULE, 'approve')).json()).inUse).toBe(true);
    await draft(api);
    expect(prompts[0]).toContain('Правило автора про старт');
    expect(prompts[0]).toContain('(из аналитики) Правило из аналитики про промах');

    expect(aiRuleSchema.parse(await (await change(api, OWNER_RULE, 'disable')).json()).inUse).toBe(false);
    // Repeating it is a no-op.
    expect((await change(api, OWNER_RULE, 'disable')).status).toBe(200);
    await draft(api);
    expect(prompts[1]).not.toContain('Правило автора про старт');
    expect(aiRuleSchema.parse(await (await change(api, OWNER_RULE, 'enable')).json()).inUse).toBe(true);
  });

  it('counts a rule again when a wrong observation is removed (MEM-13)', async () => {
    const api = studio();
    await change(api, ANALYSIS_RULE, 'approve');
    for (const key of ['script:other', 'script:third']) {
      const response = await api.request(`/api/v1/ai/rules/${ANALYSIS_RULE}/evidence/${encodeURIComponent(key)}`, {
        method: 'DELETE'
      });
      expect(response.status).toBe(200);
    }
    // One supporting video left: back to a candidate, out of prompts, the approval gone.
    expect(
      aiRuleSchema.parse(
        await (
          await api.request('/api/v1/ai/rules')
        )
          .json()
          .then((body) => aiRulesSchema.parse(body).items.find((rule) => rule.id === ANALYSIS_RULE))
      )
    ).toMatchObject({ status: 'candidate', inUse: false, approvedAt: null, supports: 1 });
    await expectError(
      await api.request(`/api/v1/ai/rules/${ANALYSIS_RULE}/evidence/script%3Aother`, { method: 'DELETE' }),
      404,
      'NOT_FOUND'
    );
  });

  it('refuses what a rule cannot do and anyone but the owner (SYS-09)', async () => {
    const api = studio();
    await expectError(await change(api, CANDIDATE, 'approve'), 409, 'CONFLICT', { reason: 'STATE' });
    await expectError(await change(api, ANALYSIS_RULE, 'enable'), 409, 'CONFLICT', { reason: 'STATE' });
    await expectError(await change(api, uuid(9), 'disable'), 404, 'NOT_FOUND');
    await expectError(await change(api, OWNER_RULE, 'remove'), 400, 'VALIDATION_ERROR');
    await expectError(await api.request('/api/v1/ai/rules', { token: null }), 401, 'UNAUTHORIZED');
    await expectError(
      await api.request(`/api/v1/ai/rules/${OWNER_RULE}`, { method: 'PUT', token: null, json: { action: 'disable' } }),
      401,
      'UNAUTHORIZED'
    );
    // The in-use cap: 14 more owner rules fill it, and a switched-off one cannot come back.
    await change(api, OWNER_RULE, 'disable');
    for (let index = 0; index < 15; index += 1)
      await testDb()
        .prepare(
          `INSERT INTO ai_rules (id, text, scope, source, status, created_at, updated_at)
           VALUES (?1, 'Ещё правило', 'all', 'owner', 'active', 1, 1)`
        )
        .bind(uuid(100 + index))
        .run();
    await expectError(await change(api, OWNER_RULE, 'enable'), 409, 'CONFLICT', { reason: 'LIMIT' });
  });
});
