import { DRAW_TIMEOUT_MS, decodeReference, IMAGE_MODEL, type PictureDeps, prepare, SIZE } from './patch-picture';
import { AiProviderError } from './ports';

// A rubric's picture after the owner's ten references (embedded in rubric-style-refs.generated.ts; their source folder was removed 26.10.2026): the model draws the scene and the
// lettering, the browser lays Valve's real portraits, icons and the numbers over it, so they stay exact. A model that
// redrew the portraits itself was dropped (owner, 25.10.2026: «лица ИИ не может нормально делать»).

// The one style of every rubric picture (owner, 25.10.2026: «стиль не меняется»), first in every prompt and the
// references always first in the same order: the provider then caches that prefix and bills it at the cached price.
const STYLE = [
  'STYLE (the same for every picture, taken from the reference images): a dark, cinematic Dota 2 world at dusk — ruined stone fortress walls, tall red banners with the Dota logo, torches and braziers, glowing embers and drifting mist, wet dark stone; low-key light with warm fire glow on the sides and deep shadows in the middle.',
  'Titles: large silver-white metallic serif capitals with a soft shadow, one key word in glowing red. Small spaced label «ALEXEEV» with thin lines at the top center, a small red Dota logo at the bottom center.',
  'Painted, rich but not over-detailed, no oversharpening, no cartoon look.'
].join('\n');

export type PictureHeading = { text: string; red: string | null };

// The model draws the scene and the lettering (owner, 25.10.2026: «надписи может ИИ делать»); the browser puts only
// the exact portraits, icons and numbers into the empty lower part.
function scenePrompt(heading: PictureHeading | null): string {
  const title =
    heading === null
      ? 'No title: no text, letters or numbers anywhere.'
      : `In the top quarter, centered: the small label «ALEXEEV» and under it the title «${heading.text}» in the style's lettering${
          heading.red === null ? '' : `, the part «${heading.red}» in red`
        }. Spell it letter by letter; no other text, letters or numbers anywhere.`;
  return [
    STYLE,
    'Make a new wide 2:1 picture in this style.',
    title,
    'Below the title the scene stays EMPTY: no heroes, characters, creatures or people, no cards, frames, icons or panels. Keep the middle and the lower part dark and calm, with the detail at the edges: portraits and numbers are placed there later.'
  ].join('\n');
}

export type RubricScene = { kind: 'drawn'; base64: string } | { kind: 'failed'; reason: 'unavailable' | 'provider' };

/** The drawn scene with the title as base64 JPEG, ready for a data URL. */
export async function drawRubricScene(
  deps: PictureDeps,
  input: { heading: PictureHeading | null }
): Promise<RubricScene> {
  const ready = await prepare(deps);
  if (ready === null) return { kind: 'failed', reason: 'unavailable' };
  // Loaded on first use: ~700 KB of base64 would otherwise be parsed on every cold start.
  const references = (await import('./rubric-style-refs.generated')).RUBRIC_STYLE_REFERENCES.map(decodeReference);
  try {
    const picture = await ready.images.draw({
      model: IMAGE_MODEL,
      prompt: scenePrompt(input.heading),
      references,
      size: SIZE,
      signal: AbortSignal.timeout(DRAW_TIMEOUT_MS)
    });
    await ready.record('other', ready.images.provider, picture.model, picture.usage);
    return { kind: 'drawn', base64: picture.base64 };
  } catch (error) {
    // A provider failure leaves the browser's own picture; anything else is a bug and goes up.
    if (!(error instanceof AiProviderError)) throw error;
    deps.onError?.(error);
    return { kind: 'failed', reason: 'provider' };
  }
}
