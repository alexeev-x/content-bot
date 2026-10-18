import type { PostDto } from '@alexeev/contracts';
import { ru } from '../../../shared/lib/ru';
import { formatRelative } from '../model/format-time';
import { daysLeftOf, listStateOf } from '../model/post-state';
import { postsCopy } from './copy';

export const shortFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit'
});

const copy = postsCopy;

/** What the badge of the row says, in the words the owner sees. */
function stateLabel(post: PostDto): string {
  const state = listStateOf(post);
  switch (state.kind) {
    case 'unknown':
      return copy.list.state.unknown;
    case 'sending':
      return copy.list.state.sending;
    case 'scheduled':
      return copy.list.state.scheduled;
    case 'archived':
      return ru.status.approved;
    default:
      return ru.status[state.kind];
  }
}

/**
 * Everything the row shows as text, in one string: the search matches title, text, channels, status and times
 * alike. Shared by the desktop table (row text value) and the phone cards.
 */
export function postRowText(post: PostDto, now: number): string {
  const state = listStateOf(post);
  const sent = post.publicationSummary.lastSentAt;
  return [
    post.title,
    post.body,
    post.kind === 'poll' ? copy.poll.mark : '',
    post.poll?.question ?? '',
    stateLabel(post),
    state.kind === 'scheduled' && state.at ? copy.list.scheduledAt(shortFormat.format(new Date(state.at))) : '',
    formatRelative(post.updatedAt, now),
    ...post.publicationSummary.destinations.map((item) => item.title),
    sent ? shortFormat.format(new Date(sent)) : '',
    post.autoDeleteAt === null ? '' : copy.archive.daysLeft(daysLeftOf(post.autoDeleteAt, now))
  ]
    .filter((part) => part !== '')
    .join(' ');
}
