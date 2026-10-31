import { rubricSlotReason } from '@alexeev/contracts';
// «Рубрики» copy, kept beside the feature like the bot's.
export const rubricsCopy = {
  title: 'Рубрики',
  description: 'Когда какая рубрика выйдет в канал и почему. Время — московское.',
  forecastTitle: 'Это прогноз',
  forecastBody:
    'План на 35 дней считается заново при каждом открытии и учитывает посты, уже стоящие в «Публикациях». Настоящие слоты ближайших дней — выше, в «Ближайших слотах». Событийные рубрики (патч, анонсы, утечки) появятся, когда случится событие.',
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
    locks: {
      NOT_HERE: 'На этом сервере планировщик не работает: только прогноз.',
      NOT_BUILT: 'Планировщик ещё не включён на этом сервере: только прогноз.',
      SCHEMA: 'Не применена миграция 0119: Actions → D1 migrations.',
      SWITCHED_OFF: 'Выключено: рубрики не выходят.',
      LAB_OFF: 'На DEV включите главный рубильник и «Рубрики» в Тестирование → Фоновые задачи.',
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
    problem: (code: string, step: string | null) =>
      `${rubricSlotReason(code) ?? code}${step === null ? ` (код ${code})` : ` (шаг ${step}, код ${code})`}`,
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
