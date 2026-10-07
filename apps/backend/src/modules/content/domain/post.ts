import type { PostEntity } from '@alexeev/contracts';

export type PostStatus = 'draft' | 'approved';

export interface Post {
  id: string;
  title: string;
  body: string;
  /** Telegram entities of `body` in their normal form; offsets are UTF-16 code units. */
  entities: PostEntity[];
  revision: number;
  status: PostStatus;
  /** UTC epoch milliseconds; null while the post is live. */
  archivedAt: number | null;
  /** UTC epoch milliseconds. */
  updatedAt: number;
}

export type ApproveResult = { ok: true; post: Post } | { ok: false; reason: 'ALREADY_APPROVED' | 'EMPTY_BODY' };

// Only drafts are edited; an approved post is what publications refer to.
export function canEdit(post: Post): boolean {
  return post.status === 'draft';
}

export function approve(post: Post, now: number): ApproveResult {
  if (post.status === 'approved') return { ok: false, reason: 'ALREADY_APPROVED' };
  if (post.body.trim() === '') return { ok: false, reason: 'EMPTY_BODY' };
  return { ok: true, post: { ...post, status: 'approved', updatedAt: now } };
}
