import Anthropic from '@anthropic-ai/sdk';
import { causeDetail } from '../../platform/error-detail';
import { type AiCompletion, AiProviderError, type AiTextProvider } from './ports';

// Claude through the official SDK (owner, 21.10.2026: a second provider for a blind comparison; plan in
// docs/ai/claude-provider.md). The pack is the system prompt, cached (it is the same on every call); the task is the
// user message; the writer's JSON comes back as structured output. Claude Opus 5.5 always thinks; its depth is the
// effort, `medium` by default. A safety refusal is answered by Anthropic's server-side fallback model.

const EFFORT = 'medium';
// One retry for a rate limit or an outage: each answered call is paid, a failed one is not.
const MAX_RETRIES = 1;
// Thinking counts toward the cap: room for it on top of the writer's own limit.
const THINKING_ROOM = 8_000;
// Keywords Claude's structured output may not take; our own Zod schema still checks every answer.
const UNSUPPORTED = new Set([
  'maxItems',
  'minItems',
  'maxLength',
  'minLength',
  'minimum',
  'maximum',
  'pattern',
  'format'
]);

function forClaude(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(forClaude);
  if (schema === null || typeof schema !== 'object') return schema;
  return Object.fromEntries(
    Object.entries(schema as Record<string, unknown>)
      .filter(([key]) => !UNSUPPORTED.has(key))
      .map(([key, value]) => [key, key === 'properties' ? mapValues(value) : forClaude(value)])
  );
}

// Property names are data, not keywords: only their schemas are cleaned.
function mapValues(properties: unknown): unknown {
  if (properties === null || typeof properties !== 'object') return properties;
  return Object.fromEntries(
    Object.entries(properties as Record<string, unknown>).map(([key, value]) => [key, forClaude(value)])
  );
}

function failure(error: unknown, signal: AbortSignal | undefined): AiProviderError {
  const status = error instanceof Anthropic.APIError && typeof error.status === 'number' ? error.status : null;
  const detail = causeDetail(error);
  const make = (code: string) => new AiProviderError(code, false, status, detail);
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError)
    return make('AI_KEY_REJECTED');
  if (error instanceof Anthropic.RateLimitError) return make('AI_RATE_OR_QUOTA');
  if (error instanceof Anthropic.NotFoundError) return make('AI_MODEL_NOT_FOUND');
  if (error instanceof Anthropic.BadRequestError) return make('AI_BAD_REQUEST');
  if (error instanceof Anthropic.APIConnectionTimeoutError || signal?.aborted) return make('AI_TIMEOUT');
  if (error instanceof Anthropic.APIConnectionError) return make('AI_PROVIDER_UNREACHABLE');
  if (error instanceof Anthropic.APIError) return make(`AI_HTTP_${error.status ?? 'unknown'}`);
  return make('AI_PROVIDER_UNREACHABLE');
}

export function createAnthropicProvider(apiKey: string): AiTextProvider {
  const client = new Anthropic({ apiKey, maxRetries: MAX_RETRIES });
  return {
    provider: 'anthropic',
    async complete({ model, instructions, input, maxOutputTokens, jsonSchema, images, signal }): Promise<AiCompletion> {
      // Only OpenAI reads pictures here (the patch picture's read-back); never sent without them as if read.
      if (images !== undefined && images.length > 0) throw new AiProviderError('AI_BAD_REQUEST');
      let response;
      try {
        response = await client.beta.messages.create(
          {
            model,
            max_tokens: maxOutputTokens + THINKING_ROOM,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            system: [{ type: 'text', text: instructions, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: input }],
            output_config: {
              effort: EFFORT,
              ...(jsonSchema
                ? { format: { type: 'json_schema', schema: forClaude(jsonSchema.schema) as Record<string, unknown> } }
                : {})
            }
          },
          { signal }
        );
      } catch (error) {
        throw failure(error, signal);
      }
      if (response.stop_reason === 'refusal') throw new AiProviderError('AI_REFUSED', true);
      if (response.stop_reason === 'max_tokens') throw new AiProviderError('AI_TRUNCATED', true);
      const text = response.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('')
        .trim();
      // Claude counts cached and freshly cached input apart from the rest; ours is the total with its parts.
      const read = response.usage.cache_read_input_tokens ?? 0;
      const written = response.usage.cache_creation_input_tokens ?? 0;
      return {
        text,
        model: response.model,
        provider: 'anthropic',
        usage: {
          inputTokens: response.usage.input_tokens + read + written,
          cachedInputTokens: read,
          cacheWriteTokens: written,
          outputTokens: response.usage.output_tokens
        }
      };
    }
  };
}
