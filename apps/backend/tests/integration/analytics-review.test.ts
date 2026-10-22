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

// The AI review of the daily report (AI plan P6; owner 20.10.2026: main fact, conclusions, question, next steps):
// the model explains the computed numbers and may not add any. A review with a number that is not in the facts
// would present a guess as data, so it is dropped whole.

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

const base = { main: '', points: [], question: '', steps: [] };
const point = (text: string) => ({ text, confidence: 'low' as const });

describe('analytics review', () => {
  it('finds a number the facts do not hold, and allows small counts and video keys', () => {
    expect(unverifiedNumbers({ ...base, main: 'Y1 «Пудж»: 2.7к и ×1.8, 2 ролика растут' }, FACTS)).toEqual([]);
    expect(unverifiedNumbers({ ...base, main: 'Досмотр 45% на 3-й секунде' }, FACTS)).toEqual(['45%']);
    // Sign and unit count (review 19.10.2026): «−40%» is not «40%», «+173» is not «173к».
    const facts = `${FACTS} · −40% к обычному`;
    expect(unverifiedNumbers({ ...base, points: [point('Y1 вырос на 40%')] }, facts)).toEqual(['40%']);
    expect(unverifiedNumbers({ ...base, steps: ['173к просмотров, в 3 раза выше, 10 тысяч'] }, facts)).toEqual([
      '173к',
      '3раза',
      '10тысяч'
    ]);
    expect(unverifiedNumbers({ ...base, question: 'Y1 упал на −40%, 4 места, 2 месяца?' }, facts)).toEqual([]);
  });

  it('keeps a review that repeats the facts and drops a point about a video the facts do not list', async () => {
    const result = await writeAnalyticsReview(
      deps(
        answering({
          main: 'День ровный.',
          points: [
            { text: 'Y1 в ×1.8 выше обычного', confidence: 'medium' },
            { text: 'Y9 выдуманный', confidence: 'low' }
          ],
          question: 'Почему Y1 растёт?',
          steps: ['Начать с косяка.']
        })
      ),
      { facts: FACTS, videos: ['Y1'], period: 'week', signal: AbortSignal.timeout(1000) }
    );
    expect(result.errorCode).toBeNull();
    expect(result.review).toEqual({
      main: 'День ровный.',
      points: [{ text: 'Y1 в ×1.8 выше обычного', confidence: 'medium' }],
      question: 'Почему Y1 растёт?',
      steps: ['Начать с косяка.']
    });
  });

  it('drops the whole review when it names a number of its own', async () => {
    const result = await writeAnalyticsReview(deps(answering({ ...base, main: 'Завтра будет 50к.' })), {
      facts: FACTS,
      videos: ['Y1'],
      period: 'week',
      signal: AbortSignal.timeout(1000)
    });
    expect(result).toMatchObject({ review: null, errorCode: 'AI_NUMBERS_UNVERIFIED' });
  });

  it('checks the numbers of a point against the videos it names (review 19.10.2026)', () => {
    const facts = [
      FACTS,
      'Y2 «Лион» · рубрика «Учусь играть» · возраст 50 ч · всего 900 · +12 за 24ч · сравнение слабое: мало похожих роликов'
    ].join('\n');
    // 2.7к is a real number of the report, but it is Y1's, not Y2's.
    expect(unverifiedNumbers({ ...base, points: [point('Y2: всего 2.7к')] }, facts)).toEqual(['2.7к']);
    expect(unverifiedNumbers({ ...base, points: [point('Y2: всего 900')] }, facts)).toEqual([]);
    // Naming both videos allows both videos' numbers: the comparison the owner asked for.
    expect(unverifiedNumbers({ ...base, points: [point('Y1 2.7к против 900 у Y2')] }, facts)).toEqual([]);
    // A hypothesis line is memory: its old numbers are not this day's (review 20.10.2026).
    const withMemory = `${facts}\n\nГипотезы:\nH3 · «Учу фидить» · как писать · открыта (низкая): x · последнее: пересылки 3.1%`;
    expect(unverifiedNumbers({ ...base, points: [point('Y1: пересылки 3.1%, как в H3')] }, withMemory)).toEqual([
      '3.1%'
    ]);
  });

  it('keeps the day to four points without a main line, question or steps (22.10.2026), the week to six and three', async () => {
    const many = {
      main: 'Неделя.',
      points: Array.from({ length: 6 }, (_, index) => point(`вывод номер ${index + 1}`)),
      question: '',
      steps: ['а', 'б', 'в']
    };
    const day = await writeAnalyticsReview(deps(answering(many)), {
      facts: FACTS,
      videos: ['Y1'],
      signal: AbortSignal.timeout(1000)
    });
    expect(day.review?.points).toHaveLength(4);
    expect(day.review).toMatchObject({ main: '', question: '', steps: [] });
    const week = await writeAnalyticsReview(deps(answering(many)), {
      facts: FACTS,
      videos: ['Y1'],
      period: 'week',
      signal: AbortSignal.timeout(1000)
    });
    expect(week.review?.points).toHaveLength(6);
    expect(week.review?.steps).toHaveLength(3);
  });

  it('keeps the short names of listed videos only, short and never one name twice (22.10.2026)', async () => {
    const result = await writeAnalyticsReview(
      deps(
        answering({
          ...base,
          names: [
            { id: 'N1', name: 'Оракл' },
            { id: 'N2', name: 'оракл' },
            { id: 'N3', name: 'Слишком длинное имя ролика' },
            { id: 'N9', name: 'Чужой' }
          ]
        })
      ),
      {
        facts: FACTS,
        videos: ['Y1'],
        naming: ['N1', 'N2', 'N3'].map((id) => ({ id, title: `Ролик ${id}` })),
        signal: AbortSignal.timeout(1000)
      }
    );
    expect(result.names).toEqual([{ id: 'N1', name: 'Оракл' }]);
    expect(result.review).not.toHaveProperty('names');
  });
});
