import { env } from 'cloudflare:workers';

export function testMediaBucket(): R2Bucket {
  if (env.MEDIA_BUCKET === undefined) throw new Error('The test R2 binding is missing');
  return env.MEDIA_BUCKET;
}
