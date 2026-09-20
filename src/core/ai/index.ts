import { z } from 'zod';
import { createHttpClient } from 'src/lib/api';
import { AppError } from 'src/lib/errors';

const responseSchema = z.object({
  status: z.string(),
  output_text: z.string().trim().min(1).optional(),
  usage: z
    .object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() })
    .optional(),
});

export type TextGeneration = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

export type TextGenerator = {
  configured: boolean;
  generate: (input: { instructions: string; prompt: string }) => Promise<TextGeneration>;
};

/** Единый адаптер OpenAI: редактор задаёт контекст, клиент знает только API-контракт. */
export const createOpenAiTextGenerator = ({
  apiKey,
  signal,
  model = 'gpt-5.6-luna',
  effort = 'low',
  settings,
}: {
  apiKey?: string;
  signal?: AbortSignal;
  model?: string;
  effort?: string;
  settings?: () => Promise<{ model: string; effort: string }>;
}): TextGenerator => {
  if (!apiKey) {
    return {
      configured: false,
      generate: async () => {
        throw new AppError('not_configured', 'Для генерации не настроен OPENAI_API_KEY');
      },
    };
  }

  const client = createHttpClient('https://api.openai.com/v1', {
    signal,
    retries: 0,
    headers: { authorization: `Bearer ${apiKey}` },
  });

  return {
    configured: true,
    generate: async ({ instructions, prompt }) => {
      const selected = settings ? await settings() : { model, effort };
      const raw = await client.post(
        'responses',
        {
          model: selected.model,
          reasoning: { effort: selected.effort },
          instructions,
          input: prompt,
          max_output_tokens: 1200,
          store: false,
        },
        { idempotent: false },
      );
      if (typeof raw === 'object' && raw !== null && 'error' in raw)
        throw new AppError('upstream_failed', 'OpenAI отклонил запрос');
      const parsed = responseSchema.safeParse(raw);
      if (!parsed.success || parsed.data.status !== 'completed' || !parsed.data.output_text || !parsed.data.usage)
        throw new AppError('outcome_unknown', 'OpenAI вернул неполный результат');
      return {
        text: parsed.data.output_text,
        inputTokens: parsed.data.usage.input_tokens,
        outputTokens: parsed.data.usage.output_tokens,
      };
    },
  };
};
