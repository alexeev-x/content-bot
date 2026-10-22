import { z } from 'zod';
import { AiProviderError } from './ports';
import { assertAiReady, type BudgetEvent, readAiSettings, recordAiUsage } from './service';
import { generateDraft, rewriteDraft, type WriterDeps, type WriterResult } from './writer';

// A second pass over an automatic draft (owner, 21.10.2026, after «Пророчества его игнорируют, потому что он всех
// бесит»): one call compares the draft with its task's facts and names every claim the facts do not support; when it
// names any, the writer fixes exactly those through the owner-remark rewrite. Style, retelling in other words and
// a reaction that states no fact are not its business.

const MAX_OUTPUT_TOKENS = 1_500;
const PROBLEMS_MAX = 6;

const INSTRUCTIONS = [
  'Ты фактчекер Telegram-канала про Доту. Тебе дают задание с фактами и черновик поста по нему.',
  'Найди в черновике утверждения, которых нет в фактах задания: выдуманные детали, причины, характеристики героев,',
  'числа, имена, а также шутки, построенные на выдуманном факте. Пересказ своими словами, оценки и реакции автора',
  '(«неплохо», «до чего дожили»), стиль и сленг — не ошибки, их не трогай.',
  'Ответ: problems — до 6 пунктов, quote — фраза из черновика дословно, why — чего из этого нет в фактах. Если всё',
  'подтверждается фактами — пустой список.'
].join('\n');

export const FACT_CHECK_JSON_SCHEMA: { name: string; schema: Record<string, unknown> } = {
  name: 'fact_check',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['problems'],
    properties: {
      problems: {
        type: 'array',
        maxItems: PROBLEMS_MAX,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['quote', 'why'],
          properties: { quote: { type: 'string' }, why: { type: 'string' } }
        }
      }
    }
  }
};

const answerSchema = z.object({
  problems: z
    .array(z.object({ quote: z.string().trim().min(1).max(400), why: z.string().trim().min(1).max(300) }))
    .max(PROBLEMS_MAX)
});

/** The claims of a draft its task does not support; empty when all hold, null when the check could not run. */
export async function checkFacts(
  deps: WriterDeps,
  input: { task: string; text: string; signal: AbortSignal }
): Promise<{ problems: { quote: string; why: string }[] | null; budgetEvents: BudgetEvent[] }> {
  const settings = await readAiSettings(deps.repo);
  const { provider, model } = await assertAiReady(deps, settings, settings.draftModel ?? settings.cheapModel);
  let result;
  try {
    result = await provider.complete({
      model,
      instructions: INSTRUCTIONS,
      input: `ЗАДАНИЕ С ФАКТАМИ:\n${input.task}\n\nЧЕРНОВИК:\n<<<${input.text.replaceAll('>>>', '> > >')}>>>`,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      jsonSchema: FACT_CHECK_JSON_SCHEMA,
      signal: input.signal
    });
  } catch (error) {
    if (!(error instanceof AiProviderError)) throw error;
    return { problems: null, budgetEvents: [] };
  }
  const budgetEvents = await recordAiUsage(deps, {
    id: deps.newId(),
    kind: 'other',
    provider: result.provider ?? provider.provider,
    model: result.model,
    usage: result.usage,
    settings
  });
  try {
    return { problems: answerSchema.parse(JSON.parse(result.text)).problems, budgetEvents };
  } catch {
    return { problems: null, budgetEvents };
  }
}

/**
 * An automatic draft with its facts checked: the draft, then the check, then — only when the check names claims the
 * facts do not support — a fix of exactly those. The fix is a version of the same draft, so the owner sees and
 * approves the checked text. A failed check or fix leaves the first draft as it is.
 */
export async function generateCheckedDraft(
  deps: WriterDeps,
  input: Parameters<typeof generateDraft>[1]
): Promise<WriterResult> {
  const draft = await generateDraft(deps, input);
  if (draft.text === null || draft.generation.result === 'needs_facts') return draft;
  const check = await checkFacts(deps, { task: draft.generation.task, text: draft.text, signal: input.signal });
  const budgetEvents = [...draft.budgetEvents, ...check.budgetEvents];
  if (check.problems === null) return { ...draft, budgetEvents, factCheck: 'unchecked' };
  if (check.problems.length === 0) return { ...draft, budgetEvents, factCheck: 'clean' };
  const note = [
    'Проверка фактов: этого нет в фактах задания — убери или перепиши по фактам, остальное оставь как есть.',
    ...check.problems.map((problem) => `— «${problem.quote}»: ${problem.why}`)
  ]
    .join('\n')
    .slice(0, 1_000);
  try {
    const fixed = await rewriteDraft(deps, {
      generationId: draft.generation.id,
      instruction: 'исправить по проверке фактов',
      remark: { note, reason: null },
      signal: input.signal
    });
    if (fixed.text === null)
      return { ...draft, budgetEvents: [...budgetEvents, ...fixed.budgetEvents], factCheck: 'unchecked' };
    return { ...fixed, budgetEvents: [...budgetEvents, ...fixed.budgetEvents], factCheck: 'fixed' };
  } catch {
    return { ...draft, budgetEvents, factCheck: 'unchecked' };
  }
}
