import { z } from 'zod';
import type { Clock } from '../../platform/clock';
import type { AiRepository } from './d1-ai-repository';
import { AiProviderError, type AiTextProvider } from './ports';
import { assertAiReady, readAiSettings, recordAiUsage } from './service';

// A Steam «Dota 2 Update - <date>» lists fixes; most are of no interest to a player, some are news (owner,
// 22.10.2026): event rewards changed, a hidden nerf, a funny bug. One cheap call says which, before the writer is paid.

const TEXT_MAX = 3_500;
const ANSWER_SCHEMA = {
  name: 'hotfix_check',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['worth', 'reason'],
    properties: { worth: { type: 'boolean' }, reason: { type: 'string' } }
  }
};
const answerSchema = z.object({ worth: z.boolean(), reason: z.string().max(400) });

const INSTRUCTIONS = [
  'Ты — редактор Telegram-канала про Dota 2. Перед тобой список исправлений из обновления Valve.',
  'worth = true, только если в нём есть что-то, о чём игроку интересно узнать: изменились награды события или способ их получить, заметное изменение героя или предмета (скрытое усиление или ослабление), смешной или громкий баг, который чинят. Обычные мелкие исправления интерфейса и вылетов — worth = false.',
  'reason — одна короткая фраза по-русски: что именно интересно или почему нет.'
].join('\n');

/** Whether a hotfix is worth a post; null when the AI could not say (off, out of budget, a failure). */
export async function hotfixWorthPost(
  deps: {
    repo: AiRepository;
    clock: Clock;
    timezone: string;
    newId: () => string;
    provider: AiTextProvider | null;
  },
  input: { text: string; signal: AbortSignal }
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
      input: `<<<${input.text.slice(0, TEXT_MAX).replaceAll('>>>', '> > >').replaceAll('<<<', '< < <')}>>>`,
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
