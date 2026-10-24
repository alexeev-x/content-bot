import { aiOverviewSchema, type AiHypothesisDto, type AiOverviewDto, type AiRuleDto } from '@alexeev/contracts';
import { describe, expect, it } from 'vitest';
import { pendingDecisions } from './decisions';

// «Нужно ваше решение» (owner, 20.10.2026): a missed item leaves a rule or a script waiting forever; a made-up one
// sends the owner to look for nothing.

const base = aiOverviewSchema.parse({
  settings: {
    provider: 'openai',
    enabled: true,
    draftModel: 'gpt-6.1-sol',
    cheapModel: 'gpt-6-luna',
    prices: [],
    monthlyBudgetUsd: 5,
    dailyCapUsd: 1,
    warnAtPercent: 70,
    revision: 3,
    updatedAt: '2026-10-16T06:30:00.000Z'
  },
  connection: { provider: 'openai', keyConfigured: true, keyName: 'OPENAI_API_KEY', lastCheck: null },
  spend: {
    month: '2026-10',
    spentUsd: 0,
    todayUsd: 0,
    leftUsd: 5,
    requests: 0,
    averageUsd: null,
    unpricedRequests: 0,
    byKind: [],
    bySource: [],
    blockedBy: null
  },
  quality: {
    days: 30,
    drafts: 0,
    rewrites: 0,
    failed: 0,
    withWarnings: 0,
    approved: 0,
    approvedUnchanged: 0,
    averageEditRatio: null,
    jokeMissed: 0,
    feedback: [],
    averageDraftUsd: null,
    questions: 0,
    studioDrafts: 0,
    changedParts: [],
    byFormat: [],
    previous: { approved: 0, averageEditRatio: null, comparable: false }
  },
  catalog: {
    provider: 'openai',
    providerLabel: 'OpenAI',
    pricesCheckedOn: '2026-10-15',
    models: [
      {
        id: 'gpt-6.1-sol',
        label: 'GPT-6.1 Sol',
        note: 'Для черновиков',
        roles: ['draft'],
        recommendedFor: 'draft',
        inputPerMillion: 2,
        cachedInputPerMillion: 0.2,
        outputPerMillion: 12
      },
      {
        id: 'gpt-6-luna',
        label: 'GPT-6 Luna',
        note: 'Дешёвая',
        roles: ['draft', 'cheap'],
        recommendedFor: 'cheap',
        inputPerMillion: 0.1,
        cachedInputPerMillion: 0.01,
        outputPerMillion: 0.5
      }
    ]
  }
});

const rule = (status: AiRuleDto['status'], text: string): AiRuleDto => ({
  id: crypto.randomUUID(),
  text,
  scope: 'fidit',
  source: 'analysis',
  status,
  inUse: false,
  approvedAt: null,
  createdAt: '2026-10-19T08:00:00.000Z',
  supports: 3,
  contradicts: 1,
  evidence: []
});
const hypothesis = (status: AiHypothesisDto['status'], asked: boolean): AiHypothesisDto => ({
  code: 3,
  text: 'Ошибка в первой фразе набирает больше.',
  scope: 'fidit',
  kind: 'writing',
  status,
  confidence: 'medium',
  note: null,
  asked,
  updatedAt: '2026-10-19T08:00:00.000Z'
});
const withSpend = (spentUsd: number): AiOverviewDto => ({ ...base, spend: { ...base.spend, spentUsd } });

describe('pendingDecisions', () => {
  it('lists the rule waiting for «Учитывать», the hypothesis the bot asked about and the scripts without a video', () => {
    const decisions = pendingDecisions({
      overview: base,
      rules: [rule('supported', 'Начинай с промаха'), rule('active', 'Работает'), rule('candidate', 'Кандидат')],
      hypotheses: [hypothesis('supported', true), hypothesis('open', false)],
      unlinked: 2
    });
    expect(decisions.map((decision) => [decision.id, decision.target])).toEqual([
      ['rules', 'learning'],
      ['hypotheses', 'learning'],
      ['unlinked', 'learning']
    ]);
    expect(decisions[0]?.title).toBe('1 правило ждёт решения');
    expect(decisions[2]?.title).toBe('2 сценария без видео');
  });

  it('is empty when nothing waits, and warns from the budget threshold', () => {
    expect(pendingDecisions({ overview: base, rules: [], hypotheses: [], unlinked: 0 })).toEqual([]);
    const warned = pendingDecisions({ overview: withSpend(3.6), rules: [], hypotheses: [], unlinked: 0 });
    expect(warned.map((decision) => decision.id)).toEqual(['budget']);
  });

  it('puts a switched-off AI first, sending the owner to the settings', () => {
    const off = { ...base, settings: { ...base.settings, enabled: false } };
    const [first] = pendingDecisions({ overview: off, rules: [], hypotheses: [], unlinked: 1 });
    expect(first).toMatchObject({ id: 'off', target: 'settings' });
  });
});
