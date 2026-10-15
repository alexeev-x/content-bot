import type { HeroAssetKind } from '@alexeev/contracts';

// Valve serves the same files from two CDNs. Akamai first: a Worker asking a Cloudflare-hosted mirror is
// refused (403) far more often; the Cloudflare mirror is the fallback.
export const CDN_HOSTS = [
  { label: 'akamai', base: 'https://cdn.akamai.steamstatic.com/apps/dota2' },
  { label: 'cloudflare', base: 'https://cdn.cloudflare.steamstatic.com/apps/dota2' }
] as const;

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

export function cdnUrl(base: string, slug: string, kind: HeroAssetKind): string {
  return `${base}${KIND_SPEC[kind].path(slug)}`;
}

export function objectKey(slug: string, kind: HeroAssetKind): string {
  return `dota/heroes/${slug}/${kind}.${KIND_SPEC[kind].extension}`;
}

/** The R2 side this module needs; `app/container.ts` adapts the bucket binding. */
export interface HeroAssetStorage {
  put(key: string, body: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream<Uint8Array>; size: number } | null>;
}
