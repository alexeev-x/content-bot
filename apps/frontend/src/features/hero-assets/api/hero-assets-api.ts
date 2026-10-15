import { dotaHeroAssetsSchema, type HeroAssetKind } from '@alexeev/contracts';
import { apiRequest, apiRequestBlob } from '../../../shared/api/http-client';

export function getHeroAssets(signal?: AbortSignal) {
  return apiRequest('/api/v1/dota/hero-assets', dotaHeroAssetsSchema, { signal });
}

/** «Проверить у Valve»: fresh hero list, new heroes and files Valve did not have queued again. */
export function refreshHeroAssets() {
  return apiRequest('/api/v1/dota/hero-assets/refresh', dotaHeroAssetsSchema, { method: 'POST' });
}

/** A stored file's bytes, through the Worker with the session (never a public R2 URL). */
export function getHeroAssetContent(slug: string, kind: HeroAssetKind, signal?: AbortSignal) {
  return apiRequestBlob(`/api/v1/dota/hero-assets/${encodeURIComponent(slug)}/${kind}`, { signal });
}
