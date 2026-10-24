import type { MediaUsageDto } from '@alexeev/contracts';
import { MEDIA_USAGE_LIST_MAX } from '@alexeev/contracts';
import { formatDayClock } from '../../../shared/lib/clock';

/** What stops `detach=all` for one file; `none` means deleting is possible now. */
export type DeleteBlock = { kind: 'none' } | { kind: 'sending'; titles: string[] } | { kind: 'too-many-drafts' };

export const postTitle = (value: string | null) => `«${value || 'Без названия'}»`;

/** Only a publication being sent or >20 drafts stop a delete; everything else, crops included, is warned. */
export function deleteBlock(usage: MediaUsageDto): DeleteBlock {
  if (usage.sending.length > 0) return { kind: 'sending', titles: usage.sending.map((post) => postTitle(post.title)) };
  if (!usage.detachable) return { kind: 'too-many-drafts' };
  return { kind: 'none' };
}

export const sendingSentence = (titles: string[]) =>
  `Публикация ${titles.slice(0, 3).join(', ')} сейчас отправляется. Попробуйте через минуту.`;

export const derivativesSentence = (count: number) =>
  `Обрезанные копии (${count}) останутся в «Медиа» отдельными файлами, посты с ними не изменятся.`;

export const tooManyDraftsSentence = `Файл есть больше чем в ${MEDIA_USAGE_LIST_MAX} черновиках. Уберите его из части черновиков и повторите.`;

export function blockSentence(block: DeleteBlock): string {
  switch (block.kind) {
    case 'sending':
      return sendingSentence(block.titles);
    case 'too-many-drafts':
      return tooManyDraftsSentence;
    case 'none':
      return '';
  }
}

export const scheduledLine = (post: MediaUsageDto['scheduled'][number], timeZone: string) =>
  `${postTitle(post.title)} — ${formatDayClock(post.scheduledAt, timeZone)}`;

/** Distinct scheduled publications that deleting these files would touch. */
export function countScheduled(usages: readonly MediaUsageDto[]): number {
  return new Set(usages.flatMap((usage) => usage.scheduled.map((post) => post.publicationId))).size;
}
