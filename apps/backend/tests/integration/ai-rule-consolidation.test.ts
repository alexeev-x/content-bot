import { beforeEach, describe, expect, it } from 'vitest';
import {
  type AiTextProvider,
  consolidateRules,
  createD1AiRepository,
  createD1RulesRepository,
  type RuleVideo,
  updateAiSettings
} from '../../src/modules/ai';
import { testDb } from '../helpers/db';
import { fakeClock, resetDb } from '../helpers/harness';

// The weekly consolidation of analysis rules (AI plan P7; MEM-02..07, MEM-12, MEM-15): the model only says which
// scripts follow which rule; the measured results decide, one video counts once, a video measured before a rule
// existed never confirms it, and a rule is only for the rubric its videos came from.

const RULE = 'Начинай с промаха и его цены в первой фразе';
const DAY = 24 * 60 * 60 * 1000;

let answers: string[];
let inputs: string[];
let ids: number;
let clock: ReturnType<typeof fakeClock>;

const provider: AiTextProvider = {
  provider: 'openai',
  complete: (request) => {
    inputs.push(request.input);
    return Promise.resolve({
      text: answers.shift() ?? '{"follows":[],"proposals":[]}',
      model: 'gpt-6.1-sol',
      usage: { inputTokens: 2000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 200 }
    });
  }
};

const rules = () => createD1RulesRepository(testDb());
/** `before`: measured before the first run's rules existed; `after`: measured once they did. */
const video = (
  key: string,
  result: 'above' | 'below',
  when: 'before' | 'after' = 'before',
  format: RuleVideo['format'] = 'igrat'
): RuleVideo => ({
  key: `script:${key}`,
  format,
  result,
  measuredAt: when === 'before' ? START - DAY : START + DAY,
  script: `Сценарий ${key}`
});
const run = (videos: RuleVideo[], sourceRef = 'week-1') =>
  consolidateRules(
    {
      repo: createD1AiRepository(testDb()),
      rules: rules(),
      clock,
      timezone: 'Europe/Moscow',
      newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
      provider
    },
    { videos, sourceRef, signal: AbortSignal.timeout(5000) }
  );
const statusOf = async () =>
  (
    await testDb()
      .prepare(`SELECT status, scope FROM ai_rules WHERE source = 'analysis' ORDER BY id`)
      .all<{ status: string; scope: string }>()
  ).results;
const proposal = (videos: string[], text = RULE) => JSON.stringify({ follows: [], proposals: [{ text, videos }] });
const follows = (rule: string, videos: string[]) => JSON.stringify({ follows: [{ rule, videos }], proposals: [] });

let START: number;

beforeEach(async () => {
  await resetDb();
  clock = fakeClock();
  START = clock.now();
  await updateAiSettings(
    { repo: createD1AiRepository(testDb()), clock },
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
  answers = [];
  inputs = [];
  ids = 0;
});

describe('rule consolidation', () => {
  it('needs a video measured after the rule to support it, and counts each video once', async () => {
    answers.push(proposal(['v1', 'v2', 'v3', 'v9']));
    const first = await run([video('a', 'above'), video('b', 'above'), video('c', 'below')]);
    // Two videos above and one below: a candidate, the set it was found on cannot confirm it (MEM-02).
    expect(first).toMatchObject({ created: 1, evidence: 3, errorCode: null, toApprove: [] });
    expect(await statusOf()).toEqual([{ status: 'candidate', scope: 'igrat' }]);
    // The model never sees how a video did.
    expect(inputs[0]).not.toMatch(/выше|ниже/);

    // The same videos under another report count nothing new (MEM-03, MEM-15); another video measured before the
    // rule existed counts, but never as fresh support (review 19.10.2026).
    answers.push(follows('r1', ['v1', 'v2', 'v3', 'v4']));
    const second = await run(
      [video('a', 'above'), video('b', 'above'), video('c', 'below'), video('e', 'above')],
      'week-2'
    );
    expect(second).toMatchObject({ evidence: 1, toApprove: [] });
    expect(inputs[1]).toContain(`r1 | «Учусь играть» | ${RULE}`);

    // A video measured after it, and a «Учу фидить» one that does not count for an «Учусь играть» rule.
    answers.push(follows('r1', ['v1', 'v2']));
    const third = await run(
      [video('d', 'above', 'after'), video('f', 'below', 'after', 'fidit'), video('a', 'above')],
      'week-3'
    );
    expect(third.evidence).toBe(1);
    expect(third.toApprove).toMatchObject([{ text: RULE, status: 'supported', supports: 4, contradicts: 1 }]);
    // Supported is not in use: only the owner's «Учитывать» puts it into a prompt.
    expect(await rules().forPrompt('igrat', 15)).toEqual([]);
    expect(await rules().approve({ id: third.toApprove[0]!.id, now: START })).toBe(true);
    expect((await rules().forPrompt('igrat', 15)).map((rule) => rule.text)).toEqual([RULE]);
    expect(await rules().forPrompt('fidit', 15)).toEqual([]);
    expect(await rules().forPrompt('telegram', 15)).toEqual([]);

    // Results going against an approved rule take it out of prompts, and the owner is told (§6.3).
    answers.push(follows('r1', ['v1', 'v2', 'v3', 'v4']));
    const fourth = await run(
      ['g', 'h', 'i', 'j'].map((key) => video(key, 'below', 'after')),
      'week-4'
    );
    expect(fourth.retired).toMatchObject([{ text: RULE, status: 'deprecated' }]);
    expect(await rules().forPrompt('igrat', 15)).toEqual([]);
    expect(await rules().inUse(15)).toEqual([]);
  });

  it('makes one rule per rubric with data, never a wider one, and never proposes a turned-down rule again', async () => {
    answers.push(proposal(['v1', 'v2', 'v3', 'v4', 'v5']));
    await run([
      video('a', 'above'),
      video('b', 'above'),
      video('c', 'above', 'before', 'fidit'),
      video('d', 'above', 'before', 'fidit'),
      video('e', 'above', 'before', 'standalone')
    ]);
    expect(await statusOf()).toEqual([
      { status: 'candidate', scope: 'igrat' },
      { status: 'candidate', scope: 'fidit' }
    ]);
    const [igrat] = (await rules().openAnalysisRules()).filter((rule) => rule.scope === 'igrat');
    expect(await rules().disable({ id: igrat?.id ?? '', now: START })).toBe(true);
    answers.push(proposal(['v1', 'v2'], `${RULE.toUpperCase()}!`));
    expect(await run([video('p', 'above'), video('q', 'above'), video('r', 'above')], 'week-2')).toMatchObject({
      created: 0
    });
    expect(inputs[1]).toContain(`- ${RULE}`);
  });

  it('retires a candidate nothing confirmed for eight weeks', async () => {
    answers.push(proposal(['v1', 'v2']));
    await run([video('a', 'above'), video('b', 'above'), video('c', 'below')]);
    clock.advance(55 * DAY);
    await run([video('x', 'above'), video('y', 'above'), video('z', 'above')], 'week-8');
    expect(await statusOf()).toEqual([{ status: 'candidate', scope: 'igrat' }]);
    clock.advance(2 * DAY);
    await run([video('x', 'above'), video('y', 'above'), video('z', 'above')], 'week-9');
    expect(await statusOf()).toEqual([{ status: 'deprecated', scope: 'igrat' }]);
  });

  it('keeps the stored rules on a broken answer or too few videos (MEM-12), and drops unknown keys', async () => {
    answers.push(proposal(['v1', 'v2']));
    await run([video('a', 'above'), video('b', 'above'), video('c', 'below')]);
    answers.push('not json');
    expect(
      await run([video('d', 'above', 'after'), video('e', 'above', 'after'), video('f', 'above', 'after')], 'week-2')
    ).toMatchObject({ errorCode: 'AI_BAD_FORMAT' });
    expect(await run([video('d', 'above', 'after')], 'week-2')).toMatchObject({ errorCode: 'AI_TOO_FEW_VIDEOS' });
    expect(inputs).toHaveLength(2);
    answers.push(
      JSON.stringify({
        follows: [
          { rule: 'r7', videos: ['v1'] },
          { rule: 'r1', videos: ['v8'] }
        ],
        proposals: []
      })
    );
    expect(
      await run([video('d', 'above', 'after'), video('e', 'above', 'after'), video('f', 'above', 'after')], 'week-2')
    ).toMatchObject({ evidence: 0 });
    expect(await statusOf()).toEqual([{ status: 'candidate', scope: 'igrat' }]);
  });
});
