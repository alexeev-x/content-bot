// Copy of the dashboard blocks. Publication status labels are canonical in shared/lib/ru.ts (skill page-spec).
export const copy = {
  loading: 'Загружаем обзор…',
  newPost: 'Новый пост',
  noData: 'Нет данных',
  kpi: {
    label: 'Сводка',
    today: { label: 'Публикации сегодня', short: 'Сегодня', detail: 'Запланировано и отправлено' },
    sent: { label: 'Отправлено в каналы', short: 'Отправлено', detail: 'Успешных публикаций' },
    attention: { label: 'Требует внимания', short: 'Внимание', detail: 'Инциденты и ошибки' },
    next: { label: 'Ближайшая публикация', short: 'Ближайшая', detail: 'Нет запланированных' }
  },
  attention: {
    title: 'Требует внимания',
    clear: 'Всё под контролем',
    checking: 'Проверяем систему…',
    all: 'Все ошибки',
    check: 'Проверить',
    open: 'Открыть',
    unknownTag: 'Требует проверки',
    unknownReason: 'Telegram не ответил. Сообщение могло уйти.',
    failedTag: 'Ошибка публикации',
    failedReason: 'Публикация не ушла.',
    stuckTag: 'Просрочено',
    stuckReason: 'Время прошло, а отправка не началась.',
    systemTag: 'Система',
    checkLabel: (title: string) => `Проверить: «${title}»`,
    openLabel: (title: string) => `Открыть: «${title}»`
  },
  today: {
    title: 'Сегодня',
    all: 'Все публикации',
    empty: 'На сегодня публикаций нет'
  },
  upcoming: {
    title: 'Ближайшие',
    all: 'Все запланированные',
    allShort: 'Все',
    empty: 'Ничего не запланировано',
    create: 'Опубликовать пост'
  },
  recent: {
    title: 'Последние публикации',
    all: 'Все публикации',
    allFooter: 'Все публикации',
    empty: 'Пока ничего не отправлено',
    time: 'Время',
    post: 'Пост',
    status: 'Статус',
    link: 'Ссылка',
    openInTelegram: 'Открыть в Telegram'
  },
  system: { title: 'Система', empty: 'Нет данных о системе' },
  error: {
    title: 'Не удалось загрузить обзор',
    message: 'Данные не получены. Ничего не изменилось. Повторите запрос.',
    forbiddenTitle: 'Нет доступа',
    forbiddenMessage: 'Эта учётная запись не может смотреть обзор.'
  },
  stale: { title: 'Данные устарели', refresh: 'Обновить' },
  gridLabel: 'Виджеты обзора'
} as const;
