import { z } from 'zod';
import type { Clock } from '../../platform/clock';
import type { AiRepository } from './d1-ai-repository';
import { AiProviderError, type AiTextProvider } from './ports';
import { assertAiReady, readAiSettings, recordAiUsage } from './service';

// A build of the game's files changes something a player sees in only a few builds (owner, 23.10.2026: 07–22.10 gave
// the Terrorblade arcana in the files, effect slots for abilities of 11 heroes, persona portraits in the hero grid, a
// Trove gifting notice). One cheap call says which, before the writer is paid and before the owner hears of it.

const TEXT_MAX = 14_000;
const ANSWER_SCHEMA = {
  name: 'game_files_check',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['worth', 'reason'],
    properties: { worth: { type: 'boolean' }, reason: { type: 'string' } }
  }
};
const answerSchema = z.object({ worth: z.boolean(), reason: z.string().max(400) });

const INSTRUCTIONS = [
  'Ты — редактор Telegram-канала про Dota 2. Перед тобой изменённые строки файлов игры из новой сборки (строки «-» убраны, «+» добавлены).',
  'worth = true, только если игроку интересно узнать о находке: тихое изменение героя, способности или предмета (числа), новый контент в строках или файлах — ивент, герой, аркана, сет, режим, новая механика или функция, — заметный намёк на будущее обновление. Служебные правки, перестановки, исправления опечаток и технические строки — worth = false.',
  'reason — одна короткая фраза по-русски: что именно нашли или почему это неинтересно.'
].join('\n');

/** Whether a build's changes are worth a post; null when the AI could not say (off, out of budget, a failure). */
export async function gameFilesWorthPost(
  deps: {
    repo: AiRepository;
    clock: Clock;
    timezone: string;
    newId: () => string;
    provider: AiTextProvider | null;
  },
  input: { diff: string; signal: AbortSignal }
): Promise<{ worth: boolean; reason: string } | null> {
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
      input: `<<<${input.diff.slice(0, TEXT_MAX).replaceAll('>>>', '> > >').replaceAll('<<<', '< < <')}>>>`,
      maxOutputTokens: 1_000,
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
    return answerSchema.parse(JSON.parse(result.text));
  } catch {
    return null;
  }
}
