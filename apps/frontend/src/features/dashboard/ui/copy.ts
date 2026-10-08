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
    all: 'Все инциденты',
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
  widgetError: 'Не удалось загрузить данные',
  retry: 'Повторить',
  drafts: {
    title: 'Черновики',
    all: 'Все черновики',
    empty: 'Черновиков нет',
    untitled: 'Без названия',
    continue: 'Продолжить',
    continueLabel: (title: string) => `Продолжить: «${title}»`,
    edited: (when: string) => `Изменён ${when}`
  },
  week: {
    title: 'Неделя',
    all: 'Все запланированные',
    hint: 'Список открывается без фильтра по дате: такого фильтра пока нет.',
    truncated: (limit: number) => `Показаны первые ${limit} публикаций недели.`,
    none: 'нет публикаций',
    dayLabel: (day: string, count: number) => `${day}: ${count === 0 ? 'нет публикаций' : `публикаций ${count}`}`,
    today: 'сегодня'
  },
  channels: {
    title: 'Каналы',
    add: 'Добавить канал',
    empty: 'Каналов пока нет',
    bot: 'Бот',
    kind: { channel: 'Канал', group: 'Группа' },
    enabled: 'Включён',
    disabled: 'Отключён',
    all: 'Все каналы'
  },
  incidents: {
    title: 'Инциденты',
    all: 'Все инциденты',
    open: 'Открытые',
    closed: 'Закрыто за 7 дней',
    latest: 'Последний',
    none: 'Инцидентов нет'
  },
  quick: {
    title: 'Быстрые действия',
    newPost: 'Новый пост',
    publish: 'Опубликовать пост',
    addChannel: 'Добавить канал'
  },
  empty: {
    title: 'Обзор пуст',
    description: 'Нажмите «Настроить» и добавьте виджеты.'
  },
  layoutError: {
    title: 'Не удалось загрузить раскладку',
    message: 'Показан сохранённый или стандартный вид. Настроить обзор пока нельзя.',
    retry: 'Повторить'
  },
  customize: 'Настроить',
  size: { expand: 'Развернуть', collapse: 'Свернуть' },
  edit: {
    toolbar: 'Настройка обзора',
    done: 'Готово',
    cancel: 'Отмена',
    reset: 'Сбросить к стандартному',
    addWidget: 'Добавить виджет',
    gridLabel: 'Виджеты обзора',
    saved: 'Раскладка сохранена',
    saveFailedTitle: 'Не удалось сохранить раскладку',
    saveFailedMessage: 'Правки остались на экране. Повторите.',
    reasons: {
      OUT_OF_GRID: 'Виджет выходит за сетку.',
      DUPLICATE_WIDGET_ID: 'Один виджет добавлен дважды.',
      WIDGETS_OVERLAP: 'Виджеты пересекаются.'
    },
    conflictTitle: 'Раскладку изменили в другом окне',
    conflictBody: 'Ваши правки остались на экране. Загрузите чужую раскладку или сохраните свою поверх.',
    reload: 'Загрузить заново',
    keepMine: 'Сохранить мою',
    reloadFailed: 'Не удалось загрузить раскладку. Правки остались на экране.',
    discardTitle: 'Отменить правки?',
    discardBody: 'Несохранённые изменения раскладки пропадут.',
    discardConfirm: 'Отменить правки',
    leaveTitle: 'Уйти без сохранения?',
    leaveConfirm: 'Уйти',
    discardKeep: 'Продолжить настройку',
    swapped: (a: string, b: string) => `${a} и ${b} поменялись местами`,
    removed: (title: string) => `Виджет «${title}» удалён`,
    added: (title: string) => `Виджет «${title}» добавлен`,
    resetDone: 'Стандартная раскладка. Нажмите «Готово», чтобы сохранить.',
    undo: 'Вернуть',
    handle: 'Перетащить виджет',
    resizeHandle: 'Изменить размер',
    sizeCaption: (w: number, h: number) => `${w} × ${h}`,
    menuLabel: (title: string) => `Действия: ${title}`,
    actions: {
      'move-left': 'Переместить влево',
      'move-right': 'Переместить вправо',
      'move-up': 'Переместить вверх',
      'move-down': 'Переместить вниз',
      wider: 'Шире',
      narrower: 'Уже',
      taller: 'Выше',
      shorter: 'Ниже',
      remove: 'Удалить'
    },
    phoneList: 'Порядок виджетов',
    phoneMoveUp: 'Переместить выше',
    phoneMoveDown: 'Переместить ниже',
    phoneHint: 'На телефоне виджеты идут в один столбец; меняется только порядок.',
    catalog: {
      title: 'Добавить виджет',
      available: 'Доступные',
      placed: 'Уже на странице',
      soonTitle: 'Скоро',
      soon: 'скоро',
      add: 'Добавить'
    }
  }
} as const;
