import {
  type PostEntity,
  type PostKind,
  type PostMediaDto,
  type PostPoll,
  type PostSendOptions,
  expandRichMedia,
  pollIssue,
  richHtmlIssue
} from '@alexeev/contracts';

export type PostStatus = 'draft' | 'approved';

export interface Post {
  id: string;
  /** The studio name only (`postNameFromBody`); never part of the message. */
  title: string;
  body: string;
  /** Telegram entities of `body` in their normal form; offsets are UTF-16 code units. */
  entities: PostEntity[];
  /** Fixed at creation. A poll post has an empty body and no media. */
  kind: PostKind;
  /** Set exactly when `kind` is 'poll'. A draft poll may be incomplete (see `pollIssue`). */
  poll: PostPoll | null;
  sendOptions: PostSendOptions;
  /** The approved rich format (contracts post-rich.ts), sent instead of `body`; null for a classic post. */
  richHtml: string | null;
  revision: number;
  status: PostStatus;
  /** UTC epoch milliseconds; null while the post is live. */
  archivedAt: number | null;
  /** UTC epoch milliseconds. */
  updatedAt: number;
}

export type ApproveResult =
  | { ok: true; post: Post }
  | { ok: false; reason: 'ALREADY_APPROVED' | 'EMPTY_BODY' }
  | { ok: false; reason: 'POLL_INVALID'; issue: string }
  | { ok: false; reason: 'RICH_INVALID'; issue: string };

// Only drafts are edited; an approved post is what publications refer to.
export function canEdit(post: Post): boolean {
  return post.status === 'draft';
}

export function approve(post: Post & { media?: PostMediaDto[] }, now: number): ApproveResult {
  if (post.status === 'approved') return { ok: false, reason: 'ALREADY_APPROVED' };
  if (post.kind === 'poll') {
    const issue = post.poll === null ? 'QUESTION_EMPTY' : pollIssue(post.poll);
    if (issue !== null) return { ok: false, reason: 'POLL_INVALID', issue };
    return { ok: true, post: { ...post, status: 'approved', updatedAt: now } };
  }
  if (post.richHtml !== null) {
    // The media it names must be attached and the markup within the approved rules, checked again before sending.
    const media = post.media ?? [];
    const issue = richHtmlIssue(expandRichMedia(post.richHtml, media), media.length);
    if (issue !== null) return { ok: false, reason: 'RICH_INVALID', issue };
    return { ok: true, post: { ...post, status: 'approved', updatedAt: now } };
  }
  if (post.body.trim() === '' && (post.media?.length ?? 0) === 0) return { ok: false, reason: 'EMPTY_BODY' };
  return { ok: true, post: { ...post, status: 'approved', updatedAt: now } };
}
