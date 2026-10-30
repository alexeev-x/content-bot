import { DRAW_TIMEOUT_MS, decodeReference, IMAGE_MODEL, type PictureDeps, prepare } from './patch-picture';
import { describeError } from '../../platform/error-detail';
import { AiProviderError } from './ports';
import type { RubricScene } from './rubric-picture';

// «Подозреваемый» (owner, 30.10.2026): a police mugshot on the owner's height-chart wall, the hero holding a chalk sign
// as in the owner's Pudge example. The blank sign is part of the template, so it stays in one place: the model only puts
// the hero behind it, and the browser writes the chalk lines on it, so they stay exact.

export const SUSPECT_SIZE = { width: 1536, height: 1024 } as const;

export function suspectPrompt(heroName: string): string {
  return [
    'Image 1 is the scene. Keep it exactly as it is: the concrete wall with the height chart and its numbers, the floor, and the big blank black chalk sign at the bottom centre — its size, position, slight tilt and frame stay exactly as in image 1.',
    `Image 2 is ${heroName} from Dota 2. Make a real police mugshot photo of this exact character standing in this room: a close-up, the camera near him, so his head and shoulders are big and fill most of the frame above the sign, the head reaching the 180–200 lines of the height chart, his body wider than the sign, as in a real booking photo. A guilty, sullen, angry face looking straight into the camera.`,
    'He holds the sign with both hands in front of his chest: one hand on its left edge, one on its right edge, the fingers and thumbs wrapping over the outer frame only. The inside of the sign stays fully visible, black and EMPTY.',
    "He must look photographed in this room, not pasted in: the same light as the wall — a soft flash from the front, the same dim warm-grey tone, dark vignette and falloff at the sides — the same film grain and softness as the wall, and his real shadow cast on the wall behind him. Match his colours to the scene's muted grade. Keep the character's face, design, colours, armour and weapons exactly as in image 2 — do not change the face.",
    // The channel's mark lives on the hero himself, as in «Анкета», so a cropped sign still carries it (owner, 30.10.2026).
    'Write the word «ALEXEEV» exactly once, as a watermark that belongs to the character: on a large, plainly visible part of his outfit above the sign — the chest, a shoulder plate, a strap or the cloak — bold capitals, clearly readable on a phone, shaded and lit like the outfit.',
    'Add no other text, letters, numbers or symbols, and none on the sign; the height chart numbers stay as in image 1.'
  ].join('\n');
}

/** The scene with the hero in it as base64 JPEG; `hero` is Valve's render (PNG). */
export async function drawSuspectScene(
  deps: PictureDeps,
  input: { hero: Uint8Array; heroName: string }
): Promise<RubricScene> {
  const ready = await prepare(deps);
  if (ready === null) return { kind: 'failed', reason: 'unavailable' };
  // Loaded on first use: ~140 KB of base64 would otherwise be parsed on every cold start.
  const template = decodeReference((await import('./suspect-template.generated')).SUSPECT_TEMPLATE);
  try {
    const picture = await ready.images.draw({
      model: IMAGE_MODEL,
      prompt: suspectPrompt(input.heroName),
      quality: 'high',
      references: [template, input.hero],
      size: `${SUSPECT_SIZE.width}x${SUSPECT_SIZE.height}`,
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
