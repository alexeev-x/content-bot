import { describe, expect, it } from 'vitest';
import { publicationSchema } from '../src/publications';

const base = {
  id: crypto.randomUUID(),
  postId: crypto.randomUUID(),
  postRevision: 1,
  destinationId: crypto.randomUUID(),
  status: 'scheduled',
  scheduledAt: '2026-11-01T10:00:00.000Z',
  timezone: 'Europe/Moscow',
  revision: 0,
  createdAt: '2026-11-01T09:00:00.000Z',
  updatedAt: '2026-11-01T09:00:00.000Z'
};

describe('publication rubric mark', () => {
  it('accepts a missing, null or known rubric', () => {
    expect(publicationSchema.parse(base).rubric).toBeUndefined();
    expect(publicationSchema.parse({ ...base, rubric: null }).rubric).toBeNull();
    expect(publicationSchema.parse({ ...base, rubric: { key: 'patch_broken' } }).rubric).toEqual({
      key: 'patch_broken'
    });
  });

  it('refuses an unknown rubric key', () => {
    expect(publicationSchema.safeParse({ ...base, rubric: { key: 'nope' } }).success).toBe(false);
  });
});
