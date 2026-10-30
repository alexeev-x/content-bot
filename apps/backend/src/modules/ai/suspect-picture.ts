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
    `Image 2 is ${heroName} from Dota 2. Put this exact character behind the sign as a police mugshot: facing the viewer, head and shoulders above the sign against the height chart, a guilty, sullen, angry face looking straight into the camera.`,
    'He holds the sign with both hands: one hand on its left edge, one on its right edge, the fingers wrapping only over the outer frame. The inside of the sign stays fully visible, black and EMPTY.',
    "Keep the character's face, design, colours, armour and weapons exactly as in image 2 — do not change the face; only light him like the scene: a hard flat police flash from the front, dark falloff at the sides.",
    'Write no text, letters, numbers or symbols on the sign or anywhere else; the height chart numbers stay as in image 1.'
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
