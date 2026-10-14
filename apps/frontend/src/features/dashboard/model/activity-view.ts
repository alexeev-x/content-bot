import type { ActivityAction, ActivityCategory, ActivityItemDto } from '@alexeev/contracts';
import type { IconName } from '../../../shared/ui';

type ActionView = { text: string; icon: IconName };

// What the owner reads for each event: the outcome in their words, never the action id.
const ACTIONS: Record<ActivityAction, ActionView> = {
  'post.create': { text: 'Создан пост', icon: 'edit' },
  'post.approve': { text: 'Пост одобрен', icon: 'check-circle' },
  'post.return_to_draft': { text: 'Пост возвращён в черновики', icon: 'undo' },
  'post.archive': { text: 'Пост перенесён в архив', icon: 'folder' },
  'post.restore': { text: 'Пост возвращён из архива', icon: 'folder' },
  'post.delete': { text: 'Пост удалён', icon: 'trash' },
  'post.purge': { text: 'Пост удалён из архива', icon: 'trash' },
  'media.upload': { text: 'Загружен файл', icon: 'upload' },
  'media.derive': { text: 'Файл обрезан', icon: 'crop' },
  'media.delete': { text: 'Файл удалён', icon: 'trash' },
  'publication.create': { text: 'Публикация запланирована', icon: 'calendar' },
  'publication.reschedule': { text: 'Публикация перенесена', icon: 'clock' },
  'publication.cancel': { text: 'Публикация отменена', icon: 'minus-circle' },
  'publication.resolve_unknown': { text: 'Результат отправки сверен', icon: 'check' },
  'publication.delete': { text: 'Запись публикации удалена', icon: 'trash' },
  'job.succeeded': { text: 'Опубликовано в Telegram', icon: 'send' },
  'job.retry_wait': { text: 'Telegram попросил подождать', icon: 'retry' },
  'job.failed': { text: 'Публикация не отправлена', icon: 'x-circle' },
  'job.unknown': { text: 'Отправка не подтверждена', icon: 'alert' },
  'incident.resolve': { text: 'Проблема закрыта', icon: 'check-circle' },
  'destination.create': { text: 'Канал подключён', icon: 'channel' },
  'destination.update': { text: 'Канал изменён', icon: 'channel' },
  'automation.pause': { text: 'Автопроверка источников на паузе', icon: 'pause' },
  'automation.resume': { text: 'Автопроверка источников включена', icon: 'play' },
  'automation.run_now': { text: 'Запущена проверка источников', icon: 'retry' }
};

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  posts: 'Посты',
  media: 'Медиа',
  publications: 'Публикации',
  errors: 'Ошибки',
  system: 'Система'
};

/** The status-colour group an event borrows, so errors read as errors and sends as done. */
export type ActivityTone = 'done' | 'failed' | 'unknown' | 'active' | 'muted';

export function activityView(item: ActivityItemDto): ActionView & { tone: ActivityTone; subject: string | null } {
  const view = ACTIONS[item.action];
  const tone: ActivityTone =
    item.action === 'job.failed'
      ? 'failed'
      : item.action === 'job.unknown'
        ? 'unknown'
        : item.action === 'job.succeeded'
          ? 'done'
          : item.category === 'publications'
            ? 'active'
            : 'muted';
  return { ...view, tone, subject: item.title?.trim() || null };
}

/** Events closer than `gap` percent of the day share one dot; each group keeps its events newest first. */
export function groupByTime<T extends { percent: number }>(points: readonly T[], gap: number): T[][] {
  const sorted = [...points].sort((a, b) => a.percent - b.percent);
  const groups: T[][] = [];
  for (const point of sorted) {
    const last = groups.at(-1);
    const first = last?.[0];
    if (last && first && point.percent - first.percent < gap) last.push(point);
    else groups.push([point]);
  }
  return groups;
}
