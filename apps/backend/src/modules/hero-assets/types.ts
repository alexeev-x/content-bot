import type { HeroAssetKind } from '@alexeev/contracts';

const CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2';

interface KindSpec {
  /** Path on Valve's CDN for a hero slug. */
  path: (slug: string) => string;
  extension: string;
  contentType: string;
}

// What dota2.com itself shows: an animated render with transparency (VP9 WebM for Chrome/Android, HEVC MOV
// for Safari/iOS), its still PNG with transparency, the portrait, the minimap icon and the close-up crop.
export const KIND_SPEC: Record<HeroAssetKind, KindSpec> = {
  render_webm: {
    path: (slug) => `/videos/dota_react/heroes/renders/${slug}.webm`,
    extension: 'webm',
    contentType: 'video/webm'
  },
  render_mov: {
    path: (slug) => `/videos/dota_react/heroes/renders/${slug}.mov`,
    extension: 'mov',
    contentType: 'video/quicktime'
  },
  render_png: {
    path: (slug) => `/videos/dota_react/heroes/renders/${slug}.png`,
    extension: 'png',
    contentType: 'image/png'
  },
  portrait: { path: (slug) => `/images/dota_react/heroes/${slug}.png`, extension: 'png', contentType: 'image/png' },
  icon: { path: (slug) => `/images/dota_react/heroes/icons/${slug}.png`, extension: 'png', contentType: 'image/png' },
  crop: { path: (slug) => `/images/dota_react/heroes/crops/${slug}.png`, extension: 'png', contentType: 'image/png' }
};

export function cdnUrl(slug: string, kind: HeroAssetKind): string {
  return `${CDN}${KIND_SPEC[kind].path(slug)}`;
}

export function objectKey(slug: string, kind: HeroAssetKind): string {
  return `dota/heroes/${slug}/${kind}.${KIND_SPEC[kind].extension}`;
}

/** The R2 side this module needs; `app/container.ts` adapts the bucket binding. */
export interface HeroAssetStorage {
  put(key: string, body: ReadableStream<Uint8Array>, size: number, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream<Uint8Array>; size: number } | null>;
}
