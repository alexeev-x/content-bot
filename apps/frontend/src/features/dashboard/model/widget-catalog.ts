import type { DashboardWidgetType } from '@alexeev/contracts';
import type { IconName } from '../../../shared/ui';

export type WidgetSize = { w: number; h: number };

export type WidgetDef = {
  title: string;
  /** One line in the «Добавить виджет» catalog. */
  description: string;
  icon: IconName;
  /** Size a freshly added widget gets (columns x rows). */
  size: WidgetSize;
  /** The smallest size at which the widget still shows its content. */
  min: WidgetSize;
};

/** Every widget is single-instance: its id is its type. */
export const WIDGETS: Record<DashboardWidgetType, WidgetDef> = {
  'kpi-summary': {
    title: 'Сводка',
    description: 'Четыре показателя дня: публикации, отправлено, внимание, ближайшая.',
    icon: 'grid',
    size: { w: 12, h: 2 },
    min: { w: 8, h: 2 }
  },
  'kpi-today': {
    title: 'Публикации сегодня',
    description: 'Сколько публикаций на сегодня.',
    icon: 'file',
    size: { w: 3, h: 2 },
    min: { w: 2, h: 2 }
  },
  'kpi-sent': {
    title: 'Отправлено в каналы',
    description: 'Сколько публикаций ушло сегодня.',
    icon: 'send',
    size: { w: 3, h: 2 },
    min: { w: 2, h: 2 }
  },
  'kpi-attention': {
    title: 'Требует внимания (число)',
    description: 'Число инцидентов и ошибок.',
    icon: 'alert',
    size: { w: 3, h: 2 },
    min: { w: 2, h: 2 }
  },
  'kpi-next': {
    title: 'Ближайшая публикация',
    description: 'Время и остаток до следующей отправки.',
    icon: 'clock',
    size: { w: 3, h: 2 },
    min: { w: 2, h: 2 }
  },
  attention: {
    title: 'Требует внимания',
    description: 'Неизвестные и неудачные отправки, сбои системы.',
    icon: 'alert',
    size: { w: 8, h: 4 },
    min: { w: 4, h: 3 }
  },
  today: {
    title: 'Сегодня',
    description: 'Публикации сегодняшнего дня по времени.',
    icon: 'calendar',
    size: { w: 8, h: 4 },
    min: { w: 4, h: 3 }
  },
  upcoming: {
    title: 'Ближайшие',
    description: 'Следующие запланированные публикации.',
    icon: 'clock',
    size: { w: 4, h: 4 },
    min: { w: 3, h: 3 }
  },
  recent: {
    title: 'Последние публикации',
    description: 'Что ушло в каналы последним, со ссылкой в Telegram.',
    icon: 'send',
    size: { w: 8, h: 5 },
    min: { w: 4, h: 3 }
  },
  drafts: {
    title: 'Черновики',
    description: 'Недавно изменённые черновики с кнопкой «Продолжить».',
    icon: 'edit',
    size: { w: 4, h: 5 },
    min: { w: 3, h: 3 }
  },
  week: {
    title: 'Неделя',
    description: 'Запланированные публикации на ближайшие 7 дней.',
    icon: 'calendar',
    size: { w: 8, h: 3 },
    min: { w: 6, h: 2 }
  },
  channels: {
    title: 'Каналы',
    description: 'Подключённые каналы и состояние бота.',
    icon: 'link',
    size: { w: 4, h: 3 },
    min: { w: 3, h: 3 }
  },
  incidents: {
    title: 'Инциденты',
    description: 'Открытые, закрытые за неделю и последний инцидент.',
    icon: 'x-circle',
    size: { w: 4, h: 3 },
    min: { w: 3, h: 3 }
  },
  system: {
    title: 'Система',
    description: 'Состояние сервиса, публикации и бота.',
    icon: 'settings',
    size: { w: 4, h: 4 },
    min: { w: 3, h: 3 }
  },
  'quick-actions': {
    title: 'Быстрые действия',
    description: 'Новый пост, публикация поста, добавление канала.',
    icon: 'zap',
    size: { w: 4, h: 3 },
    min: { w: 3, h: 3 }
  }
};

/** Catalog order: what the owner reaches for first. */
export const CATALOG_ORDER: readonly DashboardWidgetType[] = [
  'kpi-summary',
  'attention',
  'today',
  'upcoming',
  'recent',
  'week',
  'drafts',
  'channels',
  'incidents',
  'system',
  'quick-actions',
  'kpi-today',
  'kpi-sent',
  'kpi-attention',
  'kpi-next'
];

/** Planned widgets with no data source yet: listed in the catalog as «скоро», never addable. */
export const SOON_WIDGETS: readonly string[] = [
  'Аналитика канала',
  'Топ постов',
  'Dota Pulse',
  'Источники',
  'Автоматизации',
  'Медиатека'
];

const FROM_DASHBOARD: ReadonlySet<DashboardWidgetType> = new Set([
  'kpi-summary',
  'kpi-today',
  'kpi-sent',
  'kpi-attention',
  'kpi-next',
  'attention',
  'today',
  'upcoming',
  'recent'
]);

/** Whether the widget reads the `/dashboard` day summary (one shared request for all of them). */
export const readsDashboard = (type: DashboardWidgetType): boolean => FROM_DASHBOARD.has(type);
