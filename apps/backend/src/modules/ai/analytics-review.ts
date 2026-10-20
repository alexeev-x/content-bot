import { z } from 'zod';
import type { Clock } from '../../platform/clock';
import type { AiRepository } from './d1-ai-repository';
import { AiProviderError, type AiTextProvider } from './ports';
import { assertAiReady, type BudgetEvent, readAiSettings, recordAiUsage } from './service';

// The AI review of the daily and weekly analytics reports (AI plan P6; owner 20.10.2026: like the ChatGPT reports —
// the main fact, numbered conclusions with comparisons and hypotheses, an editorial question and next steps). Code
// computes every number and comparison; the model only explains them (plan §5). It sees the facts block alone, may
// only repeat numbers of the videos it names (checked here), and names videos by their key, never retyped.

/** Room for a reasoning model's thinking before a short structured answer. */
const MAX_OUTPUT_TOKENS = 4000;
const MAIN_MAX = 200;
/** A conclusion is two or three short sentences; the whole review must leave room for the tables (4096). */
const POINT_MAX = 280;
const QUESTION_MAX = 200;
const STEP_MAX = 200;
const HYPOTHESIS_MAX = 300;
/** The week's review says more (owner, 20.10.2026: «где недельный — подробнее»). */
const POINTS_MAX = { day: 4, week: 6 } as const;
const STEPS_MAX = { day: 2, week: 3 } as const;

/** What the review is about: the day's videos, or the week's with its themes and rubrics. */
const PERIOD = {
  day: [
    'Пишешь утренний разбор дня для автора.',
    'points — 3–4 вывода о роликах дня. Весь ответ — не больше 1200 знаков.',
    'hypothesis — одна новая гипотеза, если цифры показывают закономерность, которой нет среди гипотез H… в данных: проверяемое «если …, то …» про то, как писать (kind writing: хук, конфликт, длина, концовка) или о чём снимать (kind topic: тема, герой, рубрика); scope — рубрика. Нет такой — text пустой.'
  ].join('\n'),
  week: [
    'Пишешь разбор недели для автора — подробнее, чем за день.',
    'points — 4–6 выводов: лучший и худший ролик недели и почему, рубрики и темы, пересылки, подписчики и цели.',
    'steps — 2–3 шага на следующую неделю. Ролики недели — ключи V1…, посты — P1…. Весь ответ — не больше 1800 знаков: сообщение с таблицами ограничено.',
    'hypothesis — оставь text пустым: гипотезы пересматриваются отдельно после этого разбора.'
  ].join('\n')
} as const;

const INSTRUCTIONS = [
  'Ты — аналитик канала автора ALEXEEV (шортсы про Доту на YouTube и TikTok, Telegram-канал). Автор читает разбор утром с телефона.',
  'ДАННЫЕ ниже — единственный источник. Каждое число в ответе бери только оттуда, слово в слово, со знаком и единицей (например «2.7к», «+58%», «−49%», «5.07%»). Новых чисел не считай и не придумывай: не «в 2 раза», не «10 тысяч» — нужные сравнения уже посчитаны в данных.',
  'Ролики называй только их ключами из данных (Y1, T3, V2, ориентиры YR1, TR2); код сам подставит названия и ссылки. Числа ролика бери из его строки.',
  'main — одна фраза: главное за период.',
  'points — выводы, не пересказ таблицы. Каждый: факт с числами → сравнение (с ровесниками рубрики, со вчерашним приростом, пересылки против ориентиров канала, рубрика против рубрики) → что это может значить. Пересылки — главный признак, что ролик зацепил. confidence: low или medium; доказательств причин у нас нет.',
  'Нельзя: удержание, досмотры, секунды, CTR, «алгоритм», обещания роста — этих данных нет. Про хук и сценарий — только если в данных есть его начало.',
  'Гипотезы H… в данных — твоя память о прошлых выводах: если цифры их поддерживают или опровергают, скажи это в выводе и назови номер (H3).',
  'question — один редакционный вопрос, на который стоит искать ответ. steps — конкретные шаги для следующих роликов (тема, рубрика, хук), без воды. Пустое поле допустимо, выдумывать нельзя.',
  'Пиши по-русски, просто и коротко, как другу-автору.'
].join('\n');

export const ANALYTICS_REVIEW_JSON_SCHEMA: { name: string; schema: Record<string, unknown> } = {
  name: 'analytics_review',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['main', 'points', 'question', 'steps', 'hypothesis'],
    properties: {
      main: { type: 'string' },
      points: {
        type: 'array',
        maxItems: POINTS_MAX.week,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'confidence'],
          properties: { text: { type: 'string' }, confidence: { type: 'string', enum: ['low', 'medium'] } }
        }
      },
      question: { type: 'string' },
      steps: { type: 'array', maxItems: STEPS_MAX.week, items: { type: 'string' } },
      hypothesis: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'scope', 'kind'],
        properties: {
          text: { type: 'string' },
          scope: { type: 'string', enum: ['fidit', 'igrat', 'standalone', 'telegram'] },
          kind: { type: 'string', enum: ['writing', 'topic'] }
        }
      }
    }
  }
};

const line = (max: number) =>
  z.string().transform((value) => Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, max).join(''));
export const analyticsReviewSchema = z.object({
  main: line(MAIN_MAX),
  points: z
    .array(z.object({ text: line(POINT_MAX), confidence: z.enum(['low', 'medium']) }))
    .max(POINTS_MAX.week)
    .transform((points) => points.filter((point) => point.text !== '')),
  question: line(QUESTION_MAX),
  steps: z
    .array(line(STEP_MAX))
    .max(STEPS_MAX.week)
    .transform((steps) => steps.filter((step) => step !== '')),
  /** A new hypothesis for the analyst's memory (owner, 20.10.2026); an empty text proposes none. */
  hypothesis: z
    .object({
      text: line(HYPOTHESIS_MAX),
      scope: z.enum(['fidit', 'igrat', 'standalone', 'telegram']),
      kind: z.enum(['writing', 'topic'])
    })
    .optional()
});
export type AnalyticsReview = z.infer<typeof analyticsReviewSchema>;

/** Small bare counts («3 ролика», «из 4») may be said freely; any other number must come from the facts as is. */
const FREE_NUMBER_MAX = 12;
// A number with its sign and unit, so «40%» does not pass for «−40%» nor «173к» for «+173».
// «к», «м», «ч» count as a unit only on their own («4 места» is a count, «4м» is not); «тысяч», «раза» do.
const NUMBER = /[+\-−]?\d+(?:[.,]\d+)?(?:\s?(?:%|тыс[а-яё]*|млн[а-яё]*|раз[а-яё]*|[кмч](?![а-яё])))?/gi;
/** A video's key in the facts and the review: Y1, T3, V2, P1, and the references YR1, TR2. */
export const VIDEO_KEY = /\b(?:YR|TR|Y|T|V|P)\d{1,2}\b/g;
const normal = (value: string) => value.replace(',', '.').replace('-', '−').replace(/\s/g, '').toLowerCase();
const bareSmall = (value: string) => /^\d+$/.test(value) && Number(value) <= FREE_NUMBER_MAX;
/** A key is not a number: «T4» must not pass «4» through the check, nor be flagged. */
/** A hypothesis number (H3) is not a number either. */
const HYPOTHESIS_KEY = /\bH\d{1,4}\b/g;
const withoutKeys = (text: string) => text.replace(VIDEO_KEY, ' ').replace(HYPOTHESIS_KEY, ' ');

/** The facts' lines about one video: each starts with its key («Y1 «Пудж» · …»). */
export function videoFacts(facts: string, video: string): string {
  return facts
    .split('\n')
    .filter((line) => line.trimStart().startsWith(`${video} `))
    .join('\n');
}

/** The facts' lines about no single video: totals, followers, rubric lines. */
function generalFacts(facts: string): string {
  return (
    facts
      .split('\n')
      // The hypotheses' lines (H3 · …) are memory, not this period's numbers: none of theirs may be repeated
      // (review 20.10.2026).
      .filter((line) => !/^(?:YR|TR|Y|T|V|P)\d{1,2} |^H\d{1,4} /.test(line.trimStart()))
      .join('\n')
  );
}

const numbersOf = (text: string) => new Set((withoutKeys(text).match(NUMBER) ?? []).map(normal));
const missing = (text: string, known: Set<string>) =>
  (withoutKeys(text).match(NUMBER) ?? []).map(normal).filter((value) => !known.has(value) && !bareSmall(value));

/**
 * The numbers of the review that the facts do not contain; empty when the review only repeats them. A text may use
 * the numbers of the videos it names and of the general lines, never another video's (review 19.10.2026: another
 * video's real number passed the old check).
 */
export function unverifiedNumbers(
  review: Pick<AnalyticsReview, 'main' | 'points' | 'question' | 'steps' | 'hypothesis'>,
  facts: string
): string[] {
  const general = generalFacts(facts);
  const allowed = (text: string) =>
    numbersOf([general, ...[...new Set(text.match(VIDEO_KEY) ?? [])].map((key) => videoFacts(facts, key))].join('\n'));
  const texts = [review.main, review.question, ...review.steps, ...review.points.map((point) => point.text)];
  if (review.hypothesis !== undefined) texts.push(review.hypothesis.text);
  return texts.flatMap((text) => missing(text, allowed(text)));
}

export interface AnalyticsReviewDeps {
  repo: AiRepository;
  clock: Clock;
  timezone: string;
  newId: () => string;
  provider: AiTextProvider | null;
}

/**
 * The review of one report's facts, or the reason there is none: AI off or out of budget (AppError UNAVAILABLE
 * is thrown, as everywhere), a provider failure, an answer of the wrong shape, or a number not in the facts.
 */
export async function writeAnalyticsReview(
  deps: AnalyticsReviewDeps,
  input: { facts: string; videos: readonly string[]; period?: keyof typeof PERIOD; signal: AbortSignal }
): Promise<{
  review: AnalyticsReview | null;
  errorCode: string | null;
  model: string | null;
  /** The ai_usage row of the call (the studio shows its cost); null when no call was answered. */
  usageId: string | null;
  budgetEvents: BudgetEvent[];
}> {
  const period = input.period ?? 'day';
  const settings = await readAiSettings(deps.repo);
  // The draft model, as for the owner's scripts: the review is read every day (owner: quality first).
  const { provider, model } = await assertAiReady(deps, settings, settings.draftModel ?? settings.cheapModel);
  let result;
  try {
    result = await provider.complete({
      model,
      instructions: `${INSTRUCTIONS}\n${PERIOD[period]}`,
      input: `ДАННЫЕ:\n${input.facts}`,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      jsonSchema: ANALYTICS_REVIEW_JSON_SCHEMA,
      signal: input.signal
    });
  } catch (error) {
    if (!(error instanceof AiProviderError)) throw error;
    return { review: null, errorCode: error.code, model: null, usageId: null, budgetEvents: [] };
  }
  const usageId = deps.newId();
  const budgetEvents = await recordAiUsage(deps, {
    id: usageId,
    kind: 'other',
    provider: provider.provider,
    model: result.model,
    usage: result.usage,
    settings
  });
  let review: AnalyticsReview;
  try {
    review = analyticsReviewSchema.parse(JSON.parse(result.text));
  } catch {
    return { review: null, errorCode: 'AI_BAD_FORMAT', model: result.model, usageId, budgetEvents };
  }
  const known = new Set(input.videos);
  // A point about a video the facts do not list is dropped rather than guessed.
  const namesUnknown = (text: string) => (text.match(VIDEO_KEY) ?? []).some((key) => !known.has(key));
  // A new hypothesis comes from a day (the week's are weighed by their own job, modules/ai/hypotheses.ts). One with a
  // number of its own or an unknown video is dropped alone, not the day's review with it (review 20.10.2026).
  const hypothesis = review.hypothesis;
  if (
    period === 'week' ||
    hypothesis === undefined ||
    hypothesis.text === '' ||
    namesUnknown(hypothesis.text) ||
    unverifiedNumbers({ main: '', points: [], question: '', steps: [], hypothesis }, input.facts).length > 0
  ) {
    const { hypothesis: _dropped, ...rest } = review;
    review = rest;
  }
  review = {
    ...review,
    points: review.points.filter((point) => !namesUnknown(point.text)).slice(0, POINTS_MAX[period]),
    steps: review.steps.filter((step) => !namesUnknown(step)).slice(0, STEPS_MAX[period])
  };
  if (unverifiedNumbers(review, input.facts).length > 0)
    return { review: null, errorCode: 'AI_NUMBERS_UNVERIFIED', model: result.model, usageId, budgetEvents };
  return { review, errorCode: null, model: result.model, usageId, budgetEvents };
}
