import { describe, expect, it } from 'vitest';
import { approve, canEdit, type Post } from './post';

const draft: Post = {
  id: 'p1',
  title: 'T',
  body: 'Hello',
  entities: [],
  revision: 3,
  status: 'draft',
  archivedAt: null,
  updatedAt: 1
};

describe('post rules', () => {
  it('allows editing only drafts', () => {
    expect(canEdit(draft)).toBe(true);
    expect(canEdit({ ...draft, status: 'approved' })).toBe(false);
  });

  it('approves a draft with a body and keeps the revision', () => {
    expect(approve(draft, 99)).toEqual({ ok: true, post: { ...draft, status: 'approved', updatedAt: 99 } });
  });

  it('refuses to approve twice', () => {
    expect(approve({ ...draft, status: 'approved' }, 99)).toEqual({ ok: false, reason: 'ALREADY_APPROVED' });
  });

  it('refuses to approve a blank body', () => {
    expect(approve({ ...draft, body: '  \n ' }, 99)).toEqual({ ok: false, reason: 'EMPTY_BODY' });
  });
});
