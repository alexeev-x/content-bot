import type { Clock } from '../../platform/clock';
import type { AiRepository } from './d1-ai-repository';
import { type AiImageProvider, AiProviderError, type AiTextProvider } from './ports';
import { assertAiReady, costMicroUsd, readAiSettings } from './service';

// A small or blurry picture made sharper (owner, 23.10.2026): the image model gets the picture as its only reference
// and a strict instruction to change nothing. First tried on DEV on five 256×170 Liquipedia set icons; the result is
// judged by the owner before it goes into posts, because a redrawn set would be wrong in the channel.

const IMAGE_MODEL = 'gpt-image-2.5-sunburst';
// The same model and price as the patch picture (OpenAI's model page, read 23.10.2026), per 1M tokens.
const IMAGE_PRICE = { model: IMAGE_MODEL, inputPerMillion: 8, cachedInputPerMillion: 2, outputPerMillion: 30 };
// The icons are 3:2; the model's landscape size keeps their proportions.
const SIZE = '1536x1024';
const DRAW_TIMEOUT_MS = 150_000;

export const ENHANCE_PROMPT = [
  'Улучши качество этой картинки: повысь чёткость и детализацию, убери размытие и артефакты сжатия.',
  'Ничего не меняй: тот же персонаж, та же поза, те же предметы, цвета, форма и пропорции.',
  'Ничего не добавляй и не дорисовывай: ни новых деталей, ни фона, ни текста, ни эффектов.',
  'Композиция и кадр те же; только качество выше.'
].join('\n');

export type EnhanceResult =
  | { kind: 'enhanced'; bytes: Uint8Array; costMicroUsd: number | null }
  /** `unavailable`: AI is off, its key or the budget is missing; `provider`: the call failed. */
  | { kind: 'failed'; reason: 'unavailable' | 'provider' };

export async function enhancePicture(
  deps: {
    repo: AiRepository;
    clock: Clock;
    timezone: string;
    newId: () => string;
    provider: AiTextProvider | null;
    images: AiImageProvider | null;
    onError?: (error: unknown) => void;
  },
  picture: Uint8Array
): Promise<EnhanceResult> {
  const settings = await readAiSettings(deps.repo);
  try {
    // The same gate as any paid call: AI on, a key, the budget not spent.
    await assertAiReady(deps, settings, settings.cheapModel ?? settings.draftModel);
  } catch {
    return { kind: 'failed', reason: 'unavailable' };
  }
  if (deps.images === null) return { kind: 'failed', reason: 'unavailable' };
  try {
    const result = await deps.images.draw({
      model: IMAGE_MODEL,
      prompt: ENHANCE_PROMPT,
      references: [picture],
      size: SIZE,
      signal: AbortSignal.timeout(DRAW_TIMEOUT_MS)
    });
    const cost = costMicroUsd(result.usage, IMAGE_PRICE);
    await deps.repo.recordUsage({
      id: deps.newId(),
      at: deps.clock.now(),
      kind: 'other',
      provider: deps.images.provider,
      model: result.model.slice(0, 80),
      usage: result.usage,
      costMicroUsd: cost
    });
    return { kind: 'enhanced', bytes: result.bytes, costMicroUsd: cost };
  } catch (error) {
    if (!(error instanceof AiProviderError)) throw error;
    deps.onError?.(error);
    return { kind: 'failed', reason: 'provider' };
  }
}
