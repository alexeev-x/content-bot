import type { PostDto } from '@alexeev/contracts';
import { listStateOf } from './post-state';

export type PostSortKey = 'title' | 'status' | 'updated' | 'revision' | 'channels' | 'sentAt' | 'left';
export type SortDirection = 'ascending' | 'descending';
export type PostSort = { key: PostSortKey; direction: SortDirection } | null;

const collator = new Intl.Collator('ru-RU', { numeric: true, sensitivity: 'base' });
const stateOrder = { draft: 0, approved: 1, scheduled: 2, sending: 3, unknown: 4, archived: 5 } as const;

function compareOptionalNumber(left: number | null, right: number | null): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return left - right;
}

function compare(left: PostDto, right: PostDto, key: PostSortKey): number {
  switch (key) {
    case 'title':
      return collator.compare(left.title, right.title);
    case 'status':
      return stateOrder[listStateOf(left).kind] - stateOrder[listStateOf(right).kind];
    case 'updated':
      return Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
    case 'revision':
      return left.revision - right.revision;
    case 'channels':
      return collator.compare(
        left.publicationSummary.destinations.map((item) => item.title).join(', '),
        right.publicationSummary.destinations.map((item) => item.title).join(', ')
      );
    case 'sentAt':
      return compareOptionalNumber(
        left.publicationSummary.lastSentAt === null ? null : Date.parse(left.publicationSummary.lastSentAt),
        right.publicationSummary.lastSentAt === null ? null : Date.parse(right.publicationSummary.lastSentAt)
      );
    case 'left':
      return compareOptionalNumber(
        left.autoDeleteAt === null ? null : Date.parse(left.autoDeleteAt),
        right.autoDeleteAt === null ? null : Date.parse(right.autoDeleteAt)
      );
  }
}

/** Sorts the rows currently loaded by the infinite list; blank archive values stay at the end. */
export function sortPosts(rows: readonly PostDto[], sort: PostSort): PostDto[] {
  if (sort === null) return [...rows];
  const sign = sort.direction === 'ascending' ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (sort.key === 'sentAt' || sort.key === 'left') {
      const leftValue = sort.key === 'sentAt' ? left.publicationSummary.lastSentAt : left.autoDeleteAt;
      const rightValue = sort.key === 'sentAt' ? right.publicationSummary.lastSentAt : right.autoDeleteAt;
      if ((leftValue === null) !== (rightValue === null)) return leftValue === null ? 1 : -1;
    }
    return compare(left, right, sort.key) * sign;
  });
}

export function nextPostSort(current: PostSort, key: PostSortKey): PostSort {
  if (current?.key !== key) return { key, direction: 'ascending' };
  if (current.direction === 'ascending') return { key, direction: 'descending' };
  return null;
}
