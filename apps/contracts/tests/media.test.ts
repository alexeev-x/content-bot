import { describe, expect, it } from 'vitest';
import {
  bulkDeleteMediaInputSchema,
  bulkDeleteMediaResultSchema,
  cropPostMediaQuerySchema,
  cropPostMediaResultSchema,
  deriveMediaQuerySchema,
  mediaLibraryItemSchema,
  mediaLibraryQuerySchema,
  postMediaSchema
} from '../src/media';

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

describe('derived library media contract', () => {
  it('requires a kind of photo or video and rejects unknown keys', () => {
    expect(deriveMediaQuerySchema.parse({ fileName: 'a.mp4', kind: 'video' })).toEqual({
      fileName: 'a.mp4',
      kind: 'video'
    });
    expect(deriveMediaQuerySchema.safeParse({ fileName: 'a.gif', kind: 'animation' }).success).toBe(false);
    expect(deriveMediaQuerySchema.safeParse({ fileName: 'a.png', kind: 'photo', extra: 1 }).success).toBe(false);
  });
});

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

describe('media library contracts', () => {
  it('parses bounded filename and usage filters and rejects unknown query keys', () => {
    expect(mediaLibraryQuerySchema.parse({ search: 'Patch', usage: 'used' })).toMatchObject({
      search: 'Patch',
      usage: 'used',
      kind: 'all',
      limit: 20
    });
    expect(mediaLibraryQuerySchema.safeParse({ search: 'x'.repeat(81) }).success).toBe(false);
    expect(mediaLibraryQuerySchema.safeParse({ query: 'patch' }).success).toBe(false);
  });

  it('requires exact duplicate count and bounded current usage links', () => {
    const item = {
      id: photo.id,
      kind: photo.kind,
      fileName: photo.fileName,
      contentType: photo.contentType,
      sizeBytes: photo.sizeBytes,
      width: photo.width,
      height: photo.height,
      durationMs: photo.durationMs,
      createdAt: '2026-10-13T08:00:00.000Z',
      duplicateCount: 2,
      usageCount: 4,
      deletable: false,
      usages: [{ postId: '22222222-2222-4222-8222-222222222222', title: 'Patch 7.39' }]
    };
    expect(mediaLibraryItemSchema.parse(item)).toEqual(item);
    expect(mediaLibraryItemSchema.safeParse({ ...item, duplicateCount: 0 }).success).toBe(false);
    expect(
      mediaLibraryItemSchema.safeParse({ ...item, usages: Array.from({ length: 4 }, () => item.usages[0]) }).success
    ).toBe(false);
  });
});

describe('media delete contracts', () => {
  const id = '33333333-3333-4333-8333-333333333333';

  it('accepts 1..50 unique ids and rejects empty, oversized, duplicate or extra-key bodies', () => {
    expect(bulkDeleteMediaInputSchema.parse({ ids: [id] }).ids).toEqual([id]);
    expect(bulkDeleteMediaInputSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(bulkDeleteMediaInputSchema.safeParse({ ids: [id, id] }).success).toBe(false);
    const many = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect(bulkDeleteMediaInputSchema.safeParse({ ids: many }).success).toBe(false);
    expect(bulkDeleteMediaInputSchema.safeParse({ ids: [id], force: true }).success).toBe(false);
  });

  it('parses the bulk result and rejects non-uuid entries', () => {
    expect(bulkDeleteMediaResultSchema.parse({ deleted: [id], inUse: [] })).toEqual({ deleted: [id], inUse: [] });
    expect(bulkDeleteMediaResultSchema.safeParse({ deleted: ['x'], inUse: [] }).success).toBe(false);
  });
});
