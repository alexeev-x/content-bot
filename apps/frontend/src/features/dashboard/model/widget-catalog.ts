import { DASHBOARD_GRID_COLUMNS, type DashboardWidget, type DashboardWidgetType } from '@alexeev/contracts';

/** The widget types this frontend draws; a saved type outside this list is skipped, never an error. */
export type WidgetKind =
  | 'today'
  | 'upcoming'
  | 'attention'
  | 'week'
  | 'drafts'
  | 'recent'
  | 'system'
  | 'channels'
  | 'kpi-today'
  | 'kpi-sent'
  | 'kpi-attention'
  | 'kpi-next'
  | 'activity';

/** Column spans on the 12-column grid of a wide screen. */
export type WidgetWidth = 3 | 4 | 6 | 8 | 12;

/** One widget on the owner's Обзор, in reading order. */
export type LayoutItem = { id: string; kind: WidgetKind; w: WidgetWidth };

type CatalogEntry = { title: string; description: string; widths: readonly WidgetWidth[]; defaultWidth: WidgetWidth };

export const WIDTH_LABELS: Record<WidgetWidth, string> = {
  3: 'Четверть',
  4: 'Треть',
  6: 'Половина',
  8: 'Две трети',
  12: 'Во всю ширину'
};

export const CATALOG: Record<WidgetKind, CatalogEntry> = {
  today: {
    title: 'Лента дня',
    description: 'Публикации сегодняшнего дня на шкале 00–24.',
    widths: [6, 8, 12],
    defaultWidth: 8
  },
  upcoming: {
    title: 'Следующая публикация',
    description: 'Ближайшая запланированная отправка.',
    widths: [4, 6],
    defaultWidth: 4
  },
  attention: {
    title: 'Требует внимания',
    description: 'Ошибки, неподтверждённые отправки и сбои системы.',
    widths: [6, 12],
    defaultWidth: 12
  },
  week: {
    title: 'Неделя',
    description: 'Отправлено, запланировано и проблемы по дням.',
    widths: [4, 6, 8, 12],
    defaultWidth: 4
  },
  drafts: {
    title: 'Черновики',
    description: 'Последние черновики с переходом к публикации.',
    widths: [4, 6, 8],
    defaultWidth: 4
  },
  recent: {
    title: 'Отправлено недавно',
    description: 'Последние сообщения, которые ушли в каналы.',
    widths: [4, 6, 8, 12],
    defaultWidth: 4
  },
  system: {
    title: 'Система',
    description: 'Сервис, публикация и бот: работает ли всё.',
    widths: [4, 6, 12],
    defaultWidth: 12
  },
  channels: {
    title: 'Каналы',
    description: 'Подключённые каналы и состояние бота.',
    widths: [4, 6],
    defaultWidth: 4
  },
  'kpi-today': {
    title: 'Сегодня',
    description: 'Сколько публикаций на сегодня.',
    widths: [3, 4, 6],
    defaultWidth: 3
  },
  'kpi-sent': {
    title: 'Отправлено сегодня',
    description: 'Сколько сообщений уже ушло сегодня.',
    widths: [3, 4, 6],
    defaultWidth: 3
  },
  'kpi-attention': {
    title: 'Проблемы',
    description: 'Сколько пунктов требует внимания.',
    widths: [3, 4, 6],
    defaultWidth: 3
  },
  activity: {
    title: 'Активность',
    description: 'Всё, что происходило в студии: посты, файлы, публикации, ошибки — по дням, с фильтром.',
    widths: [4, 6, 8, 12],
    defaultWidth: 4
  },
  'kpi-next': {
    title: 'Следующая через',
    description: 'Сколько осталось до ближайшей отправки.',
    widths: [3, 4, 6],
    defaultWidth: 3
  }
};

export const WIDGET_KINDS = Object.keys(CATALOG) as WidgetKind[];

const isKind = (type: DashboardWidgetType): type is WidgetKind => Object.hasOwn(CATALOG, type);

/** The Обзор before the owner customises it: the fixed layout this page had. */
export const DEFAULT_LAYOUT: readonly LayoutItem[] = [
  { id: 'today', kind: 'today', w: 8 },
  { id: 'upcoming', kind: 'upcoming', w: 4 },
  { id: 'attention', kind: 'attention', w: 12 },
  { id: 'week', kind: 'week', w: 4 },
  { id: 'drafts', kind: 'drafts', w: 4 },
  { id: 'recent', kind: 'recent', w: 4 },
  { id: 'system', kind: 'system', w: 12 }
];

function nearestWidth(kind: WidgetKind, w: number): WidgetWidth {
  const widths = CATALOG[kind].widths;
  return widths.reduce((best, candidate) => (Math.abs(candidate - w) < Math.abs(best - w) ? candidate : best));
}

/** Server widgets in reading order (top to bottom, then left to right); unknown types are left out. */
export function fromServer(widgets: readonly DashboardWidget[]): LayoutItem[] {
  return [...widgets]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .flatMap((widget) =>
      isKind(widget.type) ? [{ id: widget.id, kind: widget.type, w: nearestWidth(widget.type, widget.w) }] : []
    );
}

/**
 * The order flowed into 12-column rows, one grid row each (heights follow content on the page), so the stored
 * rectangles never overlap and reading order survives the round trip.
 */
export function toServer(items: readonly LayoutItem[]): DashboardWidget[] {
  let x = 0;
  let y = 0;
  return items.map((item) => {
    if (x + item.w > DASHBOARD_GRID_COLUMNS) {
      x = 0;
      y += 1;
    }
    const widget = { id: item.id, type: item.kind, x, y, w: item.w, h: 1 };
    x += item.w;
    return widget;
  });
}

/** A fresh id for a widget the owner adds; kinds are unique on the page, so the kind itself is the id. */
export function newItem(kind: WidgetKind): LayoutItem {
  return { id: kind, kind, w: CATALOG[kind].defaultWidth };
}

/** The span on a medium screen (760–999 px): narrow widgets pair up, wide ones take the row. */
export function mediumSpan(w: WidgetWidth): number {
  return w >= 8 ? 12 : 6;
}
