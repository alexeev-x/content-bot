import type { RubricCommentKind, RubricPart, RubricSliceDimension } from '@alexeev/contracts';

// «Рубрики» → «Аналитика» copy. A ratio is «×1,4»: against the channel's usual post (the comparison) or the rubric's
// own usual post (inside a rubric).
export const analyticsCopy = {
  tab: 'Аналитика',
  periodLabel: 'Период',
  periods: { 7: '7 дней', 30: '30 дней', 90: '90 дней' } as const,
  rubricPeriods: { '30': '30 дней', '90': '90 дней', all: 'Всё время' } as const,
  compareTitle: 'Между рубриками',
  compareNote:
    'Каждый пост рубрики через 24 часа сравнивается с обычным постом канала за 28 дней до него: просмотры, реакции, комментарии и голоса на просмотр. ×1,0 — как обычно.',
  channelLine: (posts: number, views: number | null) =>
    views === null
      ? `Обычный пост канала: нет данных (${posts} постов)`
      : `Обычный пост канала: ${views} просмотров за 24 ч (${posts} постов)`,
  coverage: (scored: number, pending: number, missing: number) =>
    `Посчитано ${scored} · дозревают ${pending} · без данных ${missing}`,
  columns: {
    rubric: 'Рубрика',
    posts: 'Постов',
    x: 'К обычному',
    prev: 'Прошлый период',
    views: 'Просмотры',
    reactions: 'Реакции',
    comments: 'Комментарии',
    votes: 'Голоса'
  },
  few: 'мало данных',
  best: 'лучшая',
  worst: 'худшая',
  reason: (part: RubricPart) => `больше всего по: ${PART[part]}`,
  empty: 'Рубрики ещё не выходили или их посты не дозрели до 24 часов',
  emptyHint: 'Оценка появляется через сутки после поста. На DEV тестовый канал не оценивается.',
  error: 'Не удалось получить аналитику. Повторите запрос.',
  pending: 'Таблиц аналитики ещё нет на этом сервере: нужна миграция 0121.',
  rubricLabel: 'Рубрика',
  rubricTitle: 'Внутри рубрики',
  usual: (x: string) => `Обычный пост рубрики: ${x} к обычному посту канала`,
  noUsual: 'У рубрики ещё нет посчитанных постов',
  slicesTitle: 'Что заходит лучше',
  dimensions: {
    hero: 'Герой',
    line: 'Строка банка',
    look: 'Вид картинки',
    picture: 'Картинка',
    hour: 'Час (МСК)',
    weekday: 'День недели'
  } satisfies Record<RubricSliceDimension, string>,
  sliceLabel: (dimension: RubricSliceDimension, key: string) =>
    dimension === 'picture'
      ? key === 'picture'
        ? 'с картинкой'
        : 'текст'
      : dimension === 'weekday'
        ? (WEEKDAYS[Number(key)] ?? key)
        : dimension === 'hour'
          ? `${key}:00`
          : dimension === 'hero'
            ? `герой #${key}`
            : key,
  postsTitle: 'Посты',
  postStatus: { scored: 'посчитан', pending: 'дозревает', missing: 'без данных' },
  openPost: 'Открыть в Telegram',
  openRubric: 'Разобрать рубрику ниже',
  noComments: 'Комментариев по рубрикам пока нет',
  views24: (views: number | null) => (views === null ? '—' : `${views} просм.`),
  commentsTitle: 'Что пишут в комментариях',
  commentsState: {
    ok: '',
    limited: 'Часть комментариев не вошла: на пост берётся до 40.',
    not_connected:
      'Бот не видит комментарии канала: подключите группу обсуждения и сделайте бота её админом (Настройки → Бот).',
    no_data: 'Тем пока нет: их считают раз в день по постам, которым больше трёх суток.',
    ai_unavailable: 'Темы не посчитаны: ИИ выключен или исчерпан бюджет.'
  },
  textKept: (days: number) => `Тексты комментариев хранятся ${days} дней, счётчики — всегда.`,
  kinds: {
    praise: 'хвалят',
    joke: 'шутят',
    disagree: 'спорят',
    confused: 'не поняли',
    request: 'просят',
    complaint: 'жалуются',
    recognition: 'узнали себя',
    offtopic: 'не по теме'
  } satisfies Record<RubricCommentKind, string>,
  heatTitle: 'Часы',
  heatNote:
    'Медиана оценки постов рубрик по дню недели и часу (МСК). Пустая клетка — постов не было; число без «×» — постов меньше трёх.',
  heatCaption: 'День недели × час по Москве',
  heatCaptionBands: 'День недели × время суток по Москве; в клетке средняя оценка по постам',
  heatEmpty: 'Оценённых постов по часам пока нет',
  heatEmptyHint: 'Клетки появятся, когда у рубрик будут посты старше суток.',
  bands: [
    { id: 'morning', label: 'Утро', from: 8, to: 11 },
    { id: 'day', label: 'День', from: 12, to: 15 },
    { id: 'evening', label: 'Вечер', from: 16, to: 19 },
    { id: 'night', label: 'Ночь', from: 20, to: 23 }
  ] as const,
  heatDay: 'День',
  heatCell: (n: number, x: string, trial: boolean) => `Постов: ${n} · ${x}${trial ? ' · был пробный час' : ''}`,
  learning: {
    title: 'Обучение',
    note: 'Четыре недели с первого оценённого поста расписание только советует; потом само меняет отдых рубрик и часы слотов — по шагу в неделю.',
    pending: 'Таблиц обучения ещё нет на этом сервере: нужна миграция 0122.',
    mode: {
      advise: 'Сейчас только советы.',
      apply: 'Расписание учится само.',
      off: 'Само не меняет: только советы (выключено).'
    },
    applyFrom: (when: string) => `Само менять начнёт с ${when}.`,
    switch: 'Менять отдых и часы самому после 4 недель',
    saveError: 'Не удалось сохранить переключатель',
    restTitle: 'Отдых рубрик',
    restDays: (days: number) => `отдых ${days} дн.`,
    source: { learned: 'выучен', manual: 'ваш' },
    few: 'мало данных',
    nothingYet: (scored: number) =>
      `Обучение начнётся, когда наберётся данных: оценено ${scored} постов из нужных 12. Пока планировщик ничего не меняет.`,
    restChange: (from: number, to: number) => `отдых ${from} → ${to} дн.`,
    hourChange: (from: string, to: string) => `${from} → ${to}`,
    advises: 'советует',
    keep: 'оставить',
    advice: (to: number, reason: 'better' | 'worse') =>
      reason === 'better' ? `чаще: ${to} дн. — заходит лучше обычного` : `реже: ${to} дн. — заходит хуже обычного`,
    hoursTitle: 'Часы слотов',
    groups: {
      wd: 'Будни',
      we: 'Выходные',
      mon: 'Пн',
      tue: 'Вт',
      wed: 'Ср',
      thu: 'Чт',
      fri: 'Пт',
      sat: 'Сб',
      sun: 'Вс'
    },
    parts: { day: 'день', evening: 'вечер' },
    hourAdvice: (part: string, at: string) => `${part} → ${at}`,
    hoursFew: (n: number) => (n < 12 ? `мало данных (${n} из 12 постов)` : 'оставить')
  }
};

const PART: Record<RubricPart, string> = {
  views: 'просмотрам',
  reactions: 'реакциям',
  comments: 'комментариям',
  votes: 'голосам'
};
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** «×1,4», «—» for no data. */
export const times = (x: number | null) => (x === null ? '—' : `×${x.toFixed(1).replace('.', ',')}`);
