// Local demo thumbnails (generated SVG scenes, no game art, no network). Media itself is an API need (UX_SPEC §2.4).
import arcana from './assets/thumb-arcana.svg';
import chest from './assets/thumb-chest.svg';
import hero from './assets/thumb-hero.svg';
import mid from './assets/thumb-mid.svg';
import patch from './assets/thumb-patch.svg';
import rating from './assets/thumb-rating.svg';
import stream from './assets/thumb-stream.svg';
import trophy from './assets/thumb-trophy.svg';
import { useProtoSearch } from './proto-kit';

const POST_MEDIA: Record<string, string> = {
  p1: patch,
  p2: chest,
  p4: stream,
  p5: hero,
  p6: rating,
  p8: arcana
};

export const PULSE_MEDIA = { patch, trophy, hero, mid } as const;

/** Real-DEV variant (`?state=real`): the API has no media yet, so every row shows the type-icon tile. */
export function useRealMode(): boolean {
  return useProtoSearch().state === 'real';
}

/** Thumbnail of a post; text-only posts (and the real-DEV variant) have none and get the icon tile. */
export function usePostMedia(): (postId: string | undefined) => string | undefined {
  const real = useRealMode();
  return (postId) => (real || !postId ? undefined : POST_MEDIA[postId]);
}
