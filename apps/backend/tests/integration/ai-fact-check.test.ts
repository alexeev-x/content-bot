import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createContainer } from '../../src/app/container';
import { createWriterDeps } from '../../src/app/bot/writer-deps';
import { createD1AiRepository, generateCheckedDraft, updateAiSettings } from '../../src/modules/ai';
import type { AiTextProvider } from '../../src/modules/ai/ports';
import { testDb } from '../helpers/db';
import { fakeClock, OWNER_ID, resetDb, START } from '../helpers/harness';
import { writerAnswer } from '../helpers/writer-answer';

// The second pass over an automatic draft (owner, 21.10.2026): a claim the facts do not support is fixed, a clean
// draft is left alone, and a failed check never loses the draft.
const USAGE = { inputTokens: 1000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 200 };
const TASK =
  'Повод: серия постов о событии. Факты: <<<Оракул-автоматон видит будущее, но не может на него повлиять.>>>';
const draft = (text: string) =>
  writerAnswer({ hooks: ['Оракул'], text, topic: 'Оракул', device: 'факт', ending: 'ссылка' });

let answers: string[];
let inputs: string[];

function deps() {
  const provider: AiTextProvider = {
    provider: 'openai',
    complete: async (request) => {
      inputs.push(request.input);
      return { text: answers.shift() ?? '', model: request.model, usage: USAGE };
    }
  };
  const container = createContainer({ DB: testDb(), OWNER_TELEGRAM_ID: OWNER_ID }, {
    clock: fakeClock(START),
    aiProvider: provider
  } as Parameters<typeof createContainer>[1]);
  return createWriterDeps(container, 'test');
}

const run = async () =>
  generateCheckedDraft(await deps(), {
    format: 'telegram',
    mode: 'automatic',
    source: 'bot',
    task: TASK,
    signal: AbortSignal.timeout(10_000)
  });

beforeEach(async () => {
  await resetDb();
  answers = [];
  inputs = [];
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

describe('generateCheckedDraft', () => {
  it('fixes exactly the claims the facts do not support, as a version of the same draft', async () => {
    const invented = 'Оракул видит будущее. Пророчества его игнорируют, потому что он всех бесит.';
    answers = [
      draft(invented),
      JSON.stringify({ problems: [{ quote: 'потому что он всех бесит', why: 'в фактах нет причины' }] }),
      JSON.stringify({
        ...JSON.parse(draft('Оракул видит будущее, но повлиять на него не может.')),
        changes: 'Убрал выдуманную причину',
        reasons: []
      })
    ];
    const result = await run();
    expect(result.text).toBe('Оракул видит будущее, но повлиять на него не может.');
    expect(result.generation.kind).toBe('rewrite');
    expect(result.generation.parentGenerationId).not.toBeNull();
    // The check saw the task and the draft; the fix was told what to remove.
    expect(inputs[1]).toContain(TASK);
    expect(inputs[1]).toContain(invented);
    expect(inputs[2]).toContain('потому что он всех бесит');
  });

  it('leaves a clean draft and a draft whose check failed as they are', async () => {
    answers = [draft('Оракул видит будущее, но повлиять не может.'), JSON.stringify({ problems: [] })];
    const clean = await run();
    expect(clean.generation.kind).toBe('draft');
    expect(clean.text).toBe('Оракул видит будущее, но повлиять не может.');

    answers = [draft('Оракул видит будущее.'), 'not json'];
    const unchecked = await run();
    expect(unchecked.generation.kind).toBe('draft');
    expect(unchecked.text).toBe('Оракул видит будущее.');
  });
});
