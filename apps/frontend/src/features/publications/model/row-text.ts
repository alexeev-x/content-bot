import type { PostDto, PublicationDto } from '@alexeev/contracts';
import { ru } from '../../../shared/lib/ru';
import { formatShort } from './format-time';
import { displayStatus } from './publication-view';

/**
 * Everything the row shows as text, in one string: the search matches the post title and text, the channel, the
 * status the owner sees (never the raw one: a send without a message id reads «Требует проверки») and the time.
 * Shared by the desktop table (row text value) and the phone cards.
 */
export function publicationRowText(
  row: PublicationDto,
  post: PostDto | undefined,
  channelTitle: string | undefined,
  timeZone: string
): string {
  return [post?.title, post?.body, channelTitle, ru.status[displayStatus(row)], formatShort(row.scheduledAt, timeZone)]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' ');
}
