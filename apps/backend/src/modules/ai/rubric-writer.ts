import { z } from 'zod';
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

/** The AI's caption, or null when the AI is off, out of budget, failed, or dropped a number of the draft. */
export async function writeRubricCaption(
  deps: { repo: AiRepository; clock: Clock; timezone: string; newId: () => string; provider: AiTextProvider | null },
  input: {
    title: string;
    draft: string;
    poll: string | null;
    /** The rubric's own task: how its post is built and how it ends. */
    brief: string;
    signal: AbortSignal;
  }
): Promise<string | null> {
  // A link (a Workshop page) is kept by code under the text: the writer never sees or writes an address.
  const links = input.draft.match(URL_PATTERN) ?? [];
  const draft = input.draft.replace(URL_PATTERN, '').trim();
  const settings = await readAiSettings(deps.repo);
  let ready;
  try {
    ready = await assertAiReady(deps, settings, settings.draftModel);
  } catch {
    return null;
  }
  let result;
  try {
    result = await ready.provider.complete({
      model: ready.model,
      instructions: instructionsFor(input.brief),
      input: [
        `Рубрика: ${input.title}`,
        `Черновик:\n${draft}`,
        input.poll === null ? 'Опроса нет.' : `Опрос под постом: ${input.poll}`
      ].join('\n\n'),
      // Room for a reasoning model's thinking.
      maxOutputTokens: 4_000,
      jsonSchema: ANSWER_SCHEMA,
      signal: input.signal
    });
  } catch (error) {
    if (error instanceof AiProviderError) return null;
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
  try {
    const text = answerSchema.parse(JSON.parse(result.text)).text;
    // A caption that lost a number of the draft or carries an address is not this post's.
    const kept = draftNumbers(draft).every((number) => text.includes(number));
    if (!kept || /https?:|www\./iu.test(text)) return null;
    return links.length === 0 ? text : `${text}\n\n${links.join('\n')}`;
  } catch {
    return null;
  }
}
