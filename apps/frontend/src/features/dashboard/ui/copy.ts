import { pluralRu } from '../../../shared/lib/ru-format';

// Copy of the dashboard widgets. Publication status labels are canonical in shared/lib/ru.ts (skill page-spec).
export const copy = {
  loading: 'Загружаем обзор…',
  analytics: {
    audience: 'Аудитория',
    top: 'Что залетает сейчас',
    all: 'Вся аналитика'
  },
  activity: {
    lane: 'События',
    andMore: (n: number) => `и ещё ${n}`,
    eventDot: (count: number, first: string, clock: string) =>
      count > 1 ? `${clock}: ${count} событий, первое — ${first}` : `${clock}: ${first}`,
    dialogOne: 'Что произошло',
    dialogMany: (count: number) => `Событий: ${count}`,
    when: 'Когда',
    who: 'Кто',
    owner: 'Вы',
    system: 'Студия (автоматически)',
    channel: 'Канал',
    planned: 'План',
    openPublication: 'Открыть публикацию',
    openPost: 'Открыть пост',
    openMedia: 'Открыть медиа',
    gone: 'Объект уже удалён'
  },
  newPost: 'Новый пост',
  line: {
    title: 'Лента дня',
    all: 'Все публикации',
    empty: 'На сегодня ничего не запланировано',
    schedule: 'Запланировать',
    stat: (total: number, sent: number) =>
      `${total} ${pluralRu(total, 'публикация', 'публикации', 'публикаций')} · отправлено ${sent}`,
    more: (shown: number, total: number) => `Показаны ${shown} из ${total}`,
    lanePublications: 'Публикации',
    statsLabel: 'Итоги дня',
    statPublications: (n: number) => pluralRu(n, 'публикация', 'публикации', 'публикаций'),
    statSent: 'отправлено',
    statProblems: (n: number) => pluralRu(n, 'проблема', 'проблемы', 'проблем'),
    statEvents: (n: number) => pluralRu(n, 'событие', 'события', 'событий'),
    summary: (count: number) =>
      `${count} ${pluralRu(count, 'публикация', 'публикации', 'публикаций')} за день, слева направо от 00:00 до 24:00`,
    marker: (title: string, channel: string, clock: string, status: string) =>
      `${clock}, ${status}: «${title}», ${channel}`
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
  error: {
    title: 'Не удалось загрузить обзор',
    message: 'Данные не получены. Ничего не изменилось. Повторите запрос.',
    forbiddenTitle: 'Нет доступа',
    forbiddenMessage: 'Эта учётная запись не может смотреть обзор.'
  },
  stale: { title: 'Данные устарели', refresh: 'Обновить' }
} as const;
