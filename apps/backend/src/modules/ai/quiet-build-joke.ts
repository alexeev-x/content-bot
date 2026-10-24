import { z } from 'zod';
import type { Clock } from '../../platform/clock';
import type { AiRepository } from './d1-ai-repository';
import { AiProviderError, type AiTextProvider } from './ports';
import { assertAiReady, readAiSettings, recordAiUsage } from './service';

// A build of the game with nothing in it still gets one short post (owner, 24.10.2026): a joke, «всегда разные» — the
// owner's «Valve подняла сборку, ничего такого нет, просто ИИ мутит воду, чтобы ты больше фидил» was only an example.
// One cheap call per build; the theme is drawn at random so jokes do not repeat each other.

const ANSWER_SCHEMA = {
  name: 'quiet_build_joke',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['joke'],
    properties: { joke: { type: 'string' } }
  }
};
const answerSchema = z.object({ joke: z.string().min(10).max(300) });

/** What the joke plays on; one is drawn per build. */
export const QUIET_BUILD_THEMES = [
  'фид и смерти',
  'Рошан',
  'варды и даст',
  'мидер, который не отдаёт руны',
  'саппорт без ботинок',
  'рейтинг и калибровка',
  'ливеры',
  'пинг и лаги',
  'Пудж и хуки',
  'крипы и ластхит',
  'патч, которого все ждут',
  'Valve и её молчание'
] as const;

const INSTRUCTIONS = [
  'Ты пишешь для русскоязычного Telegram-канала про Dota 2, в голосе автора: коротко, по-свойски, с иронией, можно сленг игроков.',
  'Valve выпустила новую сборку игры, в файлах покопались — ничего интересного для игрока там нет.',
  'Напиши одну короткую смешную фразу (до 200 знаков): что сборка вышла, номер сборки, что ничего не нашли, и шутку на заданную тему.',
  'Пример тона, не повторяй его: «Valve подняла сборку 6967 — ничего такого нет, просто ИИ мутит воду, чтобы ты больше фидил.»',
  'Только русский текст, без хэштегов, без кавычек вокруг всей фразы, без ссылок, не выдумывай изменений.'
].join('\n');

/** One joke about a quiet build, or null when the AI could not write it (off, out of budget, a failure). */
export async function quietBuildJoke(
  deps: { repo: AiRepository; clock: Clock; timezone: string; newId: () => string; provider: AiTextProvider | null },
  input: { build: string; theme: string; signal: AbortSignal }
): Promise<string | null> {
  const settings = await readAiSettings(deps.repo);
  let ready;
  try {
    ready = await assertAiReady(deps, settings, settings.cheapModel ?? settings.draftModel);
  } catch {
    return null;
  }
  let result;
  try {
    result = await ready.provider.complete({
      model: ready.model,
      instructions: INSTRUCTIONS,
      input: `Сборка: ${input.build}\nТема шутки: ${input.theme}`,
      maxOutputTokens: 400,
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
    const joke = answerSchema.parse(JSON.parse(result.text)).joke.trim();
    // A joke without the build number or with an address is not this post's.
    return joke.includes(input.build) && !/https?:|www\./iu.test(joke) ? joke : null;
  } catch {
    return null;
  }
}
