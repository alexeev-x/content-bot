import type { Clock } from '../../platform/clock';
import type { AiRepository } from './d1-ai-repository';
import { AiProviderError, type AiTextProvider } from './ports';
import { assertAiReady, readAiSettings, recordAiUsage } from './service';

// A big patch's notes (7.41: 120 000 characters) read by the cheap model before the writer (owner, 23.10.2026:
// «дешёвая модель уберёт лишнее»): every hero and item stays with what changed, which way and the numbers; Valve's
// wording, repeats and trivia go. The writer then judges every hero, not the few that fit.

/** The writer takes 60 000 characters of facts; the summary stays well inside it. */
const ANSWER_MAX = 45_000;
const MAX_OUTPUT_TOKENS = 16_000;

const INSTRUCTIONS = [
  'Ты готовишь выжимку патчноутов Dota 2 для автора поста. Оставь всё, что важно игроку, выкинь только воду.',
  'Формат, без markdown: раздел «ГЛАВНОЕ» — все общие изменения Valve коротко; затем «Герои:» — КАЖДЫЙ герой из патча строкой «Имя (усилен | ослаблен | поровну | мелочь): изменения с числами было → стало»; затем «Предметы:» и «Нейтральные предметы:» так же.',
  'Направление суди по сути: меньше перезарядка, больше урон или длительность — усиление; наоборот — ослабление. Не пропускай ни одного героя или предмета, не выдумывай и не объединяй разные изменения в одно. Имена оставь как у Valve, по-английски.'
].join('\n');

/** The condensed notes, or null when the AI could not make them (off, out of budget, a failure, an empty answer). */
export async function condensePatchNotes(
  deps: {
    repo: AiRepository;
    clock: Clock;
    timezone: string;
    newId: () => string;
    provider: AiTextProvider | null;
  },
  input: { notes: string; signal: AbortSignal }
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
      input: `<<<${input.notes.replaceAll('>>>', '> > >').replaceAll('<<<', '< < <')}>>>`,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
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
  // A summary cut at the output cap misses the last heroes and items: the cut notes are better (QA 23.10.2026).
  if (result.truncated === true) return null;
  const text = result.text.trim();
  return text === '' ? null : text.slice(0, ANSWER_MAX);
}
