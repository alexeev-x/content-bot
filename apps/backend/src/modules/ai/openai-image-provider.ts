import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { readBounded } from './openai-provider';
import { causeDetail, readErrorDetail } from '../../platform/error-detail';
import { type AiImage, type AiImageProvider, AiProviderError } from './ports';

// OpenAI's image edits (`POST /v1/images/edits`, read 22.10.2026): multipart with the references as repeated `image[]`,
// the answer's picture in `data[0].b64_json`. A refused prompt (`moderation_blocked`) is an ordinary 400 failure.
const ENDPOINT = 'https://api.openai.com/v1/images/edits';
// A 1536×768 JPEG is a few hundred KB; its base64 and the JSON around it stay far below this.
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

const responseSchema = z.object({
  data: z.array(z.object({ b64_json: z.string().min(1) })).min(1),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
      input_tokens_details: z.object({ cached_tokens: z.number().int().nonnegative().optional() }).optional()
    })
    .optional()
});

export function createOpenAiImageProvider(apiKey: string, fetchImpl: typeof fetch): AiImageProvider {
  return {
    provider: 'openai',
    async draw({ model, prompt, references, size, quality, signal }): Promise<AiImage> {
      const form = new FormData();
      form.set('model', model);
      form.set('prompt', prompt);
      form.set('size', size);
      // «medium» keeps a picture at a few cents (owner, 22.10.2026); a scene that is the whole post asks for «high»
      // (owner, 28.10.2026: «почему оно размытое»).
      form.set('quality', quality ?? 'medium');
      form.set('output_format', 'jpeg');
      form.set('n', '1');
      // A reference is a JPEG, or a PNG with transparency (a hero's render); the type follows its first bytes.
      references.forEach((bytes, index) => {
        const png = bytes[0] === 0x89 && bytes[1] === 0x50;
        form.append(
          'image[]',
          new File([bytes], `reference-${index + 1}.${png ? 'png' : 'jpg'}`, { type: png ? 'image/png' : 'image/jpeg' })
        );
      });
      let response: Response;
      try {
        // A plain call: the runtime's fetch throws «Illegal invocation» when called as a method of another object.
        const call = fetchImpl;
        response = await call(ENDPOINT, {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}` },
          body: form,
          signal
        });
      } catch (error) {
        throw new AiProviderError(
          signal.aborted ? 'AI_TIMEOUT' : 'AI_PROVIDER_UNREACHABLE',
          false,
          null,
          causeDetail(error)
        );
      }
      if (!response.ok) {
        const detail = await readErrorDetail(response);
        const code =
          response.status === 401
            ? 'AI_KEY_REJECTED'
            : response.status === 429
              ? 'AI_RATE_OR_QUOTA'
              : response.status === 404
                ? 'AI_MODEL_NOT_FOUND'
                : response.status === 400
                  ? 'AI_BAD_REQUEST'
                  : `AI_HTTP_${response.status}`;
        throw new AiProviderError(code, false, response.status, detail);
      }
      let raw: string;
      try {
        raw = await readBounded(response, MAX_RESPONSE_BYTES);
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        // The body broke off (our timeout or the network): a failed try, not a bug.
        throw new AiProviderError(
          signal.aborted ? 'AI_TIMEOUT' : 'AI_PROVIDER_UNREACHABLE',
          true,
          response.status,
          causeDetail(error)
        );
      }
      let parsed: z.infer<typeof responseSchema>;
      let base64: string;
      let bytes: Uint8Array;
      try {
        parsed = responseSchema.parse(JSON.parse(raw));
        base64 = parsed.data[0]?.b64_json ?? '';
        bytes = new Uint8Array(Buffer.from(base64, 'base64'));
        if (bytes.byteLength === 0) throw new Error('empty');
      } catch (error) {
        throw new AiProviderError('AI_RESPONSE_SHAPE', true, response.status, causeDetail(error));
      }
      return {
        bytes,
        base64,
        contentType: 'image/jpeg',
        model,
        usage: {
          inputTokens: parsed.usage?.input_tokens ?? 0,
          cachedInputTokens: parsed.usage?.input_tokens_details?.cached_tokens ?? 0,
          cacheWriteTokens: 0,
          outputTokens: parsed.usage?.output_tokens ?? 0
        }
      };
    }
  };
}
