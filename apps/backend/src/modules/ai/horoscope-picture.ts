import { DRAW_TIMEOUT_MS, decodeReference, IMAGE_MODEL, type PictureDeps, prepare } from './patch-picture';
import { describeError } from '../../platform/error-detail';
import { AiProviderError } from './ports';
import type { RubricScene } from './rubric-picture';

// «Гороскоп» (owner, 28.10.2026): the owner's own fortune-teller scene — a table with candles and «?» cards, an empty
// glowing crystal ball, the «Гороскоп недели» sign — with a hero seated as the fortune-teller, always in the gachimuchi
// look whoever he or she is (owner: «везде один паттерн»), and another hero's head inside the ball, as in the owner's
// example (Juggernaut with Pudge in the ball). The model draws both; nothing is laid over it.

export const HOROSCOPE_SIZE = { width: 1536, height: 768 } as const;

function horoscopePrompt(teller: string, ball: string): string {
  return [
    'Image 1 is the scene. Keep it exactly as it is: the same table, candles, «?» cards, the crystal ball on its stand with the word «ALEXEEV», the «Гороскоп недели» sign with its lettering, the moon, towers and banners.',
    `Image 2 is ${teller} from Dota 2. Seat this exact character behind the table as the fortune-teller: upper body behind the crystal ball, both hands spread around the ball as if reading it, facing the viewer, big in the frame on the left half.`,
    // The owner, 28.10.2026, on a Silencer whose helmet became a cap and whose face changed: the head is never touched,
    // and the gachi gear goes over the hero's own clothes rather than replacing them.
    'The HEAD is exactly as in image 2 and untouched: the same face, eyes, mouth, teeth, mask, helmet, hood, hat, horns, hair and beard, the same colours — nothing changed, added or removed, no new headwear. Only when the head in image 2 is bare may a black leather biker cap sit on top of it, never covering the face.',
    "The character must be recognisable at first glance — a player knows who it is instantly. The body is in a big, bold gachimuchi look, whoever the character is (man, woman or monster): huge pumped-up muscles, WITHOUT losing his own outfit: keep the character's own clothes, armour and colours recognisable (e.g. Silencer keeps his purple robes and mask) and add the gear over or under them — a black leather harness with metal rings across the chest, a spiked leather collar, fingerless leather gloves, studded wristbands, leather straps on the arms; pumped-up muscles where skin shows. Not nude, nothing explicit: a costume parody, not erotica.",
    `Image 3 is ${ball} from Dota 2. Inside the crystal ball show this character's FACE clearly: the head seen from the front, large, filling most of the ball, sharp and recognisable at first glance, exactly as in image 3 — nothing changed, added or removed — lit by the ball's red-pink glow like a vision.`,
    'Light everything like the scene: candlelight, red glow from the ball. Sharp, detailed, high resolution, no blur on the characters. Add no other text anywhere.'
  ].join('\n');
}

/** The scene with the fortune-teller and the ball's head as base64 JPEG; both inputs are Valve renders (PNG). */
export async function drawHoroscopeScene(
  deps: PictureDeps,
  input: { teller: Uint8Array; tellerName: string; ball: Uint8Array; ballName: string }
): Promise<RubricScene> {
  const ready = await prepare(deps);
  if (ready === null) return { kind: 'failed', reason: 'unavailable' };
  // Loaded on first use: ~270 KB of base64 would otherwise be parsed on every cold start.
  const template = decodeReference((await import('./horoscope-template.generated')).HOROSCOPE_TEMPLATE);
  try {
    const picture = await ready.images.draw({
      model: IMAGE_MODEL,
      prompt: horoscopePrompt(input.tellerName, input.ballName),
      quality: 'high',
      references: [template, input.teller, input.ball],
      size: `${HOROSCOPE_SIZE.width}x${HOROSCOPE_SIZE.height}`,
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
