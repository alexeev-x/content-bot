import { describe, expect, it } from 'vitest';
import { mediaLibraryQuerySchema } from '../src/media';
import { listPostsQuerySchema } from '../src/posts';
import { listPublicationsQuerySchema } from '../src/publications';

describe.each([
  ['posts', listPostsQuerySchema],
  ['publications', listPublicationsQuerySchema],
  ['media', mediaLibraryQuerySchema]
])('%s page-number query', (_name, schema) => {
  it('coerces page and keeps cursor-only callers working', () => {
    expect(schema.parse({ page: '2', limit: '15' })).toMatchObject({ page: 2, limit: 15 });
    expect(schema.parse({ cursor: 'abc' })).toMatchObject({ cursor: 'abc', limit: 20 });
  });

  it('rejects page 0, page beyond 1000, fractions and page with cursor', () => {
    expect(schema.safeParse({ page: '0' }).success).toBe(false);
    expect(schema.safeParse({ page: '1001' }).success).toBe(false);
    expect(schema.safeParse({ page: '1.5' }).success).toBe(false);
    expect(schema.safeParse({ page: '2', cursor: 'abc' }).success).toBe(false);
  });
});
