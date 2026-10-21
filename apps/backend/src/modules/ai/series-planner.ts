import { z } from 'zod';
import type { Clock } from '../../platform/clock';
import type { AiRepository } from './d1-ai-repository';
import { AiProviderError, type AiTextProvider } from './ports';
import { assertAiReady, type BudgetEvent, readAiSettings, recordAiUsage } from './service';

// The plan of a series of posts about one Dota event (owner, 21.10.2026: «в 1 пост не сделаешь… разбить красиво»):
// how many posts, one topic each, in an order that reads well, which of Valve's texts and media each one takes.
// Each post is then written by the writer from its own facts; the plan itself writes no post text.

export const SERIES_POSTS_MIN = 2;
export const SERIES_POSTS_MAX = 6;
const MEDIA_PER_POST_MAX = 4;
const MAX_OUTPUT_TOKENS = 4_000;

const INSTRUCTIONS = [
  'Ты редактор Telegram-канала про Доту. Тебе дают официальный материал Valve об одном событии: анонс и тексты',
  'страницы события (ключ — текст), и список картинок и видео страницы. Составь план серии постов, а не сами посты.',
  '',
  'Правила:',
  `- От ${SERIES_POSTS_MIN} до ${SERIES_POSTS_MAX} постов. Сколько — решает материал: тема, о которой нечего сказать, не пост.`,
  '- Первый пост — новость: что вышло и самое цепляющее для игрока. Дальше каждый пост — одна тема, которая интересна',
  '  сама по себе (как устроено событие и что за него дают; сокровищница и сеты; новые облики и персонажи; платный',
  '  комплект и т. п.). Порядок логичный: от общего к частному. Темы не повторяют друг друга.',
  '- Событие большое, посты должны быть интересными, а не сухими: в brief назови 2–3 самых интересных игроку детали и',
  '  угол подачи (что смешного или неожиданного в этой теме), а не «перечислить всё».',
  '- Для каждого поста: topic — короткое название темы; brief — 1–3 фразы, что именно рассказать и чем это важно',
  '  игроку; texts — ключи текстов, из которых брать факты (только из списка, все нужные); media — номера картинок и',
  `  видео из списка, которые подходят посту (до ${MEDIA_PER_POST_MAX}, лучше 1–2 самых наглядных; видео — номер с «видео»).`,
  '- Ничего не выдумывай: тема без фактов в материале — не тема.'
].join('\n');

export const SERIES_PLAN_JSON_SCHEMA: { name: string; schema: Record<string, unknown> } = {
  name: 'series_plan',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['posts'],
    properties: {
      posts: {
        type: 'array',
        maxItems: SERIES_POSTS_MAX,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['topic', 'brief', 'texts', 'media'],
          properties: {
            topic: { type: 'string' },
            brief: { type: 'string' },
            texts: { type: 'array', items: { type: 'string' } },
            media: { type: 'array', items: { type: 'integer' } }
          }
        }
      }
    }
  }
};

const planSchema = z.object({
  posts: z
    .array(
      z.object({
        topic: z.string().trim().min(1).max(120),
        brief: z.string().trim().min(1).max(600),
        texts: z.array(z.string().max(120)).max(80),
        media: z.array(z.number().int().nonnegative()).max(20)
      })
    )
    .max(SERIES_POSTS_MAX)
});

export interface SeriesPlanPost {
  topic: string;
  brief: string;
  /** Keys of the page texts this post is written from (only known ones). */
  texts: string[];
  /** Indexes into the media list given to the planner (only valid ones), at most four. */
  media: number[];
}

export interface SeriesPlannerDeps {
  repo: AiRepository;
  clock: Clock;
  timezone: string;
  newId: () => string;
  provider: AiTextProvider | null;
}

/**
 * The series plan, or why there is none: AI off or out of budget (AppError UNAVAILABLE is thrown, as everywhere),
 * a provider failure, or an answer of the wrong shape. Unknown text keys and media numbers are dropped, not guessed.
 */
export async function planSeries(
  deps: SeriesPlannerDeps,
  input: {
    title: string;
    announcement: string;
    texts: readonly { key: string; text: string }[];
    /** Names of the media, in the order their numbers refer to; a video's name says «видео». */
    media: readonly string[];
    signal: AbortSignal;
  }
): Promise<{ posts: SeriesPlanPost[] | null; errorCode: string | null; budgetEvents: BudgetEvent[] }> {
  const settings = await readAiSettings(deps.repo);
  // The draft model: the plan decides what the channel says about an event (owner: quality first).
  const { provider, model } = await assertAiReady(deps, settings, settings.draftModel ?? settings.cheapModel);
  const material = [
    `СОБЫТИЕ: ${input.title}`,
    `АНОНС (английский):\n<<<${input.announcement.replaceAll('>>>', '> > >')}>>>`,
    `ТЕКСТЫ СТРАНИЦЫ:\n${input.texts.map((text) => `${text.key}: ${text.text}`).join('\n')}`,
    `МЕДИА:\n${input.media.map((name, index) => `${index}: ${name}`).join('\n')}`
  ].join('\n\n');
  let result;
  try {
    result = await provider.complete({
      model,
      instructions: INSTRUCTIONS,
      input: material,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      jsonSchema: SERIES_PLAN_JSON_SCHEMA,
      signal: input.signal
    });
  } catch (error) {
    if (!(error instanceof AiProviderError)) throw error;
    return { posts: null, errorCode: error.code, budgetEvents: [] };
  }
  const budgetEvents = await recordAiUsage(deps, {
    id: deps.newId(),
    kind: 'other',
    provider: provider.provider,
    model: result.model,
    usage: result.usage,
    settings
  });
  let parsed: z.infer<typeof planSchema>;
  try {
    parsed = planSchema.parse(JSON.parse(result.text));
  } catch {
    return { posts: null, errorCode: 'AI_BAD_FORMAT', budgetEvents };
  }
  const keys = new Set(input.texts.map((text) => text.key));
  const posts = parsed.posts.map((post) => ({
    topic: post.topic,
    brief: post.brief,
    texts: [...new Set(post.texts.filter((key) => keys.has(key)))],
    media: [...new Set(post.media.filter((index) => index < input.media.length))].slice(0, MEDIA_PER_POST_MAX)
  }));
  if (posts.length < SERIES_POSTS_MIN || posts.some((post) => post.texts.length === 0))
    return { posts: null, errorCode: 'AI_BAD_PLAN', budgetEvents };
  return { posts, errorCode: null, budgetEvents };
}
