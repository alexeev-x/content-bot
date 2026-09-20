import { z } from 'zod';
import { createHttpClient } from 'src/lib/api';
import { AppError } from 'src/lib/errors';

const responseSchema = z.object({
  status: z.string(),
  output_text: z.string().trim().min(1).optional(),
  output: z
    .array(
      z.object({
        type: z.string(),
        content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
      }),
    )
    .optional(),
  usage: z
    .object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() })
    .optional(),
});

export type TextGeneration = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costMicros?: number;
};

// Standard, 20.09.2026: developers.openai.com/api/docs/pricing. Кэш-скидку не вычитаем.
const prices: Record<string, { input: number; output: number }> = {
  'gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'gpt-5.6-terra': { input: 2, output: 12 },
  'gpt-5.6-sol': { input: 4, output: 20 },
  'gpt-6-astra': { input: 10, output: 50 },
};

export type TextGenerator = {
  configured: boolean;
  generate: (input: {
    instructions: string;
    prompt: string;
    format?: { name: string; schema: Record<string, unknown> };
  }) => Promise<TextGeneration>;
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
  if (!apiKey?.trim()) {
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
    generate: async ({ instructions, prompt, format }) => {
      const selected = settings ? await settings() : { model, effort };
      const price = prices[selected.model];
      if (!price) throw new AppError('not_configured', 'Нет тарифа выбранной модели');
      const raw = await client.post(
        'responses',
        {
          model: selected.model,
          reasoning: { effort: selected.effort },
          instructions,
          input: prompt,
          max_output_tokens: 2400,
          ...(format ? { text: { format: { type: 'json_schema', strict: true, ...format } } } : {}),
          store: false,
          service_tier: 'default',
        },
        { idempotent: false },
      );
      if (typeof raw === 'object' && raw !== null && 'error' in raw)
        throw new AppError('upstream_failed', 'OpenAI отклонил запрос');
      const parsed = responseSchema.safeParse(raw);
      if (!parsed.success || parsed.data.status !== 'completed' || !parsed.data.usage)
        throw new AppError('outcome_unknown', 'OpenAI вернул неполный результат');
      // output_text — удобство SDK; HTTP Responses возвращает массив output с сообщениями.
      const text =
        parsed.data.output
          ?.filter((item) => item.type === 'message')
          .flatMap((item) => item.content ?? [])
          .filter((item) => item.type === 'output_text')
          .map((item) => item.text ?? '')
          .join('') || parsed.data.output_text;
      if (!text?.trim()) throw new AppError('outcome_unknown', 'OpenAI не вернул текст ответа');
      return {
        text,
        inputTokens: parsed.data.usage.input_tokens,
        outputTokens: parsed.data.usage.output_tokens,
        costMicros: Math.ceil(
          parsed.data.usage.input_tokens * price.input + parsed.data.usage.output_tokens * price.output,
        ),
      };
    },
  };
};
