import type { HeroAssetStorage } from '../modules/hero-assets';

// Hero media lives next to post media in the environment's bucket, under `dota/heroes/`.
export function createR2HeroAssetStorage(bucket: R2Bucket): HeroAssetStorage {
  return {
    async put(key, body, size, contentType) {
      // R2 needs a stream of known length; the CDN's Content-Length gives it, and a short body fails the write.
      const fixed = new FixedLengthStream(size);
      const [, stored] = await Promise.all([
        body.pipeTo(fixed.writable),
        bucket.put(key, fixed.readable, { httpMetadata: { contentType, cacheControl: 'private, max-age=86400' } })
      ]);
      void stored;
    },
    async get(key) {
      const object = await bucket.get(key);
      return object === null ? null : { body: object.body as ReadableStream<Uint8Array>, size: object.size };
    }
  };
}
