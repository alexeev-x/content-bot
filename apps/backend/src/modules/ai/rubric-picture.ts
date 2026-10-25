import { DRAW_TIMEOUT_MS, decodeReference, IMAGE_MODEL, type PictureDeps, prepare, SIZE } from './patch-picture';
import { AiProviderError } from './ports';

// Two ways to draw a rubric's picture after the owner's ten references (design-refs/rubric-style), sent side by side so
// the owner picks one per rubric (owner, 25.10.2026: «присылаешь сразу два варианта, я сравниваю»):
// A — the model draws only an empty scene; the browser lays Valve's real icons and the text over it, so they stay exact.
// B — the model gets the browser's plain layout (real icons, real text) and redraws all of it in the references' style.

// The one style of every rubric picture (owner, 25.10.2026: «стиль не меняется»), first in every prompt and the
// references always first in the same order: the provider then caches that prefix and bills it at the cached price.
const STYLE = [
  'STYLE (the same for every picture, taken from the reference images): a dark, cinematic Dota 2 world at dusk — ruined stone fortress walls, tall red banners with the Dota logo, torches and braziers, glowing embers and drifting mist, wet dark stone; low-key light with warm fire glow on the sides and deep shadows in the middle.',
  'Titles: large silver-white metallic serif capitals with a soft shadow, one key word in glowing red. Small spaced label «ALEXEEV» with thin lines at the top center, a small red Dota logo at the bottom center.',
  'Heroes, items and abilities sit in ornate dark-iron frames with a thin gold or red edge and a soft glow; arrows and numbers are clean and bold (red down, green up). Painted, rich but not over-detailed, no oversharpening, no cartoon look.'
].join('\n');

const BACKGROUND_PROMPT = [
  STYLE,
  'Make a new wide 2:1 background in this style.',
  'The scene is EMPTY: no heroes, characters, creatures or people, no cards, frames, icons or panels, no text, letters, numbers or labels anywhere.',
  'Keep the middle of the picture dark and calm, with the detail at the edges, so text and icons placed on top later read well.'
].join('\n');

function coverPrompt(title: string): string {
  return [
    STYLE,
    `Make a new Dota 2 Telegram rubric cover «${title}», a wide 2:1 banner, in this style.`,
    'The LAST image is the content. Redraw its layout in this style: put every hero portrait, item and ability icon of the last image into an ornate frame, exactly as it is there — the same characters and the same pictures in the same order. Never invent, swap, add, redraw or restyle a portrait or an icon.',
    'Copy every Russian word and every number of the last image letter by letter.',
    'At the top center a small spaced label «ALEXEEV» — exactly this one word, nothing after it. No other text anywhere.'
  ].join('\n');
}

export type RubricVariant<T> = { kind: 'drawn'; picture: T } | { kind: 'failed'; reason: 'unavailable' | 'provider' };

/**
 * A's background (base64 JPEG, ready for a data URL) and B's whole picture, drawn at once; each fails on its own.
 * `content` is the browser's plain layout of the rubric as a JPEG.
 */
export async function drawRubricVariants(
  deps: PictureDeps,
  input: { title: string; content: Uint8Array }
): Promise<{ background: RubricVariant<string>; cover: RubricVariant<Uint8Array> }> {
  const ready = await prepare(deps);
  if (ready === null) {
    const failed = { kind: 'failed', reason: 'unavailable' } as const;
    return { background: failed, cover: failed };
  }
  // Loaded on first use: ~700 KB of base64 would otherwise be parsed on every cold start.
  const references = (await import('./rubric-style-refs.generated')).RUBRIC_STYLE_REFERENCES.map(decodeReference);
  const draw = async (prompt: string, images: Uint8Array[]) => {
    const picture = await ready.images.draw({
      model: IMAGE_MODEL,
      prompt,
      references: images,
      size: SIZE,
      signal: AbortSignal.timeout(DRAW_TIMEOUT_MS)
    });
    await ready.record('other', ready.images.provider, picture.model, picture.usage);
    return picture;
  };
  const settle = async <T>(work: Promise<T>): Promise<RubricVariant<T>> => {
    try {
      return { kind: 'drawn', picture: await work };
    } catch (error) {
      // A provider failure costs this variant only; anything else is a bug and goes up.
      if (!(error instanceof AiProviderError)) throw error;
      deps.onError?.(error);
      return { kind: 'failed', reason: 'provider' };
    }
  };
  const [background, cover] = await Promise.all([
    settle(draw(BACKGROUND_PROMPT, references).then((picture) => picture.base64)),
    settle(draw(coverPrompt(input.title), [...references, input.content]).then((picture) => picture.bytes))
  ]);
  return { background, cover };
}
