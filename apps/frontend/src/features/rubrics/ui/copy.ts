// «Рубрики» copy, kept beside the feature like the bot's.
export const rubricsCopy = {
  title: 'Рубрики',
  description: 'Когда какая рубрика выйдет в канал и почему. Время — московское.',
  forecastTitle: 'Это прогноз',
  forecastBody:
    'План на 35 дней считается заново при каждом открытии и учитывает посты, уже стоящие в «Публикациях». Настоящие слоты стоят вместе с прогнозом, прогноз помечен. Событийные рубрики (патч, анонсы, утечки) появятся, когда случится событие.',
  views: { label: 'Вид календаря', month: 'Месяц', list: 'Список' },
  weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  picture: 'с картинкой',
  poll: 'с опросом',
  empty: 'В ближайшие 35 дней рубрик нет',
  emptyHint: 'Ни одна рубрика не отдохнула или все слоты заняты другими постами.',
  error: 'Не удалось получить прогноз. Повторите запрос.',
  loadError: 'Не удалось загрузить. Повторите запрос.',
  migrationPending: 'Нужна миграция базы: раздел заработает после неё.',
  loading: 'Считаем прогноз…',
  unavailableTitle: (count: number) => `Не могут выходить на этом сервере: ${count}`,
  needs: {
    browser: 'Browser Rendering',
    ai_text: 'ИИ (текст)',
    ai_image: 'ИИ (картинки)',
    ai_upscale: 'ИИ (улучшение фото)',
    stratz: 'STRATZ',
    stats_db: 'база матчей'
  },
  missing: (needs: string) => `нужно: ${needs}`,
  computedAt: (time: string) => `Посчитано в ${time} МСК`,
  tabs: { label: 'Разделы рубрик', calendar: 'Календарь', rubrics: 'Рубрики' },
  scheduler: {
    title: 'Автопубликация рубрик',
    switch: 'Рубрики выходят сами',
    channel: 'Канал',
    channelPlaceholder: 'Выберите канал',
    rehearsal: (title: string) => `Репетиция на DEV: в канал «${title}», без ИИ.`,
    effective: { running: 'Работает', switched_off: 'Выключена', locked: 'Остановлена', unavailable: 'Только прогноз' },
    next: (title: string, when: string) => `Следующая: «${title}», ${when} МСК`,
    lastPlan: (when: string) => `План пересчитан в ${when} МСК`,
    browser: (used: number, cap: number) => `Картинки сегодня: ${used} из ${cap} мин браузера`,
    saveError: 'Не удалось изменить. Обновите страницу и повторите.',
    stale: 'Пока вы смотрели, настройки изменились. Экран обновлён — повторите.',
    channelsError: 'Не удалось загрузить список каналов.',
    bar: {
      label: 'Автопубликация рубрик',
      ready: 'Работают',
      stopped: 'Остановлены',
      notReady: (count: number) => `Не готовы: ${count}`,
      forecastOnly: 'Только прогноз',
      configure: 'Настроить',
      start: 'Старт',
      stop: 'Остановить',
      why: 'Что мешает'
    },
    start: {
      title: 'Запустить рубрики?',
      firstSlot: (title: string, when: string) => `Первый слот: «${title}», ${when} МСК.`,
      noSlot: 'Первый слот появится в плане в течение получаса.',
      confirm: 'Запустить',
      started: 'Рубрики запущены'
    },
    blockersDialog: {
      title: 'Что мешает запуску',
      description: 'Уберите причины ниже: когда список опустеет, «Старт» предложит запустить рубрики.',
      list: 'Что мешает запуску',
      close: 'Закрыть',
      save: 'Сохранить',
      devAll: 'Включить всё нужное на DEV',
      devError: 'Не удалось включить на DEV. Повторите.'
    },
    stop: {
      title: 'Остановить рубрики?',
      description: 'Невыпущенные слоты будут отменены, а их посты удалены; уже вышедшие продолжат работу.',
      confirm: 'Остановить',
      keep: 'Не останавливать',
      stopped: 'Рубрики остановлены'
    },
    locks: {
      NOT_HERE: 'На этом сервере планировщик не работает: только прогноз.',
      SCHEMA: 'Не применена миграция 0119: Actions → D1 migrations.',
      SWITCHED_OFF: 'Выключено: рубрики не выходят.',
      LAB_MASTER_OFF: 'На DEV выключены фоновые задачи (главный рубильник).',
      LAB_OFF: 'На DEV выключена фоновая задача «Рубрики».',
      NO_DESTINATION: 'Выберите канал.',
      DESTINATION_DISABLED: 'Канал выключен или удалён: выберите другой.',
      PUBLISHING_OFF: 'Публикация выключена на сервере (PUBLISHING_ENABLED).'
    }
  },
  slots: {
    title: 'Ближайшие слоты',
    empty: 'Слотов пока нет: план появится в течение получаса после включения.',
    states: {
      planned: 'Запланирован',
      building: 'Собирается',
      ready: 'Собран',
      released: 'Публикуется',
      waiting_parent: 'Ждёт первого поста',
      unknown: 'Требует проверки',
      sent: 'Опубликовано',
      partial: 'Опубликовано частично',
      unresolved: 'Не проверено',
      send_failed: 'Ошибка отправки',
      missed: 'Пропущен',
      empty: 'Не собран',
      skipped: 'Пропуск',
      yielded: 'Уступил',
      cancelled: 'Отменён',
      superseded: 'Заменён'
    },
    open: (title: string, when: string) => `Открыть слот «${title}», ${when}`,
    detailTitle: (title: string) => `Слот «${title}»`,
    reason: 'Почему',
    fallbacks: 'Запасные рубрики',
    attempts: 'Шаги',
    noAttempts: 'Шагов ещё не было.',
    technical: 'Подробности для разбора',
    stepNames: {
      data: 'Данные',
      text: 'Текст',
      picture: 'Картинка',
      store: 'Сохранение',
      release: 'Публикация',
      poll: 'Опрос'
    } as Record<string, string | undefined>,
    skip: 'Пропустить слот',
    skipTitle: (title: string, when: string) => `Пропустить «${title}» ${when}?`,
    skipBody: 'Пост не выйдет, рубрика сохранит очередь и выйдет в другой день. Если пост уже собран, он удалится.',
    skipDone: 'Слот пропущен',
    skipFailed: 'Не удалось пропустить слот',
    skipReleased: 'Пост уже передан в публикацию: отмените его в «Публикациях».',
    skipEnded: 'Слот уже закончился.',
    outcomes: { ok: 'готово', failed: 'сбой', skipped: 'пропуск', degraded: 'с потерями' }
  },
  history: {
    open: (title: string) => `История «${title}»`,
    button: 'История',
    title: (title: string) => `«${title}»: когда выходила и почему нет`,
    empty: 'Слотов ещё не было.',
    slot: (when: string) => `Открыть слот ${when}`
  },
  list: {
    caption: 'Все рубрики канала',
    states: {
      active: 'Выходит',
      paused: 'Банк исчерпан',
      unavailable: 'Не хватает сервиса',
      waiting: 'Ждёт своего этапа',
      off: 'Выключена'
    },
    rest: 'Отдых, дней',
    restHint: (base: number) => `По умолчанию ${base}. От 7 до 60.`,
    save: 'Сохранить',
    saved: 'Сохранено',
    enabled: (title: string) => `«${title}» выходит`,
    lastPost: (when: string, seeded: boolean) =>
      seeded ? 'Ещё не выходила: очередь по плану' : `Последний пост: ${when}`,
    noLastPost: 'Ещё не выходила',
    next: (when: string) => `Следующий: ${when} МСК`,
    restError: 'Отдых — от 7 до 60 дней.'
  }
} as const;
