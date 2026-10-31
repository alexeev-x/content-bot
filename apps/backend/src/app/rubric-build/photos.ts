import type { RubricKey, RubricSample } from '../../modules/rubrics';
import { AppError } from '../../shared/app-error';
import type { BuildDeps, BuiltMedia } from './types';

// A source's own pictures: Steam's announcement image, a Workshop set's screenshots and clips.

const PHOTO_TIMEOUT_MS = 15_000;
const PHOTO_MAX_BYTES = 8_000_000;
/** Steam's announcement images and Workshop screenshots only (the rubrics build these addresses themselves). */
const PHOTO_ORIGINS = [
  'https://clan.akamai.steamstatic.com/',
  'https://images.steamusercontent.com/',
  'https://i.imgur.com/'
];
/** The carousel's order: stills first, then GIFs, then clips. */
const ALBUM_ORDER = { photo: 0, animation: 1, video: 2 } as const;

export async function fetchPhoto(url: string): Promise<Uint8Array> {
  const failed = () => new AppError('UNAVAILABLE', 'The source picture was not fetched', { reason: 'PHOTO_FETCH' });
  if (!PHOTO_ORIGINS.some((origin) => url.startsWith(origin))) throw failed();
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
  } catch {
    throw failed();
  }
  const length = Number(response.headers.get('content-length') ?? 0);
  if (!response.ok || length > PHOTO_MAX_BYTES) {
    await response.body?.cancel();
    throw failed();
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > PHOTO_MAX_BYTES) throw failed();
  return bytes;
}

/** An album's photos one by one; one that fails is left out (`missing` counts them), the album needs one. */
export async function fetchAlbum(
  deps: Pick<BuildDeps, 'improvePhoto'>,
  rubric: RubricKey,
  album: NonNullable<RubricSample['album']> | undefined
): Promise<{ media: BuiltMedia[]; missing: number }> {
  const media: BuiltMedia[] = [];
  let missing = 0;
  for (const [kind, urls] of [
    ['photo', album?.photos ?? []],
    ['video', album?.clips ?? []]
  ] as const) {
    for (const url of urls) {
      const bytes = await fetchPhoto(url).catch(() => null);
      // A Workshop screenshot is often an animated GIF: it goes as an animation, a photo would freeze it.
      const gif = bytes !== null && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
      if (bytes !== null) media.push({ kind: gif ? 'animation' : kind, bytes });
      else missing += 1;
    }
  }
  // A sharp still of the hero opens the carousel (owner, 27.10.2026: «сначала фотку качественную самого персонажа»):
  // Workshop GIFs are 512 px with 256 colours. The author's still shot, else the set's cover, made sharper when narrow.
  media.sort((a, b) => ALBUM_ORDER[a.kind] - ALBUM_ORDER[b.kind]);
  if (album?.cover !== undefined && media[0]?.kind !== 'photo') {
    const cover = await fetchPhoto(album.cover).catch(() => null);
    if (cover !== null) media.unshift({ kind: 'photo', bytes: cover });
  }
  const first = media[0];
  if (first?.kind === 'photo') {
    first.bytes = (
      await deps.improvePhoto({ bytes: first.bytes, contentType: 'image/png', fileName: `${rubric}.png` })
    ).bytes;
  }
  return { media, missing };
}
