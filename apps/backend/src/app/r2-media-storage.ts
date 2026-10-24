import type { MediaObjectStorage } from '../modules/content';

export function createR2MediaStorage(bucket: R2Bucket): MediaObjectStorage {
  return {
    async put(objectKey, body, contentType) {
      await bucket.put(objectKey, body, { httpMetadata: { contentType, cacheControl: 'private, no-store' } });
    },
    async get(objectKey) {
      const object = await bucket.get(objectKey);
      if (object === null) return null;
      return {
        body: object.body as ReadableStream<Uint8Array>,
        size: object.size,
        contentType: object.httpMetadata?.contentType
      };
    },
    async delete(objectKey) {
      await bucket.delete(objectKey);
    }
  };
}
