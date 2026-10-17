import type { AiImproveAction, AiImproveResultDto } from '@alexeev/contracts';
import { z } from 'zod';
import { readAuthorProfile } from './author-profile';
import { AiProviderError } from './ports';
import { assertAiReady, type BudgetEvent, readAiSettings, recordAiUsage } from './service';
import type { WriterDeps } from './writer';
import { buildImprovePrompt } from './writer-prompt';

// «✦ Улучшить через ИИ» in the post editor (docs/design/ux/post-composer.md §4): one paid call that returns
// suggestions for a fragment of the post. Nothing is stored or sent; the owner applies a variant in the editor.

const MAX_HTML = 16_000;
const MAX_NOTE = 200;
/** A whole 4096-character post with tags, three times for «variants». */
const MAX_OUTPUT_TOKENS = { one: 4000, three: 9000 };

const IMPROVE_JSON_SCHEMA: { name: string; schema: Record<string, unknown> } = {
  name: 'improve_answer',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'variants', 'question'],
    properties: {
      kind: { type: 'string', enum: ['ready', 'needs_facts'] },
      variants: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['html', 'note'],
          properties: { html: { type: 'string' }, note: { type: 'string' } }
        }
      },
      question: { type: 'string' }
    }
  }
};

const answerSchema = z.object({
  kind: z.enum(['ready', 'needs_facts']),
  variants: z.array(z.object({ html: z.string(), note: z.string() })).max(3),
  question: z.string()
});

type Answer = Pick<AiImproveResultDto, 'status' | 'variants' | 'question'>;

/** The model's JSON answer, or null when it is not one (the call then fails with AI_BAD_FORMAT). */
export function parseImproveAnswer(raw: string): Answer | null {
  let data: z.infer<typeof answerSchema>;
  try {
    data = answerSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
  if (data.kind === 'needs_facts') {
    const question = data.question.replace(/\s+/g, ' ').trim().slice(0, 1000);
    return question === '' ? null : { status: 'needs_facts', variants: [], question };
  }
  const variants = data.variants
    .map((variant) => ({
      html: variant.html.trim(),
      note: variant.note.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE)
    }))
    // A variant longer than the bound is cut mid-tag by nobody: it is dropped whole.
    .filter((variant) => variant.html !== '' && variant.html.length <= MAX_HTML);
  return variants.length === 0 ? null : { status: 'ready', variants, question: null };
}

export async function improveText(
  deps: Pick<WriterDeps, 'repo' | 'profiles' | 'clock' | 'timezone' | 'newId' | 'provider'>,
  input: {
    action: AiImproveAction;
    scope: 'selection' | 'all';
    html: string;
    instruction?: string | undefined;
    signal: AbortSignal;
  }
): Promise<{ result: AiImproveResultDto; budgetEvents: BudgetEvent[] }> {
  const settings = await readAiSettings(deps.repo);
  // Refused before any call when AI cannot run (UNAVAILABLE with its reason).
  const { provider, model } = await assertAiReady(deps, settings, settings.draftModel ?? settings.cheapModel);
  const author = (await readAuthorProfile(deps.profiles)).promptText;
  try {
    const completion = await provider.complete({
      model,
      ...buildImprovePrompt({ ...input, author }),
      maxOutputTokens: input.action === 'variants' ? MAX_OUTPUT_TOKENS.three : MAX_OUTPUT_TOKENS.one,
      jsonSchema: IMPROVE_JSON_SCHEMA,
      signal: input.signal
    });
    const budgetEvents = await recordAiUsage(deps, {
      kind: 'rewrite',
      provider: provider.provider,
      model: completion.model,
      usage: completion.usage,
      settings
    });
    const answer = parseImproveAnswer(completion.text);
    if (answer === null) {
      return {
        result: { status: 'failed', errorCode: 'AI_BAD_FORMAT', model: completion.model, variants: [], question: null },
        budgetEvents
      };
    }
    return { result: { ...answer, errorCode: null, model: completion.model }, budgetEvents };
  } catch (error) {
    if (!(error instanceof AiProviderError)) throw error;
    return {
      result: { status: 'failed', errorCode: error.code, model: null, variants: [], question: null },
      budgetEvents: []
    };
  }
}
