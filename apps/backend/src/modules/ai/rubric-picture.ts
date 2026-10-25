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

export type PictureHeading = { text: string; red: string | null };

// A: the model draws the scene and the lettering (owner, 25.10.2026: «надписи может ИИ делать в варианте A»); the
// browser puts only the exact portraits, icons and numbers into the empty lower part.
function backgroundPrompt(heading: PictureHeading | null): string {
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

// Hard rules (owner, 25.10.2026: «надо жёстче ему правила задавать»): the portraits and icons are pasted photos the
// model frames, never repaints; their count is given so none is added or lost.
function coverPrompt(title: string, pictures: number): string {
  return [
    STYLE,
    `Make a new Dota 2 Telegram rubric cover «${title}», a wide 2:1 banner, in this style.`,
    'The LAST image is the content: the official game portraits and icons, the words and the numbers. Only the scene around them is yours to draw.',
    'HARD RULES — breaking any of them makes the picture useless:',
    `1. The last image has exactly ${pictures} portrait/icon picture(s). Your picture has exactly ${pictures}: none added, none removed, none merged, none duplicated.`,
    '2. Treat each portrait and icon as a printed photo pasted in: copy it pixel for pixel — the same face, facial features, eyes, nose, mouth, expression, skin, hair, horns, helmet, armor, weapon, colors, pose, crop and lighting. Do NOT repaint, redraw, retouch, restyle, sharpen, blur, age, beautify, add details or "improve" it; no new scars, hair, accessories or effects on it. Do NOT distort its proportions. Do NOT change who the character is or how they look.',
    '3. Keep their order and their grouping from left to right and top to bottom. Never swap two of them.',
    '4. Around each one you may only add an ornate frame, a glow and a shadow; nothing may cover any part of a face or an icon.',
    '5. Copy every Russian word and every number letter by letter, digit by digit; no other words, letters or numbers anywhere.',
    '6. At the top center a small spaced label «ALEXEEV» — exactly this one word; never «STUDIO» or anything else after it.',
    'If a rule and the style disagree, the rule wins: leave the portrait or icon exactly as in the last image.'
  ].join('\n');
}

export type RubricVariant<T> = { kind: 'drawn'; picture: T } | { kind: 'failed'; reason: 'unavailable' | 'provider' };

/**
 * A's background (base64 JPEG, ready for a data URL) and B's whole picture, drawn at once; each fails on its own.
 * `content` is the browser's plain layout of the rubric as a JPEG, `pictures` the number of portraits and icons on it.
 */
export async function drawRubricVariants(
  deps: PictureDeps,
  input: { title: string; content: Uint8Array; pictures: number; heading: PictureHeading | null }
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
    settle(draw(backgroundPrompt(input.heading), references).then((picture) => picture.base64)),
    settle(
      draw(coverPrompt(input.title, input.pictures), [...references, input.content]).then((picture) => picture.bytes)
    )
  ]);
  return { background, cover };
}
