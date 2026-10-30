import { DRAW_TIMEOUT_MS, decodeReference, IMAGE_MODEL, type PictureDeps, prepare } from './patch-picture';
import { describeError } from '../../platform/error-detail';
import { AiProviderError } from './ports';
import type { RubricScene } from './rubric-picture';

// «Забытый герой» (owner, 29.10.2026): the owner's night ruins with the «ЗАБЫТЫЕ ГЕРОИ» sign; the hero sits on the stone
// wall, sad and covered in cobwebs, his weapon dropped in the dust, as in the owner's example. The model only places the
// hero; the name on the plaque under the sign is laid over by the browser, so it stays exact.

export const FORGOTTEN_SIZE = { width: 1536, height: 1024 } as const;

export function forgottenPrompt(heroName: string): string {
  return [
    'Image 1 is the scene. Keep it exactly as it is: the night ruins, the torn red banner, the spotlight, the big wooden sign «ЗАБЫТЫЕ ГЕРОИ» with its lettering, the stone wall and the ground.',
    `Image 2 is ${heroName} from Dota 2. Seat this exact character on the stone wall at the left-centre under the spotlight, full body, sad and forgotten: head resting on one hand, elbow on the knee, shoulders down.`,
    'Cover him with old cobwebs — over the armour, the shoulders, the head, between the arm and the body — as if nobody has picked him for years. His own weapon lies on the ground in front of him, also covered in cobwebs and dust, dropped long ago (if he has no weapon, his signature item lies there instead). That is the only weapon on the ground: add no second weapon, tool or object anywhere else, least of all under the sign on the right.',
    "Keep the character's face, design, colours, armour and weapons exactly as in image 2 — do not change the face; only light him like the scene: cold spotlight from above, warm rim light from the torches.",
    // The channel's mark lives on the hero himself, as large as in «Анкета» (owner, 29.10.2026).
    'Write the word «ALEXEEV» exactly once, as a watermark that belongs to the character: on a large, plainly visible part of his outfit — the cloak, chest, belt, trousers or a big armour plate — never on a weapon, hand or other small or strongly curved part, and not hidden under the cobwebs. Large and clearly readable even when the picture is shown small on a phone: bold capital letters about as tall as a hand of the figure, high contrast with that surface. Worked into the material (stitched or painted on cloth, engraved on metal, burned into leather), lit and shaded with it, slightly worn — never a flat sticker. The word is exactly ALEXEEV — seven letters A, L, E, X, E, E, V in this order — with nothing added before, after or inside it.',
    'Do not cover the big sign or the area under it on the right (from x 860, y 560 to y 740): it stays exactly as in image 1. Add no other text, letters or numbers anywhere.'
  ].join('\n');
}

/** The scene with the hero in it as base64 JPEG; `hero` is Valve's render (PNG). */
export async function drawForgottenScene(
  deps: PictureDeps,
  input: { hero: Uint8Array; heroName: string }
): Promise<RubricScene> {
  const ready = await prepare(deps);
  if (ready === null) return { kind: 'failed', reason: 'unavailable' };
  // Loaded on first use: ~300 KB of base64 would otherwise be parsed on every cold start.
  const template = decodeReference((await import('./forgotten-template.generated')).FORGOTTEN_TEMPLATE);
  try {
    const picture = await ready.images.draw({
      model: IMAGE_MODEL,
      prompt: forgottenPrompt(input.heroName),
      quality: 'high',
      references: [template, input.hero],
      size: `${FORGOTTEN_SIZE.width}x${FORGOTTEN_SIZE.height}`,
      signal: AbortSignal.timeout(DRAW_TIMEOUT_MS)
    });
    await ready.record('other', ready.images.provider, picture.model, picture.usage);
    return { kind: 'drawn', base64: picture.base64 };
  } catch (error) {
    if (!(error instanceof AiProviderError)) throw error;
    deps.onError?.(error);
    return { kind: 'failed', reason: 'provider', detail: describeError(error, 'images/edits') };
  }
}
