import { pluralRu } from '../../../shared/lib/ru-format';

// Copy of the dashboard widgets. Publication status labels are canonical in shared/lib/ru.ts (skill page-spec).
export const copy = {
  loading: 'Загружаем обзор…',
  activity: {
    title: 'Активность',
    filter: 'Фильтр активности',
    all: 'Всё',
    today: 'Сегодня',
    yesterday: 'Вчера',
    empty: 'Пока ничего не происходило',
    error: 'Не удалось загрузить активность',
    retry: 'Повторить',
    more: 'Показать ещё',
    lane: 'События дня',
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
  kpi: {
    sentCaption: (total: number) => `из ${total} за сегодня`,
    allClear: 'всё в порядке',
    needsLook: 'нужно посмотреть'
  },
  channels: {
    title: 'Каналы',
    all: 'Настроить',
    empty: 'Канал не подключён',
    state: { ok: 'бот публикует', warn: 'нужна проверка бота', muted: 'проверяем бота' }
  },
  edit: {
    customize: 'Настроить обзор',
    done: 'Готово',
    cancel: 'Отмена',
    reset: 'Сбросить',
    add: 'Добавить виджет',
    addShort: 'Добавить',
    hint: 'Перетащите виджет за ручку, чтобы переставить, и тяните за правый край, чтобы сделать шире или уже. Изменения сохранятся по кнопке «Готово».',
    grid: 'Виджеты обзора',
    drag: (title: string) => `Перетащить «${title}»`,
    menu: (title: string) => `Действия: «${title}»`,
    width: 'Ширина',
    widthOf: (title: string) => `Ширина «${title}»`,
    earlier: 'Раньше',
    later: 'Позже',
    remove: 'Убрать',
    removeLabel: (title: string) => `Убрать «${title}»`,
    removed: (title: string) => `«${title}» убран`,
    moved: (title: string, position: number, total: number) => `«${title}»: место ${position} из ${total}`,
    resized: (title: string, width: string) => `«${title}»: ${width.toLowerCase()}`,
    empty: 'На обзоре нет виджетов. Добавьте нужные из каталога.',
    catalogTitle: 'Добавить виджет',
    catalogLead: 'Добавленный виджет встаёт наверх обзора; переставить и изменить ширину можно сразу после.',
    catalogWidths: (list: string) => `Ширина: ${list}`,
    catalogClose: 'Закрыть',
    onPage: 'На обзоре',
    added: (title: string) => `«${title}» добавлен наверх обзора`,
    addOne: 'Добавить',
    saved: 'Обзор сохранён',
    saveError: 'Не удалось сохранить обзор',
    conflictTitle: 'Обзор изменили в другом окне',
    conflictBody: 'Можно загрузить новую раскладку или сохранить свою поверх неё.',
    reload: 'Загрузить заново',
    keepMine: 'Сохранить мою',
    discardTitle: 'Отменить изменения обзора?',
    discardBody: 'Перестановки и новые виджеты не сохранятся.',
    discard: 'Отменить изменения',
    keepEditing: 'Продолжить настройку',
    resetTitle: 'Вернуть стандартный обзор?',
    resetBody: 'Виджеты встанут как было изначально. Сохранится только после «Готово».',
    resetConfirm: 'Вернуть стандартный'
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
