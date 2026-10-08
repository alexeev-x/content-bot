// Every screen and forced state of the prototype, for the index page and the floating switcher.
export type ProtoState = { id: string; label: string; query: string; note?: string };
export type ProtoScreen = { id: string; label: string; path: string; states: ProtoState[] };

const common: ProtoState[] = [
  { id: 'default', label: 'Данные', query: '' },
  { id: 'loading', label: 'Загрузка', query: 'state=loading' },
  { id: 'empty', label: 'Пусто', query: 'state=empty' },
  { id: 'error', label: 'Ошибка', query: 'state=error' }
];

export const SCREENS: ProtoScreen[] = [
  {
    id: 'home',
    label: 'Обзор',
    path: '',
    states: [
      ...common,
      { id: 'problem', label: 'Проблема с ботом (3 в «Требует внимания»)', query: 'state=problem' },
      { id: 'real', label: 'Реальный DEV: без медиа и метрик', query: 'state=real' },
      { id: 'nochannel', label: 'Канал не подключён', query: 'state=nochannel' }
    ]
  },
  {
    id: 'posts',
    label: 'Посты',
    path: 'posts',
    states: [
      ...common,
      { id: 'drafts', label: 'Черновики', query: 'view=drafts' },
      { id: 'archive', label: 'Архив', query: 'view=archive' },
      { id: 'stale', label: 'Данные устарели', query: 'state=stale' }
    ]
  },
  {
    id: 'publications',
    label: 'Публикации',
    path: 'publications',
    states: [
      ...common,
      { id: 'errors', label: 'Вкладка «Ошибки»', query: 'view=errors' },
      { id: 'scheduled', label: 'Инспектор: запланировано', query: 'id=u1' },
      { id: 'unknown', label: 'Инспектор: «Требует проверки»', query: 'view=errors&id=u4' },
      { id: 'stale', label: 'Данные устарели', query: 'state=stale' }
    ]
  },
  {
    id: 'incidents',
    label: 'Инциденты',
    path: 'incidents',
    states: [...common, { id: 'closed', label: 'Закрытые', query: 'view=closed' }]
  },
  {
    id: 'editor-new',
    label: 'Редактор: новый пост',
    path: 'posts/new',
    states: [
      { id: 'default', label: 'Пустой', query: '' },
      { id: 'keyboard', label: 'Клавиатура (телефон)', query: 'state=keyboard' },
      { id: 'failed', label: 'Не удалось сохранить', query: 'state=failed' }
    ]
  },
  {
    id: 'editor-approved',
    label: 'Редактор: одобренный пост',
    path: 'posts/p4',
    states: [
      { id: 'default', label: 'Одобрен', query: '' },
      { id: 'conflict', label: 'Конфликт 409', query: 'state=conflict' },
      { id: 'mini', label: 'Mini App', query: 'mini=1' }
    ]
  },
  {
    id: 'editor-draft',
    label: 'Редактор: черновик',
    path: 'posts/p3',
    states: [{ id: 'default', label: 'Черновик', query: '' }]
  },
  {
    id: 'channels',
    label: 'Настройки: каналы',
    path: 'settings/channels',
    states: common
  },
  {
    id: 'appearance',
    label: 'Настройки: оформление',
    path: 'settings/appearance',
    states: [{ id: 'default', label: 'Оформление', query: '' }]
  },
  {
    id: 'settings',
    label: 'Настройки: список (телефон)',
    path: 'settings',
    states: [{ id: 'default', label: 'Список', query: '' }]
  },
  {
    id: 'login',
    label: 'Вход',
    path: 'login',
    states: [
      { id: 'default', label: 'Обычный', query: '' },
      { id: 'forbidden', label: 'Чужой аккаунт (403)', query: 'state=forbidden' },
      { id: 'retry', label: 'Повтор через…', query: 'state=retry' },
      { id: 'expired', label: 'Ссылка устарела', query: 'state=expired' }
    ]
  },
  { id: 'notfound', label: '404', path: 'no-such-page', states: [{ id: 'default', label: '404', query: '' }] },
  {
    id: 'calendar',
    label: 'Превью: Календарь',
    path: 'calendar',
    states: [
      { id: 'month', label: 'Месяц', query: 'view=month' },
      { id: 'week', label: 'Неделя', query: 'view=week' },
      { id: 'day', label: 'День', query: 'view=day' },
      { id: 'list', label: 'Список', query: 'view=list' },
      { id: 'inspector-day', label: 'Инспектор: день из 3 записей', query: 'view=month&date=2026-10-08' },
      { id: 'inspector-five', label: 'Инспектор: день с «ещё 2»', query: 'view=month&date=2026-10-15' },
      { id: 'inspector-empty', label: 'Инспектор: пустой день', query: 'view=month&date=2026-10-11' },
      { id: 'collision', label: 'Две записи в одно время', query: 'view=month&date=2026-10-12&id=c14' },
      { id: 'unknown', label: 'Запись «Требует проверки»', query: 'view=month&date=2026-10-07&id=c6' },
      { id: 'empty-month', label: 'Пустой месяц', query: 'view=month&date=2026-12-01' },
      { id: 'loading', label: 'Загрузка', query: 'state=loading' },
      { id: 'empty', label: 'Пусто', query: 'state=empty' },
      { id: 'error', label: 'Ошибка', query: 'state=error' }
    ]
  },
  {
    id: 'media',
    label: 'Превью: Медиатека',
    path: 'media',
    states: [
      { id: 'grid', label: 'Сетка', query: '' },
      { id: 'grid-inspector', label: 'Сетка + инспектор', query: 'id=m1' },
      { id: 'list', label: 'Список', query: 'mode=list' },
      { id: 'list-inspector', label: 'Список + инспектор', query: 'mode=list&id=m2' },
      { id: 'unavailable', label: 'Недоступный файл', query: 'id=m22' },
      { id: 'unused', label: 'Не используется', query: 'id=m10' },
      { id: 'upload', label: 'Загрузка: ожидание', query: 'state=upload' },
      { id: 'upload-drag', label: 'Загрузка: перетаскивание', query: 'state=upload-drag' },
      { id: 'select', label: 'Выбор из редактора', query: 'state=select' },
      { id: 'gif', label: 'Вкладка GIF', query: 'view=gif' },
      { id: 'loading', label: 'Загрузка', query: 'state=loading' },
      { id: 'empty', label: 'Пусто', query: 'state=empty' },
      { id: 'error', label: 'Ошибка', query: 'state=error' }
    ]
  },
  {
    id: 'automations',
    label: 'Превью: Автоматизации',
    path: 'automations',
    states: [
      { id: 'jobs', label: 'Задачи', query: '' },
      { id: 'overview', label: 'Инспектор: Обзор', query: 'id=j1' },
      { id: 'logs', label: 'Инспектор: Логи', query: 'id=j1&tab=logs' },
      { id: 'settings', label: 'Инспектор: Настройки', query: 'id=j1&tab=settings' },
      { id: 'failed', label: 'Инспектор: ошибка запуска', query: 'id=j4&tab=logs' },
      { id: 'runs', label: 'Последние запуски', query: 'view=runs' },
      { id: 'loading', label: 'Загрузка', query: 'state=loading' },
      { id: 'empty', label: 'Пусто', query: 'state=empty' },
      { id: 'error', label: 'Ошибка', query: 'state=error' }
    ]
  },
  {
    id: 'analytics',
    label: 'Превью: Аналитика',
    path: 'analytics',
    states: [
      { id: 'data', label: 'Данные', query: '' },
      { id: 'week-group', label: 'Месяц (неполные данные)', query: 'period=month' },
      { id: 'partial', label: 'Один график с ошибкой', query: 'state=partial' },
      { id: 'loading', label: 'Загрузка', query: 'state=loading' },
      { id: 'empty', label: 'Пустой период', query: 'state=empty' },
      { id: 'error', label: 'Ошибка', query: 'state=error' }
    ]
  },
  {
    id: 'sources',
    label: 'Превью: Dota Pulse и Источники',
    path: 'sources',
    states: [
      { id: 'events', label: 'События', query: '' },
      { id: 'sources', label: 'Источники', query: 'view=sources' },
      { id: 'source-inspector', label: 'Источник: недоступен', query: 'view=sources&id=s2' },
      { id: 'unreachable', label: 'Источник не отвечает', query: 'state=unreachable' },
      { id: 'partial', label: 'События из 2 источников', query: 'state=partial' },
      { id: 'loading', label: 'Загрузка', query: 'state=loading' },
      { id: 'empty', label: 'Пусто', query: 'state=empty' },
      { id: 'error', label: 'Ошибка', query: 'state=error' }
    ]
  },
  {
    id: 'palette',
    label: 'Превью: Палитра поиска (⌘K)',
    path: 'palette',
    states: [
      { id: 'empty-query', label: 'Пустой запрос', query: '' },
      { id: 'typing', label: 'Запрос «патч»', query: 'state=typing' },
      { id: 'none', label: 'Нет результатов', query: 'state=none' },
      { id: 'loading', label: 'Загрузка постов', query: 'state=loading' },
      { id: 'offline', label: 'Без сети', query: 'state=offline' }
    ]
  },
  {
    id: 'patterns',
    label: 'Паттерны',
    path: 'patterns',
    states: [{ id: 'default', label: 'Лист паттернов', query: '' }]
  }
];

/** Per-screen forced-state options for the floating switcher. */
export const screenOf = (path: string): ProtoScreen | undefined => {
  const exact = SCREENS.find((screen) => screen.path === path);
  if (exact) return exact;
  if (path.startsWith('posts/')) return SCREENS.find((s) => s.id === 'editor-approved');
  return undefined;
};
