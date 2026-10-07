export const copy = {
  loading: 'Загружаем инциденты…',
  filters: {
    state: 'Состояние',
    kind: 'Тип',
    open: 'Открытые',
    resolved: 'Закрытые',
    all: 'Все',
    unknown: 'Требуют проверки',
    failed: 'Ошибки отправки',
    reset: 'Сбросить фильтры'
  },
  kind: { publish_unknown: 'Требует проверки', publish_failed: 'Ошибка' },
  row: {
    attempts: (count: number) => `попыток: ${count}`,
    closedAt: (time: string) => `Закрыт ${time}`,
    check: 'Проверить',
    open: 'Открыть',
    close: 'Закрыть',
    details: 'Детали',
    jobId: 'ID задачи',
    copy: 'Копировать',
    copied: 'Скопировано',
    unknownWarning: 'Не повторяйте отправку, пока не проверили канал',
    noPublication: 'Публикация не найдена',
    unknownPost: 'Без названия',
    checkLabel: (title: string) => `Проверить: «${title}»`,
    openLabel: (title: string) => `Открыть: «${title}»`,
    closeLabel: (title: string) => `Закрыть инцидент: «${title}»`
  },
  resolve: {
    done: 'Инцидент закрыт',
    failedTitle: 'Не удалось закрыть инцидент',
    requestId: (id: string) => `Идентификатор запроса: ${id}`,
    retry: 'Повторить',
    useResolveUnknown: 'Сначала проверьте отправку',
    useResolveUnknownLink: 'Открыть публикацию'
  },
  states: {
    emptyOpenTitle: 'Открытых инцидентов нет',
    emptyOpenDescription: 'Всё под контролем: ни ошибок отправки, ни неподтверждённых публикаций.',
    emptyOpenAction: 'К публикациям',
    emptyResolved: 'История пуста',
    emptyFiltered: 'Ничего не найдено по фильтру',
    errorTitle: 'Не удалось загрузить инциденты',
    errorMessage: 'Список не получен. Данные на сервере не изменились. Повторите запрос.',
    forbiddenTitle: 'Нет доступа',
    forbiddenMessage: 'Эта учётная запись не может смотреть инциденты.',
    staleTitle: 'Данные устарели',
    refresh: 'Обновить',
    more: 'Показать ещё',
    listLabel: 'Инциденты',
    zone: (zone: string, offset: string) => `Время: ${zone}, ${offset}`
  }
} as const;
