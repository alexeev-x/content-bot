import { DRAW_TIMEOUT_MS, decodeReference, IMAGE_MODEL, type PictureDeps, prepare } from './patch-picture';
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
    "Always in the gachimuchi look, whoever the character is: pumped-up muscles, a black leather harness and straps across the chest, leather wristbands — keep the character's own face, colours and recognisable features from image 2. Not nude, nothing explicit: a costume parody, not erotica.",
    `Image 3 is ${ball} from Dota 2. Inside the crystal ball show this character's head, recognisable from image 3, glowing in the ball's red-pink light like a vision.`,
    'Light everything like the scene: candlelight, red glow from the ball. Add no other text anywhere.'
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
      references: [template, input.teller, input.ball],
      size: `${HOROSCOPE_SIZE.width}x${HOROSCOPE_SIZE.height}`,
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
