import { z } from 'zod';
import type { Clock } from '../../platform/clock';
import type { AiRepository } from './d1-ai-repository';
import { AiProviderError, type AiTextProvider } from './ports';
import { assertAiReady, type BudgetEvent, readAiSettings, recordAiUsage } from './service';

// The AI review of the daily analytics report (AI plan P6; owner 19.10.2026: «сводку от ИИ: что не заходит, что
// набирает, гипотезы почему»). Code computes every number; the model only explains them (plan §5). It sees the
// facts block alone, may only repeat its numbers (checked here), and names videos by their key, never retyped.

/** Room for a reasoning model's thinking before a short structured answer. */
const MAX_OUTPUT_TOKENS = 3000;
/** Short fields keep the whole message under Telegram's 4096 characters with the numbers below it. */
const SUMMARY_MAX = 300;
const NOTE_MAX = 160;

/** What the review is about: the day's videos, or the week's with its themes and rubrics. */
const PERIOD = {
  day: 'Пишешь короткий разбор дня для автора: что заходит, что нет и почему, без воды.',
  week: 'Пишешь разбор недели для автора: какие темы и рубрики заходили, какие нет и почему, что повторить на следующей неделе, без воды. Ролики называй ключами V1…, посты P1….'
} as const;

const INSTRUCTIONS = [
  'Ты — аналитик канала автора ALEXEEV (шортсы про Доту на YouTube и TikTok, Telegram-канал).',
  'ДАННЫЕ ниже — единственный источник. Каждое число в ответе бери только оттуда, слово в слово, со знаком и единицей (например «2.7к», «+80%», «−40%», «+173»). Новых чисел не считай и не придумывай: не «в 2 раза», не «10 тысяч».',
  'Ролик называй только его ключом из данных в полях video; в текстах названия не повторяй.',
  'Нельзя: удержание, досмотры, секунды, CTR, причины «по алгоритму» — этих данных нет. Не обещай рост.',
  'Гипотезы «почему» — только для роликов с пометкой «сравнение надёжное», по тому, что видно: тема, рубрика, возраст, название, а если есть сценарий — его начало (хук): сразу ли косяк или шутка, или заход через объяснение героя. Уверенность только low или medium. Где сравнение слабое — гипотез нет.',
  'rising — до 3 роликов выше обычного или с заметным приростом; weak — до 3 роликов ниже обычного. summary — 1–3 предложения о дне. next — один конкретный совет для следующего ролика. Пустое поле допустимо, выдумывать нельзя.',
  'Пиши по-русски, просто и коротко, как другу-автору.'
].join('\n');

export const ANALYTICS_REVIEW_JSON_SCHEMA: { name: string; schema: Record<string, unknown> } = {
  name: 'analytics_review',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'rising', 'weak', 'next'],
    properties: {
      summary: { type: 'string' },
      rising: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['video', 'note'],
          properties: { video: { type: 'string' }, note: { type: 'string' } }
        }
      },
      weak: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['video', 'note', 'hypotheses'],
          properties: {
            video: { type: 'string' },
            note: { type: 'string' },
            hypotheses: {
              type: 'array',
              maxItems: 2,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['text', 'confidence'],
                properties: { text: { type: 'string' }, confidence: { type: 'string', enum: ['low', 'medium'] } }
              }
            }
          }
        }
      },
      next: { type: 'string' }
    }
  }
};

const line = (max: number) =>
  z.string().transform((value) => Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, max).join(''));
export const analyticsReviewSchema = z.object({
  summary: line(SUMMARY_MAX),
  rising: z.array(z.object({ video: z.string(), note: line(NOTE_MAX) })).max(3),
  weak: z
    .array(
      z.object({
        video: z.string(),
        note: line(NOTE_MAX),
        hypotheses: z.array(z.object({ text: line(NOTE_MAX), confidence: z.enum(['low', 'medium']) })).max(2)
      })
    )
    .max(3),
  next: line(SUMMARY_MAX)
});
export type AnalyticsReview = z.infer<typeof analyticsReviewSchema>;

/** Small bare counts («3 ролика», «из 4») may be said freely; any other number must come from the facts as is. */
const FREE_NUMBER_MAX = 12;
// A number with its sign and unit, so «40%» does not pass for «−40%» nor «173к» for «+173».
// «к», «м», «ч» count as a unit only on their own («4 места» is a count, «4м» is not); «тысяч», «раза» do.
const NUMBER = /[+\-−]?\d+(?:[.,]\d+)?(?:\s?(?:%|тыс[а-яё]*|млн[а-яё]*|раз[а-яё]*|[кмч](?![а-яё])))?/gi;
const normal = (value: string) => value.replace(',', '.').replace('-', '−').replace(/\s/g, '').toLowerCase();
const bareSmall = (value: string) => /^\d+$/.test(value) && Number(value) <= FREE_NUMBER_MAX;

/** The facts' lines about one video: each starts with its key («Y1 «Пудж» · …»). */
export function videoFacts(facts: string, video: string): string {
  return facts
    .split('\n')
    .filter((line) => line.trimStart().startsWith(`${video} `))
    .join('\n');
}

const numbersOf = (text: string) => new Set((text.match(NUMBER) ?? []).map(normal));
const missing = (texts: readonly string[], known: Set<string>) =>
  texts
    .flatMap((text) => text.match(NUMBER) ?? [])
    .map(normal)
    .filter((value) => !known.has(value) && !bareSmall(value));

/**
 * The numbers of the review that the facts do not contain; empty when the review only repeats them. A note about a
 * video may only use that video's own numbers (review 19.10.2026: another video's real number passed the old check).
 */
export function unverifiedNumbers(review: AnalyticsReview, facts: string): string[] {
  const rows = [
    ...review.rising.map((row) => ({ video: row.video, texts: [row.note] })),
    ...review.weak.map((row) => ({
      video: row.video,
      texts: [row.note, ...row.hypotheses.map((hypothesis) => hypothesis.text)]
    }))
  ];
  return [
    ...missing([review.summary, review.next], numbersOf(facts)),
    ...rows.flatMap((row) => missing(row.texts, numbersOf(videoFacts(facts, row.video))))
  ];
}

/** A hypothesis only where the video's comparison is reliable: checked here, not left to the instructions. */
export function reliableComparison(facts: string, video: string): boolean {
  return videoFacts(facts, video).includes('сравнение надёжное');
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
  const settings = await readAiSettings(deps.repo);
  // The draft model, as for the owner's scripts: the review is read every day (owner: quality first).
  const { provider, model } = await assertAiReady(deps, settings, settings.draftModel ?? settings.cheapModel);
  let result;
  try {
    result = await provider.complete({
      model,
      instructions: `${INSTRUCTIONS}\n${PERIOD[input.period ?? 'day']}`,
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
  // A video the facts do not list is dropped rather than guessed.
  review = {
    ...review,
    rising: review.rising.filter((row) => known.has(row.video)),
    weak: review.weak
      .filter((row) => known.has(row.video))
      .map((row) => (reliableComparison(input.facts, row.video) ? row : { ...row, hypotheses: [] }))
  };
  if (unverifiedNumbers(review, input.facts).length > 0)
    return { review: null, errorCode: 'AI_NUMBERS_UNVERIFIED', model: result.model, usageId, budgetEvents };
  return { review, errorCode: null, model: result.model, usageId, budgetEvents };
}
