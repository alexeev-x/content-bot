import type { PostEntity, PostMediaDto } from '@alexeev/contracts';

export type PostStatus = 'draft' | 'approved';

export interface Post {
  id: string;
  /** The bold first line of the message when `titleInMessage`; otherwise only the studio name (`postNameFromBody`). */
  title: string;
  /** Fixed at creation: false for posts created without a title (owner, 16.10.2026). */
  titleInMessage: boolean;
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

export function approve(post: Post & { media?: PostMediaDto[] }, now: number): ApproveResult {
  if (post.status === 'approved') return { ok: false, reason: 'ALREADY_APPROVED' };
  if (post.body.trim() === '' && (post.media?.length ?? 0) === 0) return { ok: false, reason: 'EMPTY_BODY' };
  return { ok: true, post: { ...post, status: 'approved', updatedAt: now } };
}
