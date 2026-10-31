import { z } from 'zod';
import { AppError } from '../../shared/app-error';
import type { Clock } from '../../platform/clock';
import type { AiRepository } from './d1-ai-repository';
import { AiProviderError, type AiTextProvider } from './ports';
import { assertAiReady, readAiSettings, recordAiUsage } from './service';

// A rubric's caption written by the AI the way the channel would publish it (owner, 25.10.2026: «как будто продовская,
// через ИИ гони её»). The facts come from live data as a plain draft; the writer keeps every name and number and
// rewrites only the words. The draft model, not the cheap one: text quality first (owner, 19.10.2026).
// No meme list (owner, 25.10.2026: «причём тут мама Габена, непонятно»): a listed meme was pushed into every post.

const ANSWER_SCHEMA = {
  name: 'rubric_caption',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['text'],
    properties: { text: { type: 'string' } }
  }
};
// A photo caption holds 1024 characters.
const answerSchema = z.object({ text: z.string().trim().min(20).max(900) });

const RULES = [
  'Ты пишешь пост рубрики для русскоязычного Telegram-канала про Dota 2, в голосе автора: коротко, по-свойски, с иронией, сленг игроков, можно грубый юмор и мат.',
  'Тебе дают название рубрики, черновик с фактами из живых данных и опрос, если он есть. Перепиши черновик в живой пост: вступление в 1–2 строки, список, если он есть, и концовка.',
  'Название рубрики в тексте не повторяй и пост с него не начинай: оно уже на картинке.',
  'Все цифры, проценты, способности и предметы из черновика сохрани ровно как есть; ничего не добавляй от себя и не выдумывай фактов.',
  'Шутка — только если она прямо про эти факты и понятна любому игроку с первого прочтения; лучше без шутки, чем непонятная или притянутая. Не вставляй мемы ради мемов.',
  'Героев называй так, как говорят игроки (Котл, Пудж, ЦМка). Только русский текст, английские только имена; без хэштегов, ссылок и эмодзи-простыней; пост самостоятельный, не ссылайся на другие посты.'
];
// The rules every rubric gets: the channel's voice and the facts. How a post is built and how it ends is the
// rubric's own task (owner, 26.10.2026: «общее все получают, а уже детали рубрики — каждая свою инструкцию»),
// modules/rubrics/briefs.ts, given in the instructions too so it is never outweighed.
const instructionsFor = (brief: string) => [...RULES, `Задание этой рубрики:\n${brief}`].join('\n');

const draftNumbers = (text: string) => text.match(/\d+(?:[.,]\d+)?/g) ?? [];
const URL_PATTERN = /https?:\/\/\S+/g;

/** Why the AI gave no caption: the scheduler's breaker and the owner's message need the cause, not just «no text». */
export type RubricCaptionFailure = 'AI_NOT_READY' | 'PROVIDER_ERROR' | 'BAD_ANSWER' | 'NUMBER_LOST' | 'LINK_IN_TEXT';

export type RubricCaptionResult =
  { ok: true; text: string } | { ok: false; code: RubricCaptionFailure; detail?: string };

/** The AI's caption, or null when the AI is off, out of budget, failed, or dropped a number of the draft. */
export async function writeRubricCaption(...args: Parameters<typeof writeRubricCaptionTyped>): Promise<string | null> {
  const result = await writeRubricCaptionTyped(...args);
  return result.ok ? result.text : null;
}

/** The AI's caption, or the cause it gave none. */
export async function writeRubricCaptionTyped(
  deps: { repo: AiRepository; clock: Clock; timezone: string; newId: () => string; provider: AiTextProvider | null },
  input: {
    title: string;
    draft: string;
    poll: string | null;
    /** The rubric's own task: how its post is built and how it ends. */
    brief: string;
    /**
     * Background the writer reads but need not keep number by number (Valve's announcement for «Оцениваем»): its prices
     * and dates would otherwise all have to appear in a short post.
     */
    reference?: string;
    signal: AbortSignal;
  }
): Promise<RubricCaptionResult> {
  // A link (a Workshop page) is kept by code under the text: the writer never sees or writes an address.
  const links = input.draft.match(URL_PATTERN) ?? [];
  const draft = input.draft.replace(URL_PATTERN, '').trim();
  const settings = await readAiSettings(deps.repo);
  let ready;
  try {
    ready = await assertAiReady(deps, settings, settings.draftModel);
  } catch (error) {
    // Off, no key, no model or price, budget spent: `reason` names which.
    const reason = error instanceof AppError ? error.details?.['reason'] : undefined;
    return { ok: false, code: 'AI_NOT_READY', ...(reason === undefined ? {} : { detail: reason }) };
  }
  let result;
  try {
    result = await ready.provider.complete({
      model: ready.model,
      instructions: instructionsFor(input.brief),
      input: [
        `Рубрика: ${input.title}`,
        `Черновик:\n${draft}`,
        ...(input.reference === undefined
          ? []
          : [`Справка (факты для поста; цифры из неё переносить не обязательно):\n${input.reference}`]),
        input.poll === null ? 'Опроса нет.' : `Опрос под постом: ${input.poll}`
      ].join('\n\n'),
      // Room for a reasoning model's thinking.
      maxOutputTokens: 4_000,
      jsonSchema: ANSWER_SCHEMA,
      signal: input.signal
    });
  } catch (error) {
    if (error instanceof AiProviderError) return { ok: false, code: 'PROVIDER_ERROR', detail: error.code };
    throw error;
  }
  await recordAiUsage(deps, {
    id: deps.newId(),
    kind: 'other',
    provider: result.provider ?? ready.provider.provider,
    model: result.model,
    usage: result.usage,
    settings
  });
  let text;
  try {
    text = answerSchema.parse(JSON.parse(result.text)).text;
  } catch {
    return { ok: false, code: 'BAD_ANSWER' };
  }
  // A caption that lost a number of the draft or carries an address is not this post's.
  if (!draftNumbers(draft).every((number) => text.includes(number))) return { ok: false, code: 'NUMBER_LOST' };
  if (/https?:|www\./iu.test(text)) return { ok: false, code: 'LINK_IN_TEXT' };
  return { ok: true, text: links.length === 0 ? text : `${text}\n\n${links.join('\n')}` };
}
