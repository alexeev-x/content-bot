import { z } from 'zod';
import type { Clock } from '../../platform/clock';
import type { AiRepository } from './d1-ai-repository';
import type { JokeRepository } from './d1-joke-repository';
import { AiProviderError, type AiTextProvider } from './ports';
import { assertAiReady, readAiSettings, recordAiUsage } from './service';

// A build of the game with nothing in it still gets one short post (owner, 24.10.2026): a joke, «всегда разные».
// The writer (the cheap model) offers three; a critic (the draft model) keeps the best, sharpens it or turns them
// all down (owner, 27.10.2026: a joke that misses — «молчание на уровне Immortal» — must not go out on its own).
// What the critic lets through goes into the joke bank, and the writer reads a few of those as examples: the only
// way a model «learns» between calls. Turned-down jokes are never shown to the writer: it copies what it is shown.

/** A fallback angle when the post's own detail (the +1 in the diff) gives the writer nothing; one is drawn per build. */
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
  'патч, которого все ждут'
] as const;

/**
 * The tone the owner picked (24.10 and 27.10.2026: «можно ещё жёстче»): short, crude, playing on the +1 the post
 * shows. A few are drawn into every request, so the bank's own jokes never drift alone and no seed is copied each time.
 */
const SEED_JOKES = [
  'Valve подняла сборку — ничего такого нет, просто ИИ мутит воду, чтобы ты больше фидил.',
  'Это количество писюнов увеличилось у меня в жопе, хвастаюсь...',
  '+1 к версии, −25 к твоему MMR. Баланс соблюдён.',
  'Номер сборки вырос сильнее, чем твой винрейт за месяц.',
  'Сборка +1, изменений ноль. Прямо как ты после просмотра гайдов.',
  'Новая сборка весит как твой вклад в катку: ровно единичка.',
  '+1 в версии, а у тебя в жопе вся команда противника. Всё как обычно.',
  '+1 хуёв в твоей жопе.'
];
const SEED_EXAMPLES = 3;
/** Bank jokes the writer sees, drawn from the newest. */
const BANK_EXAMPLES = 3;
const BANK_WINDOW = 20;
const CANDIDATES = 3;

const WRITER_SCHEMA = {
  name: 'quiet_build_jokes',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['jokes'],
    properties: { jokes: { type: 'array', items: { type: 'string' } } }
  }
};
const writerSchema = z.object({ jokes: z.array(z.string()).max(5) });

const CRITIC_SCHEMA = {
  name: 'quiet_build_joke_verdict',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['joke'],
    properties: { joke: { type: 'string' } }
  }
};
const criticSchema = z.object({ joke: z.string().max(400) });

const VOICE =
  'Русскоязычный Telegram-канал про Dota 2, голос автора: коротко, по-свойски, жёстко и грубо, мат можно, сленг игроков, как пишут в комментах.';

const WRITER_INSTRUCTIONS = [
  VOICE,
  'Valve выпустила сборку игры, в файлах ничего интересного для игрока. Пост — одна фраза и diff версии под ней.',
  `Напиши ${CANDIDATES} разные короткие шутки (каждая до 200 знаков) для этой фразы.`,
  'Лучший повод — то, что видно в посте: номер вырос на единицу. Выверни это в абсурд про игроков, героев, катки.',
  'Не пересказывай новость («сборка вышла», «ничего нет», «Valve молчит») вместо шутки и не объясняй шутку.',
  'Номер сборки писать не нужно: он и так в diff.',
  'Примеры ниже — только тон, не повторяй их.',
  'Только русский текст, без хэштегов, без кавычек вокруг фразы, без ссылок, не выдумывай изменений.'
].join('\n');

const CRITIC_INSTRUCTIONS = [
  VOICE,
  'Ты редактор юмора. Тебе дают варианты фразы к посту о пустой сборке Dota 2; под фразой в посте стоит diff версии.',
  'Отбрось вариант, если: метафора не складывается; он пересказывает новость вместо шутки; игрок Dota не поймёт;',
  'шутка объяснена; длинно; есть английский текст, кроме имён.',
  'Смешнее всего цепляться за то, что видно в посте (единица в номере), и выворачивать в абсурд.',
  'Верни лучший вариант как есть или сделай его смешнее и короче (до 200 знаков).',
  'Если ни один не смешной и не чинится — верни пустую строку: лучше простая строка, чем плохая шутка.'
].join('\n');

/** A joke fit for the post, trimmed; null when it is empty, too short or long, or carries an address. */
export function cleanJoke(text: string): string | null {
  const joke = text.trim();
  return joke.length >= 10 && joke.length <= 200 && !/https?:|www\.|t\.me\//iu.test(joke) ? joke : null;
}

type Deps = {
  repo: AiRepository;
  jokes: JokeRepository;
  clock: Clock;
  timezone: string;
  newId: () => string;
  random: () => number;
  provider: AiTextProvider | null;
};

/**
 * One joke about a quiet build, kept in the bank; null when the critic turned every variant down or the AI could not
 * run (off, out of budget, a failure) — the post then takes one of its fixed lines.
 */
export async function quietBuildJoke(
  deps: Deps,
  input: { build: string; previous: string | null; theme: string; signal: AbortSignal }
): Promise<string | null> {
  const settings = await readAiSettings(deps.repo);
  let writer;
  let critic;
  try {
    writer = await assertAiReady(deps, settings, settings.cheapModel ?? settings.draftModel);
    critic = await assertAiReady(deps, settings, settings.draftModel ?? settings.cheapModel);
  } catch {
    return null;
  }
  const diff = [
    ...(input.previous === null ? [] : [`- ClientVersion=${input.previous}`]),
    `+ ClientVersion=${input.build}`
  ].join('\n');
  const bank = await deps.jokes.recent(BANK_WINDOW);
  const examples = [...draw(SEED_JOKES, SEED_EXAMPLES, deps.random), ...draw(bank, BANK_EXAMPLES, deps.random)];

  const written = await call(deps, settings, writer, {
    instructions: WRITER_INSTRUCTIONS,
    input: `Diff в посте:\n${diff}\n\nЕсли про единицу не придумывается, тема: ${input.theme}\n\nПримеры тона:\n${examples.map((joke) => `— ${joke}`).join('\n')}`,
    maxOutputTokens: 1000,
    jsonSchema: WRITER_SCHEMA,
    signal: input.signal
  });
  if (written === null) return null;
  const candidates = parse(writerSchema, written)
    ?.jokes.map(cleanJoke)
    .filter((joke): joke is string => joke !== null)
    .slice(0, CANDIDATES);
  if (candidates === undefined || candidates.length === 0) return null;

  const judged = await call(deps, settings, critic, {
    instructions: CRITIC_INSTRUCTIONS,
    input: `Diff в посте:\n${diff}\n\nВарианты:\n${candidates.map((joke, index) => `${index + 1}. ${joke}`).join('\n')}`,
    maxOutputTokens: 2000,
    jsonSchema: CRITIC_SCHEMA,
    signal: input.signal
  });
  if (judged === null) return null;
  const joke = cleanJoke(parse(criticSchema, judged)?.joke ?? '');
  if (joke === null) return null;
  await deps.jokes.save({ id: deps.newId(), build: input.build, text: joke, now: deps.clock.now() });
  return joke;
}

/** One model call with its usage recorded; null on a provider failure. */
async function call(
  deps: Deps,
  settings: Awaited<ReturnType<typeof readAiSettings>>,
  ready: { provider: AiTextProvider; model: string },
  request: Omit<Parameters<AiTextProvider['complete']>[0], 'model'>
): Promise<string | null> {
  let result;
  try {
    result = await ready.provider.complete({ model: ready.model, ...request });
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
  return result.text;
}

function parse<T>(schema: z.ZodType<T>, text: string): T | null {
  try {
    return schema.parse(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Up to `count` distinct items in random order. */
function draw(items: readonly string[], count: number, random: () => number): string[] {
  const pool = [...items];
  const drawn: string[] = [];
  while (drawn.length < count && pool.length > 0) drawn.push(...pool.splice(Math.floor(random() * pool.length), 1));
  return drawn;
}
