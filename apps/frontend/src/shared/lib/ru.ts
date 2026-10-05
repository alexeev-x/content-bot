// Typed copy dictionary (no i18n library).
export const ru = {
  appName: 'ALEXEEV Studio',
  nav: {
    label: 'Разделы',
    dashboard: 'Обзор',
    posts: 'Публикации',
    calendar: 'Календарь',
    media: 'Медиа',
    incidents: 'Инциденты',
    settings: 'Настройки'
  },
  theme: { label: 'Тема', light: 'Светлая', dark: 'Тёмная', system: 'Системная' },
  inDevelopment: {
    title: 'Раздел в разработке',
    description: 'Здесь пока нет данных и действий. Ничего не отправляется и не сохраняется.'
  },
  pages: {
    dashboard: 'Обзор',
    posts: 'Публикации',
    postNew: 'Новый черновик',
    postEdit: 'Редактор публикации',
    calendar: 'Календарь',
    media: 'Медиа',
    incidents: 'Инциденты',
    settings: 'Настройки',
    login: 'Вход',
    notFound: 'Страница не найдена'
  },
  login: {
    button: 'Войти через Telegram',
    explanation: 'Авторизация ещё не реализована, поэтому вход пока недоступен.'
  },
  notFound: { description: 'Такого адреса нет в админке.', back: 'К обзору' },
  health: {
    title: 'Состояние сервиса',
    loading: 'Проверяем сервис…',
    error: 'Не удалось получить состояние сервиса.',
    retry: 'Повторить',
    ok: 'Сервис работает',
    service: 'Сервис',
    checkedAt: 'Проверено',
    publishingDisabled: 'Публикация отключена',
    publishingEnabled: 'Публикация включена'
  },
  routeError: {
    title: 'Что-то пошло не так',
    description: 'Страницу не удалось показать. Попробуйте ещё раз.',
    requestId: 'Идентификатор запроса'
  },
  common: { retry: 'Повторить' }
} as const;
