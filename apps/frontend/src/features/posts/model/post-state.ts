import type { PostDto } from '@alexeev/contracts';

/** The list state of a post, first match wins (docs/design/UX_SPEC.md §3.2). Archived posts only appear in the archive view. */
export type PostListState =
  | { kind: 'archived' }
  | { kind: 'unknown' }
  | { kind: 'sending' }
  | { kind: 'scheduled'; at: string | null }
  | { kind: 'approved' }
  | { kind: 'draft' };

/** Why a post cannot be deleted right now; the server answers 409 for the same two cases. */
export type DeleteBlock = 'in_progress' | 'unknown';

const count = (post: PostDto, ...statuses: Array<keyof PostDto['publicationSummary']['counts']>): number =>
  statuses.reduce((sum, status) => sum + (post.publicationSummary.counts[status] ?? 0), 0);

export function listStateOf(post: PostDto): PostListState {
  if (post.archivedAt !== null) return { kind: 'archived' };
  if (count(post, 'unknown') > 0) return { kind: 'unknown' };
  if (count(post, 'preparing', 'sending') > 0) return { kind: 'sending' };
  if (count(post, 'scheduled', 'queued', 'retry_wait') > 0) {
    return { kind: 'scheduled', at: post.publicationSummary.nextScheduled?.scheduledAt ?? null };
  }
  return { kind: post.status === 'approved' ? 'approved' : 'draft' };
}

/** `unknown` outranks in-progress: a send that may have happened needs a person, not patience. */
export function deleteBlockOf(post: PostDto): DeleteBlock | null {
  if (count(post, 'unknown') > 0) return 'unknown';
  if (count(post, 'preparing', 'sending') > 0) return 'in_progress';
  return null;
}

/** Publications that would be cancelled (and removed) together with the post. */
export function waitingCountOf(post: PostDto): number {
  return count(post, 'scheduled', 'queued', 'retry_wait');
}

/** Title of the channel the nearest scheduled publication goes to, when the summary lists it. */
export function nextChannelTitle(post: PostDto): string | undefined {
  const next = post.publicationSummary.nextScheduled;
  return next ? post.publicationSummary.destinations.find((item) => item.id === next.destinationId)?.title : undefined;
}

const DAY_MS = 86_400_000;

/** Whole days until the automatic deletion, rounded up so «0 дн.» is never shown while the post still exists. */
export function daysLeftOf(autoDeleteAt: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(autoDeleteAt).getTime() - now) / DAY_MS));
}

/** The last days are shown with a warning; the text carries the meaning, not the colour. */
export const ARCHIVE_WARNING_DAYS = 3;

/** «1 пост», «2 поста», «5 постов». */
export function pluralPosts(n: number): string {
  return `${n} ${pluralWord(n, 'пост', 'поста', 'постов')}`;
}

export function pluralWord(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
