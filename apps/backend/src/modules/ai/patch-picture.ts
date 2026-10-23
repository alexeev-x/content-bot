import { Buffer } from 'node:buffer';
import { z } from 'zod';
import type { Clock } from '../../platform/clock';
import type { AiRepository } from './d1-ai-repository';
import { PATCH_COVER_REFERENCES } from './patch-cover-refs.generated';
import { type AiImageProvider, AiProviderError, type AiTextProvider, type AiUsage } from './ports';
import { assertAiReady, costMicroUsd, effectivePrices, priceFor, readAiSettings } from './service';

// Every patch post carries a picture (owner, 22.10.2026: «всем чтобы была картинка, случайно»): drawn after the owner's
// references in a random theme, with the exact number and points; a second call reads it back, and a number or a
// caption that differs means another try. After three tries the post goes without a picture.

const IMAGE_MODEL = 'gpt-image-2.5-sunburst';
// OpenAI's price (model page, read 23.10.2026): image input $8, text input $5, image output $30 per 1M tokens. Its
// usage does not split our input, so all of it is priced as the image input (the references are most of it).
const IMAGE_PRICE = { model: IMAGE_MODEL, inputPerMillion: 8, cachedInputPerMillion: 2, outputPerMillion: 30 };
/** Reads pictures; the owner named it for the read-back (plan 22.10.2026). */
const READ_MODEL = 'gpt-6.1-sol';
const SIZE = '1536x768';
const TRIES = 3;
/** A picture takes up to ~2 minutes (plan 22.10.2026); the read-back is one ordinary call. */
const DRAW_TIMEOUT_MS = 150_000;
const READ_TIMEOUT_MS = 60_000;
// A queue consumer has 15 minutes: no new try starts after this.
const TOTAL_MS = 8 * 60_000;
const POINTS_MAX = 4;
const THEMES = [
  'molten lava: orange and red fire glowing from the cracks, embers in the air',
  'deep red: crimson glow from the cracks, red sparks',
  'blue lightning: electric blue light and small lightning arcs from the cracks',
  'cyan: icy cyan glow from the cracks, cyan crystal shards',
  'green: toxic green glow from the cracks, green sparks',
  'purple: violet arcane glow from the cracks, purple shards'
] as const;

const READ_SCHEMA = {
  name: 'patch_picture_text',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['number', 'captions'],
    properties: { number: { type: 'string' }, captions: { type: 'array', items: { type: 'string' } } }
  }
};
const readSchema = z.object({ number: z.string().max(40), captions: z.array(z.string().max(80)).max(10) });

const READ_INSTRUCTIONS = [
  'Перед тобой обложка патча Dota 2. Прочитай текст на ней ровно так, как он написан, ничего не исправляя.',
  'number — большой номер патча в центре. captions — подписи под иконками слева направо, каждая целиком (если подпись в две строки — через пробел). Логотип и прочие надписи не включай.'
].join('\n');

const decodeReference = (base64: string) => new Uint8Array(Buffer.from(base64, 'base64'));

/** Text as the read-back compares it: case, «ё», spacing and line breaks do not matter. */
const same = (a: string, b: string) => {
  const norm = (text: string) => text.toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();
  return norm(a) === norm(b);
};

export function patchPicturePrompt(input: { number: string; points: readonly string[]; theme: string }): string {
  const captions = input.points.map((point, index) => `${index + 1}. "${point.toUpperCase()}"`).join('\n');
  return [
    'Make a new Dota 2 patch cover in exactly the style and layout of the reference images, a wide 2:1 banner.',
    'A dark background with floating rock shards and small sparks. The red Dota 2 logo at the top center.',
    `The patch number "${input.number}" huge in the center, as thick 3D letters of cracked stone with light glowing from the cracks.`,
    'Below it a thin glowing horizontal line, then a row of columns separated by thin vertical lines; each column has a small glowing icon above a caption in white uppercase letters (two lines when the caption has two words).',
    `Exactly ${input.points.length} column${input.points.length === 1 ? '' : 's'}, captions exactly as written, left to right:`,
    captions,
    'Each icon fits its caption (heroes: a helmet or swords; items: a leaf or a box; map: a map; mechanics: a gear or a target; modes: a dice; bug fixes: a wrench; talents: a branching tree; neutral items: a gem).',
    `Color theme: ${input.theme}.`,
    'No other text anywhere. Spell the number and the Russian captions letter by letter as given.'
  ].join('\n');
}

export type PatchPictureResult =
  | { kind: 'drawn'; bytes: Uint8Array; contentType: 'image/jpeg' }
  /** `unavailable`: AI is off, its key or the budget is missing; `mismatch`: three pictures read back wrong. */
  | { kind: 'failed'; reason: 'unavailable' | 'mismatch' | 'provider' };

/** A patch picture with `number` and `points` (1–4 captions), read back before it is returned. */
export async function drawPatchPicture(
  deps: {
    repo: AiRepository;
    clock: Clock;
    timezone: string;
    newId: () => string;
    provider: AiTextProvider | null;
    images: AiImageProvider | null;
    /** A theme index for a test; random otherwise. */
    pickTheme?: () => number;
    onError?: (error: unknown) => void;
  },
  input: { number: string; points: readonly string[] }
): Promise<PatchPictureResult> {
  const points = input.points.slice(0, POINTS_MAX);
  const settings = await readAiSettings(deps.repo);
  let reader: AiTextProvider;
  try {
    // The read-back's model has a price, so the budget check covers the pair; the picture itself has none yet.
    reader = (await assertAiReady(deps, settings, READ_MODEL)).provider;
  } catch {
    return { kind: 'failed', reason: 'unavailable' };
  }
  if (deps.images === null || points.length === 0) return { kind: 'failed', reason: 'unavailable' };
  const references = PATCH_COVER_REFERENCES.map(decodeReference);
  // One ledger row per call and nothing more: the spend was checked above, and three tries must stay inside the
  // Free plan's 50 subrequests of the job (QA 23.10.2026).
  const prices = effectivePrices(settings);
  const record = (kind: 'other' | 'check', provider: string, model: string, usage: AiUsage) =>
    deps.repo.recordUsage({
      id: deps.newId(),
      at: deps.clock.now(),
      kind,
      provider,
      model: model.slice(0, 80),
      usage,
      costMicroUsd: costMicroUsd(usage, kind === 'other' ? IMAGE_PRICE : priceFor(prices, model))
    });
  let reason: 'mismatch' | 'provider' = 'mismatch';
  const started = deps.clock.now();
  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    if (attempt > 0 && deps.clock.now() - started > TOTAL_MS - DRAW_TIMEOUT_MS - READ_TIMEOUT_MS) break;
    const theme = THEMES[(deps.pickTheme ?? (() => Math.floor(Math.random() * THEMES.length)))()] ?? THEMES[0];
    try {
      const picture = await deps.images.draw({
        model: IMAGE_MODEL,
        prompt: patchPicturePrompt({ number: input.number, points, theme }),
        references,
        size: SIZE,
        signal: AbortSignal.timeout(DRAW_TIMEOUT_MS)
      });
      // No price is published for this model yet: the ledger keeps its tokens to measure the first pictures.
      await record('other', deps.images.provider, picture.model, picture.usage);
      const read = await reader.complete({
        model: READ_MODEL,
        instructions: READ_INSTRUCTIONS,
        input: 'Прочитай номер и подписи.',
        images: [`data:image/jpeg;base64,${picture.base64}`],
        // Room for a reasoning model's thinking: an empty answer reads as a mismatch and pays for a redraw.
        maxOutputTokens: 2_000,
        jsonSchema: READ_SCHEMA,
        signal: AbortSignal.timeout(READ_TIMEOUT_MS)
      });
      await record('check', read.provider ?? reader.provider, read.model, read.usage);
      const text = readSchema.safeParse(JSON.parse(read.text));
      if (
        text.success &&
        same(text.data.number, input.number) &&
        text.data.captions.length === points.length &&
        text.data.captions.every((caption, index) => same(caption, points[index] ?? ''))
      )
        return { kind: 'drawn', bytes: picture.bytes, contentType: picture.contentType };
      reason = 'mismatch';
    } catch (error) {
      // A provider failure costs the try, never the post; anything else is a bug and goes up.
      if (!(error instanceof AiProviderError) && !(error instanceof SyntaxError)) throw error;
      deps.onError?.(error);
      reason = error instanceof AiProviderError ? 'provider' : 'mismatch';
    }
  }
  return { kind: 'failed', reason };
}
