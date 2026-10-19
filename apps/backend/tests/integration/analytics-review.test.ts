import { beforeEach, describe, expect, it } from 'vitest';
import {
  type AiTextProvider,
  createD1AiRepository,
  updateAiSettings,
  writeAnalyticsReview
} from '../../src/modules/ai';
import { unverifiedNumbers } from '../../src/modules/ai/analytics-review';
import { testDb } from '../helpers/db';
import { fakeClock, resetDb } from '../helpers/harness';

// The AI review of the daily report (AI plan P6): the model explains the computed numbers and may not add any.
// A review with a number that is not in the facts would present a guess as data, so it is dropped whole.

const FACTS = [
  'YouTube:',
  'Y1 «Пудж» · рубрика «Учусь играть» · возраст 30 ч · всего 2.7к · +173 за 24ч · 7/ч · обычно для рубрики к 24ч: 1.5к, у ролика 2.7к (×1.8, сравнение надёжное)'
].join('\n');

function answering(review: unknown): AiTextProvider {
  return {
    provider: 'openai',
    complete: async () => ({
      text: JSON.stringify(review),
      model: 'gpt-6.1-sol',
      usage: { inputTokens: 1000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 200 }
    })
  };
}

const deps = (provider: AiTextProvider) => ({
  repo: createD1AiRepository(testDb()),
  clock: fakeClock(),
  timezone: 'Europe/Moscow',
  newId: () => crypto.randomUUID(),
  provider
});

beforeEach(async () => {
  await resetDb();
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

describe('analytics review', () => {
  it('finds a number the facts do not hold, and allows small counts', () => {
    const base = { summary: '', rising: [], weak: [], next: '' };
    expect(unverifiedNumbers({ ...base, summary: 'Пудж: 2.7к и ×1.8, 2 ролика растут' }, FACTS)).toEqual([]);
    expect(unverifiedNumbers({ ...base, summary: 'Досмотр 45% на 3-й секунде' }, FACTS)).toEqual(['45%']);
    // Sign and unit count (review 19.10.2026): «−40%» is not «40%», «+173» is not «173к».
    const facts = `${FACTS} · −40% к обычному`;
    expect(unverifiedNumbers({ ...base, summary: 'вырос на 40%' }, facts)).toEqual(['40%']);
    expect(unverifiedNumbers({ ...base, summary: '173к просмотров, в 3 раза выше, 10 тысяч' }, facts)).toEqual([
      '173к',
      '3раза',
      '10тысяч'
    ]);
    expect(unverifiedNumbers({ ...base, summary: 'упал на −40%, 4 места, 2 месяца' }, facts)).toEqual([]);
  });

  it('keeps a review that repeats the facts and drops a video the facts do not list', async () => {
    const result = await writeAnalyticsReview(
      deps(
        answering({
          summary: 'День ровный.',
          rising: [
            { video: 'Y1', note: 'в ×1.8 выше обычного' },
            { video: 'Y9', note: 'выдуманный' }
          ],
          weak: [],
          next: 'Начать с косяка.'
        })
      ),
      { facts: FACTS, videos: ['Y1'], signal: AbortSignal.timeout(1000) }
    );
    expect(result.errorCode).toBeNull();
    expect(result.review?.rising).toEqual([{ video: 'Y1', note: 'в ×1.8 выше обычного' }]);
  });

  it('drops the whole review when it names a number of its own', async () => {
    const result = await writeAnalyticsReview(
      deps(answering({ summary: 'Завтра будет 50к.', rising: [], weak: [], next: '' })),
      { facts: FACTS, videos: ['Y1'], signal: AbortSignal.timeout(1000) }
    );
    expect(result).toMatchObject({ review: null, errorCode: 'AI_NUMBERS_UNVERIFIED' });
  });

  it('checks the numbers of a video against that video and drops hypotheses on a weak comparison (review 19.10.2026)', async () => {
    const facts = [
      FACTS,
      'Y2 «Лион» · рубрика «Учусь играть» · возраст 50 ч · всего 900 · +12 за 24ч · сравнение слабое: мало похожих роликов'
    ].join('\n');
    const base = { summary: '', rising: [], next: '' };
    // 2.7к is a real number of the report, but it is Y1's, not Y2's.
    expect(unverifiedNumbers({ ...base, weak: [{ video: 'Y2', note: 'всего 2.7к', hypotheses: [] }] }, facts)).toEqual([
      '2.7к'
    ]);
    expect(unverifiedNumbers({ ...base, weak: [{ video: 'Y2', note: 'всего 900', hypotheses: [] }] }, facts)).toEqual(
      []
    );
    const result = await writeAnalyticsReview(
      deps(
        answering({
          summary: 'День ровный.',
          rising: [],
          weak: [
            { video: 'Y2', note: 'набрал мало', hypotheses: [{ text: 'возможно, слабый хук', confidence: 'low' }] }
          ],
          next: ''
        })
      ),
      { facts, videos: ['Y1', 'Y2'], signal: AbortSignal.timeout(1000) }
    );
    expect(result.review?.weak).toEqual([{ video: 'Y2', note: 'набрал мало', hypotheses: [] }]);
  });
});
