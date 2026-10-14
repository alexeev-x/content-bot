import { pluralRu } from '../../../shared/lib/ru-format';

// Copy of the dashboard widgets. Publication status labels are canonical in shared/lib/ru.ts (skill page-spec).
export const copy = {
  loading: 'Загружаем обзор…',
  newPost: 'Новый пост',
  line: {
    title: 'Лента дня',
    all: 'Все публикации',
    empty: 'На сегодня ничего не запланировано',
    schedule: 'Запланировать',
    stat: (total: number, sent: number) =>
      `${total} ${pluralRu(total, 'публикация', 'публикации', 'публикаций')} · отправлено ${sent}`,
    more: (shown: number, total: number) => `Показаны ${shown} из ${total}`,
    summary: (count: number) =>
      `${count} ${pluralRu(count, 'публикация', 'публикации', 'публикаций')} за день, слева направо от 00:00 до 24:00`,
    marker: (title: string, channel: string, clock: string, status: string) =>
      `${clock}, ${status}: «${title}», ${channel}`
  },
  next: {
    title: 'Следующая публикация',
    all: 'Все',
    empty: 'Ничего не запланировано',
    create: 'Новый пост',
    now: 'вот-вот',
    open: (title: string) => `Открыть публикацию «${title}»`
  },
  attention: {
    title: 'Требует внимания',
    clear: 'Всё в порядке',
    clearDetail: 'Публикации идут по плану, система работает.',
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
    openLabel: (title: string) => `Открыть: «${title}»`,
    count: (n: number) => pluralRu(n, 'пункт требует', 'пункта требуют', 'пунктов требуют') + ' внимания'
  },
  week: {
    title: 'Неделя',
    scheduled: 'Запланировано',
    sent: 'Отправлено',
    problem: 'Проблемы',
    partial: 'Показаны первые 100 публикаций недели.',
    error: 'Не удалось загрузить неделю',
    retry: 'Повторить',
    summary: (scheduled: number, sent: number, problem: number) =>
      `За неделю: запланировано ${scheduled}, отправлено ${sent}, проблем ${problem}. Колонка дня открывает его публикации.`,
    day: (long: string, scheduled: number, sent: number, problem: number) =>
      `${long}: запланировано ${scheduled}, отправлено ${sent}, проблем ${problem}. Открыть публикации дня`
  },
  recent: {
    title: 'Отправлено недавно',
    all: 'Все',
    empty: 'Пока ничего не отправлено',
    openInTelegram: 'Открыть в Telegram',
    open: (title: string) => `Открыть публикацию «${title}»`,
    telegram: (title: string) => `Открыть в Telegram: «${title}»`
  },
  drafts: {
    title: 'Черновики',
    all: 'Все посты',
    empty: 'Черновиков нет',
    emptyDetail: 'Начните новый пост, он появится здесь.',
    untitled: 'Без названия',
    publish: 'К публикации',
    publishLabel: (title: string) => `К публикации: «${title}»`,
    error: 'Не удалось загрузить черновики',
    retry: 'Повторить'
  },
  system: {
    title: 'Система',
    empty: 'Нет данных о системе',
    lights: 'Состояния служб'
  },
  error: {
    title: 'Не удалось загрузить обзор',
    message: 'Данные не получены. Ничего не изменилось. Повторите запрос.',
    forbiddenTitle: 'Нет доступа',
    forbiddenMessage: 'Эта учётная запись не может смотреть обзор.'
  },
  stale: { title: 'Данные устарели', refresh: 'Обновить' }
} as const;
