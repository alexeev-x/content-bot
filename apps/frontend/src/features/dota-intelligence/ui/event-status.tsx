import type { SourceEventDto, SourceEventStatus, SourceEventType } from '@alexeev/contracts';
import { StatusBadge, StatusPill } from '../../../shared/ui';

export const TYPE_LABEL: Record<SourceEventType, string> = {
  patch: 'Патч',
  treasure: 'Сокровищница',
  news: 'Новость'
};

const STATUS_PILLS: Record<
  SourceEventStatus,
  { label: string; group: 'active' | 'muted' | 'done'; icon: 'sparkle' | 'edit' | 'check-circle' | 'minus-circle' }
> = {
  new: { label: 'Новое', group: 'active', icon: 'sparkle' },
  drafted: { label: 'Черновик', group: 'muted', icon: 'edit' },
  published: { label: 'Опубликовано', group: 'done', icon: 'check-circle' },
  hidden: { label: 'Пропущено', group: 'muted', icon: 'minus-circle' }
};

/** One status per event: the publication's own badge once there is one, «ИИ пишет» while the bot holds the draft. */
export function EventStatus({ event }: { event: SourceEventDto }) {
  if (event.status === 'drafted' && event.publication) return <StatusBadge status={event.publication.status} />;
  if (event.isPast && !event.aiRequested) return <StatusPill label="Прошлый анонс" group="muted" icon="minus-circle" />;
  if (event.aiWriting) return <StatusPill label="ИИ пишет" group="active" icon="sparkle" />;
  if (event.aiRequested && event.status === 'new')
    return <StatusPill label="Черновик в боте" group="active" icon="edit" />;
  return <StatusPill {...STATUS_PILLS[event.status]} />;
}
