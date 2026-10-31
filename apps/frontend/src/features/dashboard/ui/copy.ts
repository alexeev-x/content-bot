import { pluralRu } from '../../../shared/lib/ru-format';

// Copy of the dashboard widgets. Publication status labels are canonical in shared/lib/ru.ts (skill page-spec).
export const copy = {
  loading: 'Загружаем обзор…',
  ai: { title: 'ИИ расходы' },
  dota: { title: 'Дота' },
  analytics: {
    audience: 'Аудитория',
    top: 'Что залетает сейчас',
    weekTitle: 'Итоги недели',
    all: 'Вся аналитика'
  },
  next: {
    title: 'Следующая публикация',
    all: 'Все',
    empty: 'Ничего не запланировано',
    create: 'Новый пост',
    now: 'вот-вот',
    open: (title: string) => `Открыть публикацию «${title}»`
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
    ai: 'ИИ-редактор (одобрили вы)',
    autopublish: 'ИИ сам, без вашего одобрения',
    aiShort: 'ИИ',
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
    allOfDay: 'Все публикации дня',
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
      `${clock}, ${status}: «${title}», ${channel}`,
    /** A rubric post or slot (owner, 31.10.2026: rubrics show as rubrics on the day line). */
    rubric: (title: string) => `Рубрика «${title}»`,
    rubricLetter: 'Р',
    slotStatus: (state: string, reason: string | null) => (reason === null ? state : state + ': ' + reason),
    slotMarker: (title: string, clock: string, status: string) => `${clock}, рубрика «${title}»: ${status}`,
    slotStates: {
      planned: 'готовится',
      building: 'собирается',
      ready: 'собрана, ждёт времени',
      released: 'отправляется',
      waiting_parent: 'ждёт первый пост',
      unknown: 'неизвестно, вышла ли',
      sent: 'вышла',
      partial: 'вышла частично',
      unresolved: 'не проверено',
      send_failed: 'не вышла',
      missed: 'не вышла',
      empty: 'не вышла',
      skipped: 'пропуск',
      yielded: 'уступила место',
      cancelled: 'отменена',
      superseded: 'заменена'
    },
    /** The status of a post the AI wrote: published on its own (`auto`) or approved by the owner. */
    byAi: (status: string, source: 'bot' | 'studio' | 'auto') =>
      `${status} · ${source === 'auto' ? 'опубликовал ИИ' : 'написал ИИ'}`
  },
  week: {
    title: 'Итоги недели',
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
