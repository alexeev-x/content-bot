import { describe, expect, it } from 'vitest';
import { cropPostMediaQuerySchema, cropPostMediaResultSchema, postMediaSchema } from '../src/media';

const photo = {
  id: '11111111-1111-4111-8111-111111111111',
  sourceMediaId: null,
  kind: 'photo' as const,
  fileName: 'photo.webp',
  contentType: 'image/webp',
  sizeBytes: 128,
  width: 40,
  height: 30,
  durationMs: null,
  position: 0
};

describe('post media crop contracts', () => {
  it('parses crop query metadata and rejects unknown keys', () => {
    expect(cropPostMediaQuerySchema.parse({ revision: '4', fileName: 'crop.webp' })).toEqual({
      revision: 4,
      fileName: 'crop.webp'
    });
    expect(cropPostMediaQuerySchema.safeParse({ revision: 4, fileName: 'crop.webp', width: 40 }).success).toBe(false);
  });

  it('accepts original media and a derivative linked to its source', () => {
    expect(postMediaSchema.parse(photo).sourceMediaId).toBeNull();
    const derivative = {
      ...photo,
      id: '22222222-2222-4222-8222-222222222222',
      sourceMediaId: photo.id
    };
    expect(postMediaSchema.parse(derivative)).toMatchObject({ id: derivative.id, sourceMediaId: photo.id });
  });

  it('parses the atomic replacement result', () => {
    expect(cropPostMediaResultSchema.parse({ media: { ...photo, sourceMediaId: photo.id }, revision: 5 })).toEqual({
      media: { ...photo, sourceMediaId: photo.id },
      revision: 5
    });
  });
});
