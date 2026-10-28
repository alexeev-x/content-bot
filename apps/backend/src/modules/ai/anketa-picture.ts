import { DRAW_TIMEOUT_MS, decodeReference, IMAGE_MODEL, type PictureDeps, prepare } from './patch-picture';
import { AiProviderError } from './ports';
import type { RubricScene } from './rubric-picture';

// «Анкета» (owner, 28.10.2026): the owner's own scene — a Dota arena of love with a «Давай поженимся» sign and an empty
// board — with the hero standing in it, lit by it, as in the owner's example; a pasted render looked foreign there
// («стоят как неродные»). The model only places the hero; the board's text is laid over by the browser, so it stays exact.

export const ANKETA_SIZE = { width: 1536, height: 1024 } as const;

function anketaPrompt(heroName: string): string {
  return [
    'Image 1 is the scene. Keep it exactly as it is: the same arena, the neon heart, the «Давай поженимся» sign with its lettering, the torches, banners, roses and the stone-framed board on the right.',
    `Image 2 is ${heroName} from Dota 2. Put this exact character into the scene: standing full-body on the stage on the left half, in front of the neon heart, facing the viewer, about two thirds of the picture's height, feet on the stage floor.`,
    "Keep the character's design, colours, armour and weapons exactly as in image 2; only light him like the scene: pink and red rim light from the heart behind, warm torch light, a contact shadow on the floor, a few rose petals in front of his legs.",
    // The channel's mark lives on the hero himself (owner, 28.10.2026), so cropping it out spoils the picture.
    'Write the word «ALEXEEV» exactly once, as a watermark that belongs to the character: worked into his clothing, armour or weapon the way that material would carry it (stitched or painted on cloth, engraved or etched on metal, burned into leather), following its folds, curve and perspective, lit and shaded with it, slightly worn — harmonious, as if it had always been there, never a flat sticker or overlay. Medium size, legible, these seven letters A-L-E-X-E-E-V and nothing else.',
    'The board on the right stays EMPTY and dark: no text, letters, numbers, icons or pictures on it. Add no other text anywhere.'
  ].join('\n');
}

/** The scene with the hero in it as base64 JPEG; `hero` is Valve's render (PNG). */
export async function drawAnketaScene(
  deps: PictureDeps,
  input: { hero: Uint8Array; heroName: string }
): Promise<RubricScene> {
  const ready = await prepare(deps);
  if (ready === null) return { kind: 'failed', reason: 'unavailable' };
  // Loaded on first use: ~300 KB of base64 would otherwise be parsed on every cold start.
  const template = decodeReference((await import('./anketa-template.generated')).ANKETA_TEMPLATE);
  try {
    const picture = await ready.images.draw({
      model: IMAGE_MODEL,
      prompt: anketaPrompt(input.heroName),
      references: [template, input.hero],
      size: `${ANKETA_SIZE.width}x${ANKETA_SIZE.height}`,
      signal: AbortSignal.timeout(DRAW_TIMEOUT_MS)
    });
    await ready.record('other', ready.images.provider, picture.model, picture.usage);
    return { kind: 'drawn', base64: picture.base64 };
  } catch (error) {
    if (!(error instanceof AiProviderError)) throw error;
    deps.onError?.(error);
    return { kind: 'failed', reason: 'provider' };
  }
}
