import { z } from 'zod';
import { type AiCompletion, AiProviderError, type AiTextProvider } from './ports';

// OpenAI through the Responses API with plain fetch (recommended for new projects; docs checked 15.10.2026 at
// developers.openai.com/api/docs). `store: false`: nothing is kept on OpenAI's side. The answer's text is the
// joined `output_text` parts of its `message` items; usage carries cached and cache-write input tokens.
const ENDPOINT = 'https://api.openai.com/v1/responses';
const MAX_RESPONSE_BYTES = 512 * 1024;

const responseSchema = z.object({
  model: z.string(),
  status: z.string().optional(),
  output: z
    .array(
      z.object({
        type: z.string(),
        content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional()
      })
    )
    .max(50),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    input_tokens_details: z
      .object({
        cached_tokens: z.number().int().nonnegative().optional(),
        cache_write_tokens: z.number().int().nonnegative().optional()
      })
      .optional()
  })
});

/** The body as text, read no further than `maxBytes` (an endless or huge body never fills memory). */
async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new AiProviderError('AI_RESPONSE_SHAPE', true);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AiProviderError('AI_RESPONSE_TOO_LARGE', true);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

export function createOpenAiProvider(apiKey: string, fetchImpl: typeof fetch): AiTextProvider {
  return {
    provider: 'openai',
    async complete({ model, instructions, input, maxOutputTokens, jsonSchema, signal }): Promise<AiCompletion> {
      let response: Response;
      try {
        // A plain call: the runtime's fetch throws «Illegal invocation» when called as a method of another object.
        const call = fetchImpl;
        response = await call(ENDPOINT, {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            instructions,
            input,
            max_output_tokens: maxOutputTokens,
            store: false,
            // Structured output: the answer is JSON of this schema (Responses API `text.format`).
            ...(jsonSchema
              ? {
                  text: {
                    format: { type: 'json_schema', name: jsonSchema.name, schema: jsonSchema.schema, strict: true }
                  }
                }
              : {})
          }),
          signal
        });
      } catch {
        throw new AiProviderError('AI_PROVIDER_UNREACHABLE');
      }
      if (response.status === 401 || response.status === 429) {
        await response.body?.cancel();
        throw new AiProviderError(response.status === 401 ? 'AI_KEY_REJECTED' : 'AI_RATE_OR_QUOTA');
      }
      if (response.status === 404 || response.status === 400) {
        await response.body?.cancel();
        throw new AiProviderError(response.status === 404 ? 'AI_MODEL_NOT_FOUND' : 'AI_BAD_REQUEST');
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new AiProviderError(`AI_HTTP_${response.status}`);
      }
      const raw = await readBounded(response, MAX_RESPONSE_BYTES);
      let parsed: z.infer<typeof responseSchema>;
      try {
        parsed = responseSchema.parse(JSON.parse(raw));
      } catch {
        throw new AiProviderError('AI_RESPONSE_SHAPE', true);
      }
      const text = parsed.output
        .filter((item) => item.type === 'message')
        .flatMap((item) => item.content ?? [])
        .filter((part) => part.type === 'output_text')
        .map((part) => part.text ?? '')
        .join('')
        .trim();
      const details = parsed.usage.input_tokens_details;
      return {
        text,
        model: parsed.model,
        usage: {
          inputTokens: parsed.usage.input_tokens,
          cachedInputTokens: details?.cached_tokens ?? 0,
          cacheWriteTokens: details?.cache_write_tokens ?? 0,
          outputTokens: parsed.usage.output_tokens
        }
      };
    }
  };
}
