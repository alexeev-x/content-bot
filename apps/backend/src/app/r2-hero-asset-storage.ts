import type { HeroAssetStorage } from '../modules/hero-assets';

// Hero media lives next to post media in the environment's bucket, under `dota/heroes/`.
export function createR2HeroAssetStorage(bucket: R2Bucket): HeroAssetStorage {
  return {
    async put(key, body, contentType) {
      await bucket.put(key, body, { httpMetadata: { contentType, cacheControl: 'private, max-age=86400' } });
    },
    async get(key) {
      const object = await bucket.get(key);
      return object === null ? null : { body: object.body as ReadableStream<Uint8Array>, size: object.size };
    }
  };
}
