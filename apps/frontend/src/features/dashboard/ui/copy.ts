// Copy of the dashboard blocks. Publication status labels are canonical in shared/lib/ru.ts (skill page-spec).
export const copy = {
  loading: 'Загружаем обзор…',
  attention: {
    title: 'Требует внимания',
    clear: 'Всё под контролем',
    allIncidents: (total: number) => (total > 0 ? `Все инциденты (${total >= 99 ? '99+' : total})` : 'Все инциденты'),
    check: 'Проверить',
    open: 'Открыть',
    unknownHint: 'Возможен дубль при повторной отправке',
    stuckTag: 'Просрочено',
    stuckHint: 'Время прошло, а отправка не началась',
    failedHint: 'Публикация не ушла',
    systemTag: 'Система',
    openLabel: (title: string) => `Открыть: «${title}»`,
    checkLabel: (title: string) => `Проверить: «${title}»`
  },
  today: {
    title: 'Сегодня',
    zone: (zone: string, offset: string) => `${zone}, ${offset}`,
    empty: 'На сегодня ничего не запланировано',
    schedule: 'Запланировать',
    showAll: 'Показать все',
    unknownTitle: 'Без названия'
  },
  upcoming: { title: 'Ближайшие' },
  recent: { title: 'Недавно отправлено', openInTelegram: 'Открыть в Telegram' },
  empty: {
    title: 'Пока нет публикаций',
    description: 'Создайте пост и запланируйте отправку в канал.',
    action: 'Создать пост'
  },
  error: {
    title: 'Не удалось загрузить обзор',
    message: 'Данные не получены. Ничего не изменилось. Повторите запрос.',
    forbiddenTitle: 'Нет доступа',
    forbiddenMessage: 'Эта учётная запись не может смотреть обзор.'
  },
  stale: { title: 'Данные устарели', refresh: 'Обновить' }
} as const;
