import { pluralRu } from '../../../shared/lib/ru-format';
import type { AiFeedbackKind, AiSpendDto } from '@alexeev/contracts';

const MONTHS = [
  'январе',
  'феврале',
  'марте',
  'апреле',
  'мае',
  'июне',
  'июле',
  'августе',
  'сентябре',
  'октябре',
  'ноябре',
  'декабре'
];

export const copy = {
  loadError: 'Не удалось загрузить настройки ИИ.',
  enabled: 'Включён',
  videoReviews: 'Разборы видео через 72 часа',
  videoReviewsHint:
    'Один запрос к дешёвой модели на видео: до двух гипотез и один следующий тест. Выключено — только цифры и сравнение, без трат.',
  check: 'Проверить',
  status: {
    noKey: 'Нет ключа',
    off: 'Выключен',
    budget: 'Бюджет исчерпан',
    setup: 'Не настроен',
    unchecked: 'Не проверен',
    failed: 'Ошибка',
    ready: 'Работает'
  },
  next: {
    noKey: 'Чтобы ИИ заработал, нужен ключ OpenAI:',
    off: 'ИИ выключен: ни одного запроса к модели. Включите, когда будете готовы.',
    unchecked: 'Нажмите «Проверить»: один крошечный запрос покажет, что ключ и модель работают.',
    failed: (code: string | null) =>
      `Последняя проверка не прошла (${code ?? 'без кода'}). Проверьте ключ и лимит в кабинете OpenAI.`,
    ready: 'Всё готово: ИИ может писать черновики.'
  },
  keySteps: (name: string) => [
    'Создайте ключ на platform.openai.com → API keys и поставьте месячный лимит в Billing → Limits.',
    `В Cloudflare: Workers → воркер окружения → Settings → Variables and Secrets → Add → Secret, имя ${name}.`,
    'Вернитесь сюда, включите ИИ и нажмите «Проверить».'
  ],
  checked: (ok: boolean) => (ok ? 'Подключение работает' : 'Модель не ответила'),
  lastCheck: (ok: boolean, when: string, model: string | null, code: string | null) =>
    ok
      ? `Последняя проверка: ${when}, ответила ${model ?? 'модель'}`
      : `Последняя проверка: ${when}, ошибка ${code ?? ''}`,
  checkBlocked: {
    NO_KEY: 'Сначала добавьте ключ.',
    DISABLED: 'Сначала включите ИИ.',
    NO_MODEL: 'Выберите модель.',
    NO_PRICE: 'У выбранной модели нет цены.',
    BUDGET: 'Бюджет исчерпан.'
  } as Record<string, string>,
  saved: 'Сохранено',
  saveFailed: 'Не удалось сохранить. Попробуйте ещё раз.',
  conflict: 'Настройки изменились в другом окне — загрузили свежие, повторите.',
  spentIn: (month: string) => `Потрачено в ${MONTHS[Number(month.slice(5, 7)) - 1] ?? month}`,
  of: 'из',
  left: (value: string) => `Осталось ${value}`,
  spendBar: 'Потрачено от месячного бюджета',
  average: 'В среднем за запрос',
  modelsTitle: 'Модели и задачи',
  modelsIntro: (provider: string) =>
    `Какая модель ${provider} пишет черновики, а какая проверяет их. Подсказки под списком — что лучше по цене и качеству.`,
  perDraft: (cents: number) => `≈ ${cents < 0.1 ? cents.toFixed(2) : cents.toFixed(1)} ¢ за черновик`,
  draftModel: 'Пишет черновики',
  draftModelHint: 'Посты и сценарии твоим голосом.',
  cheapModel: 'Проверяет и размечает',
  cheapModelHint: 'Ищет «ИИ-шные» фразы, ставит теги — здесь важна только цена.',
  budgetTitle: 'Бюджет',
  monthly: 'В месяц',
  custom: 'Своё',
  customLabel: 'Сумма в месяц, $',
  customInvalid: 'Нужна сумма от 0 до 10 000.',
  apply: 'Применить',
  monthlyHint: 'Кончился — ИИ останавливается до 1-го числа, бот пишет об этом.',
  daily: 'Не больше в день',
  noDaily: 'Без лимита',
  warnAt: 'Предупредить в боте при',
  pricesTitle: (provider: string, day: string) => `Цены ${provider} (на ${day.split('-').reverse().join('.')})`,
  model: 'Модель',
  input: 'Вход',
  cached: 'Из кэша',
  output: 'Выход',
  pricesHint: 'USD за 1 млн токенов, со страницы цен провайдера. По ним считаются расходы.',
  voiceTitle: 'Голос и правила',
  extraTitle: 'Дополнительно',
  quality: {
    title: (days: number) => `Качество за ${days} дней`,
    // What the block is, in one line, as «Потрачено в …» says it for «Расходы» beside it.
    lead: 'Черновики из бота: сколько одобряете и сколько правите',
    empty: 'Черновиков из бота ещё не было. Напишите боту /redactor — здесь появится, сколько вы одобряете и правите.',
    studioRuns: (count: number) => `Контрольных прогонов из студии: ${count} — в доли не входят`,
    editRatio: 'Сколько правите',
    noApprovals: 'одобрений пока нет',
    editHint: (ratio: number) =>
      ratio <= 0.15 ? 'почти ваш текст' : ratio <= 0.5 ? 'заметно правите' : 'переписываете почти всё',
    approved: 'Одобрено черновиков',
    unchanged: (count: number) => `без правок: ${count}`,
    draftCost: 'Цена черновика',
    draftCostMeta: 'в среднем',
    rewrites: 'Переписываний',
    rewritesMeta: 'кнопками в боте',
    approvedShare: (percent: number) => `${percent}%`,
    // One line, so «Качество» stays as tall as «Расходы» beside it (owner, 17.10.2026).
    lowTitle: (percent: number) => `Одобрено мало: ${percent}% — уточняйте задание или смените модель`,
    // Accusative: «Чаще всего правите хук, концовку…».
    part: {
      hook: 'хук',
      ending: 'концовку',
      length: 'длину',
      structure: 'разбивку на абзацы',
      swearing: 'мат',
      ai_wording: 'ИИ-обороты'
    },
    partsLead: 'Чаще всего правите: ',
    // Only the counters that happened: a row of zeros read as noise.
    // «Что не так?» in the bot, lower case after «Отзывы: ».
    feedback: {
      topic_repeated: 'тема повторяется',
      weak_hook: 'слабый хук',
      joke_missed: 'шутка не зашла',
      not_my_style: 'не мой стиль',
      too_long: 'слишком длинно',
      fact_wrong: 'ошибка в фактах',
      missed_task: 'не то задание'
    } satisfies Record<AiFeedbackKind, string>,
    feedbackLead: 'Отзывы: ',
    feedbackListTitle: (count: number) => `Записанные отзывы (${count})`,
    feedbackListHint:
      'Отзыв со словами после причины ИИ разбирает и предлагает урок. Причина без слов только считается в «Качестве». Ошиблись кнопкой — удалите отзыв и нажмите нужную причину в боте.',
    feedbackEmpty: 'Отзывов пока нет. Нажмите «Что не так?» под черновиком в боте.',
    feedbackLoadError: 'Не удалось загрузить отзывы.',
    feedbackDelete: (reason: string) => `Удалить отзыв «${reason}»`,
    feedbackDeleted: 'Отзыв удалён',
    feedbackDeleteFailed: 'Не удалось удалить отзыв. Попробуйте ещё раз.',
    feedbackNote: (note: string) => `«${note}»`,
    format: { fidit: 'Учу фидить', igrat: 'Учусь играть', standalone: 'Рилс', telegram: 'Пост в ТГ' },
    byFormat: {
      title: 'По форматам',
      label: 'Качество по форматам',
      drafts: 'Черновики',
      questions: 'Вопросы',
      approved: 'Одобрено',
      unchanged: 'Без правок',
      edits: 'Правки',
      hook: 'Хук переписан',
      ending: 'Концовка переписана',
      joke: 'Шутка не зашла',
      time: 'Время до одобрения',
      idle: (names: string) => `Нет черновиков: ${names}`
    },
    compare: {
      line: (days: number, approved: number, ratio: number | null) =>
        `За прошлые ${days} дней: одобрено ${approved}${ratio === null ? '' : `, правок в среднем ${ratio}%`}`,
      direction: { less: 'сейчас правок меньше', more: 'сейчас правок больше', same: 'правок столько же' },
      tooLittle: (min: number) => `Для сравнения нужно не меньше ${min} одобренных текстов за каждый период`
    },
    details: (questions: number, warned: number, failed: number) =>
      (
        [
          ['Уточняющих вопросов', questions],
          ['Замечания проверки', warned],
          ['Ошибок модели', failed]
        ] as const
      )
        .filter(([, count]) => count > 0)
        .map(([label, count]) => `${label}: ${count}`)
        .join(' · ')
  },
  learning: {
    title: 'На чём учится ИИ',
    hint: 'Поправленные вами ИИ-черновики и посты, написанные вами. Новые тексты выключены: включите «Учитывать» у тех, что пишут как вы, — только они попадут в примеры.',
    search: 'Поиск по тексту',
    searchHint: 'Поиск по тексту…',
    stateLabel: 'Учитывается',
    state: { all: 'Все', on: 'Включённые', off: 'Выключенные' },
    sourceLabel: 'Откуда',
    source: { all: 'Все', post: 'Ваши посты', revision: 'Правки ИИ' },
    columns: { text: 'Текст', format: 'Формат', date: 'Дата', include: 'Учитывать' },
    count: (included: number) => `В примерах: ${included}`,
    noMatch: 'Таких текстов нет. Измените поиск или фильтры.',
    empty:
      'Пока не на чем учиться: ИИ учится на одобренных черновиках, которые вы заметно поправили, и на постах, написанных вами',
    loadError: 'Не удалось загрузить тексты для обучения.',
    revision: (percent: number) => `Правка ИИ-черновика · изменено ${percent}%`,
    revisionParts: (parts: string) => `Правили: ${parts}`,
    ownPost: 'Пост, написанный вами',
    include: 'Учитывать',
    textTitle: 'Текст целиком',
    saveFailed: 'Не удалось сохранить. Попробуйте ещё раз.'
  },
  drafts: {
    title: 'История черновиков',
    hint: 'Все черновики ИИ из бота и студии: каждый вариант, ваша версия, одобрение и отзывы.',
    empty: 'Черновиков пока нет. Напишите в боте /redactor или создайте черновик в студии.',
    loadError: 'Не удалось загрузить историю черновиков.',
    chainError: 'Не удалось загрузить варианты.',
    more: 'Показать ещё',
    source: { bot: 'Бот', studio: 'Студия' } as Record<string, string>,
    versions: (count: number) => `Вариантов: ${count}`,
    approved: 'Одобрен',
    edited: 'Есть ваша версия',
    feedback: (count: number) => `Отзывов: ${count}`,
    kind: { draft: 'Черновик', rewrite: 'Переделка' } as Record<string, string>,
    status: { pending: 'Пишется', failed: 'Не получилось' } as Record<string, string>,
    question: 'Редактор спросил',
    provenance: {
      AI_DRAFT: 'Текст ИИ',
      OWNER_EDITED: 'Ваша версия',
      OWNER_APPROVED: 'Одобрено',
      OWNER_PREAPPROVED: 'Одобрено заранее'
    } as Record<string, string>,
    editRatio: (percent: number) => `изменено ${percent}%`,
    truncated: 'Цепочка длинная: показаны первые 31 вариант и последние 60 текстов.'
  },
  hypotheses: {
    title: 'Гипотезы аналитики',
    hint: 'Что ИИ заметил в цифрах роликов. Каждый день он может добавить одну, по понедельникам пересматривает все. Подтверждённая гипотеза о том, как писать, приходит в бот вопросом «Учитывать?» и попадает в тексты только после вашего ответа.',
    empty: 'Гипотез пока нет: они появятся в утренних разборах.',
    loadError: 'Не удалось загрузить гипотезы.',
    status: { open: 'Проверяется', supported: 'Подтверждается', refuted: 'Не подтвердилась' } as Record<string, string>,
    kind: { writing: 'Как писать', topic: 'О чём снимать' } as Record<string, string>,
    confidence: { low: 'уверенность низкая', medium: 'уверенность средняя' } as Record<string, string>,
    asked: 'Спросил в боте «Учитывать?»'
  },
  rules: {
    title: 'Правила редактора',
    hint: (max: number) => `Идут в каждый новый текст своего формата. В работе одновременно не больше ${max}.`,
    empty: 'Правил пока нет: они появятся из ваших «Учитывать» или командой «/rule текст» в боте.',
    loadError: 'Не удалось загрузить правила.',
    scope: {
      all: 'Все тексты',
      igrat: '«Учусь играть»',
      fidit: '«Учу фидить»',
      standalone: 'Рилсы вне рубрик',
      telegram: 'Посты'
    } as Record<string, string>,
    owner: 'Ваше правило',
    analysis: 'Из аналитики',
    status: {
      active: 'Работает',
      candidate: 'Кандидат: ждёт подтверждений',
      supported: 'Подтверждено: ждёт вашего решения',
      strong: 'Надёжно подтверждено: ждёт вашего решения',
      inUse: 'Учитывается',
      disabled: 'Отключено',
      deprecated: 'Не подтвердилось'
    } as Record<string, string>,
    counts: (supports: number, contradicts: number) => `Роликов выше обычного: ${supports} · ниже: ${contradicts}`,
    use: 'Учитывать',
    approve: 'Учитывать',
    reject: 'Нет',
    disable: 'Отключить',
    evidenceTitle: (count: number) => `Ролики (${count})`,
    above: 'Выше обычного',
    below: 'Ниже обычного',
    origin: 'до правила',
    noScript: 'Сценарий не найден',
    removeEvidence: 'Убрать',
    removeEvidenceLabel: 'Убрать это наблюдение',
    limit: (max: number) => `Уже ${max} правил в работе. Отключите лишнее и попробуйте снова.`,
    stale: 'Правило уже изменилось. Обновите страницу.',
    saveFailed: 'Не удалось сохранить. Попробуйте ещё раз.'
  },
  unlinked: {
    title: 'Сценарии без видео',
    hint: 'Привяжите вышедший ролик к сценарию в панели видео в «Аналитике»: тогда ИИ увидит, сработал ли сценарий, и сможет предложить урок.',
    empty: 'Все одобренные сценарии за 60 дней привязаны к видео',
    loadError: 'Не удалось загрузить сценарии без видео.',
    approved: (when: string) => `одобрен ${when}`
  },
  widget: {
    month: 'Расходы за месяц',
    today: 'Расходы сегодня',
    budget: 'Месячный бюджет',
    requests: 'Запросов за месяц',
    left: 'Осталось бюджета',
    used: 'Использовано',
    settings: 'Расходы ИИ',
    loadError: 'Не удалось загрузить расходы ИИ.'
  },
  /** «ИИ-редактор» (owner, 20.10.2026): what the AI writes, learns and costs, apart from its settings. */
  editor: {
    description: 'Как пишет ИИ и чему учится',
    tabs: { overview: 'Сводка', drafts: 'Черновики', learning: 'Обучение' },
    tabsLabel: 'Разделы ИИ-редактора',
    settings: 'Настройки ИИ',
    decisions: {
      title: 'Нужно ваше решение',
      none: 'Всё в порядке: ИИ работает сам, решать ничего не нужно.'
    },
    money: {
      title: 'Деньги',
      today: (spent: string, cap: string | null) => (cap === null ? `сегодня ${spent}` : `сегодня ${spent} из ${cap}`),
      sourcesLabel: 'Куда ушли деньги',
      source: {
        bot: 'Черновики из бота',
        studio: 'Контрольные прогоны',
        images: 'Картинки к патчам',
        other: 'Разборы, отчёты, проверки'
      },
      requests: (count: number) => `${count} ${pluralRu(count, 'запрос', 'запроса', 'запросов')}`
    },
    drafts: {
      filters: {
        all: 'Любой',
        approved: 'Одобрены',
        edited: 'С правками',
        feedback: 'С отзывами',
        open: 'Не одобрены'
      },
      source: { bot: 'Из бота', studio: 'Контрольные прогоны', all: 'Все' },
      allFormats: 'Все',
      sourceLabel: 'Откуда',
      formatLabel: 'Формат',
      outcomeLabel: 'Итог',
      search: 'Поиск по задаче',
      searchHint: 'Поиск по задаче…',
      columns: { task: 'Задача', date: 'Когда', versions: 'Вариантов', outcome: 'Итог', cost: 'Цена' },
      outcome: { approved: 'Одобрен', edited: 'Одобрен с правками', open: 'Не одобрен' },
      count: (count: number) => `${count} ${pluralRu(count, 'черновик', 'черновика', 'черновиков')}`,
      capped: 'Показаны последние 1000 черновиков: более старые в поиск и сортировку не входят.',
      noMatch: 'Таких черновиков нет. Измените поиск или фильтры.',
      botHint: 'Черновики из бота появятся, когда вы напишете боту /redactor. Прогоны из студии — в «Откуда».'
    },
    learning: {
      howTitle: 'Как ИИ учится',
      how: [
        'Вы правите черновик или пишете «Что не так?» своими словами.',
        'ИИ выводит из этого урок: как вы хотите, чтобы он писал.',
        'Урок повторился на двух черновиках или сказан вашими словами — бот спрашивает «Учитывать?».',
        'Ваше «Учитывать» делает урок правилом: оно идёт в каждый новый текст.'
      ],
      howRule: 'Сразу без ожидания: «/rule текст» в боте.',
      howExamples: 'Стиль ИИ берёт ещё из примеров — ваших текстов внизу, у которых включено «Учитывать».',
      lessons: 'Ждут вашего ответа',
      lessonsHint: 'Бот уже спросил про них «Учитывать?». Ответить можно здесь или в боте.',
      seen: 'Замечено один раз',
      seenHint: 'ИИ спросит, если урок повторится ещё на одном черновике.',
      lessonFrom: (lesson: { origin: 'edit' | 'analytics'; fromRemark: boolean; drafts: number }) =>
        lesson.origin === 'analytics'
          ? 'из аналитики роликов'
          : lesson.fromRemark
            ? 'ваши слова в «Что не так?»'
            : `из ваших правок · ${lesson.drafts} ${pluralRu(lesson.drafts, 'черновик', 'черновика', 'черновиков')}`,
      accept: 'Учитывать',
      reject: 'Не учитывать',
      lessonLimit: 'В работе уже максимум правил. Отключите лишнее в «Правилах» и ответьте снова.',
      lessonStale: 'На этот урок уже ответили. Обновите страницу.',
      lessonsLoadError: 'Не удалось загрузить уроки.',
      rules: 'Правила редактора',
      hypotheses: 'Гипотезы аналитики',
      unlinked: 'Сценарии без видео',
      feedback: (count: number) => `История отзывов (${count})`,
      examples: 'Примеры, на которых учится ИИ'
    }
  },
  loading: 'Загружаем настройки ИИ…',
  voiceBody:
    'Каждый черновик пишется по профилю стиля (по 526 постам канала), с 3–4 похожими примерами из базы постов и сценариев и со сленгом и мемами Доты из задания. Ваши одобренные тексты, в которых вы что-то поправили, идут примерами первыми. Следующий шаг — «Мой опыт»: правила из ваших правок и разборов роликов.',
  blocked: {
    disabled: 'ИИ выключен.',
    no_key: 'Нет ключа — запросы не идут.',
    no_model: 'Выберите модель для черновиков.',
    no_price: 'У выбранной модели нет цены — без неё расходы не посчитать.',
    monthly_budget: 'Месячный бюджет исчерпан — ИИ остановлен до 1-го числа. Поднимите бюджет, если нужно больше.',
    daily_cap: 'Дневной лимит исчерпан — продолжим завтра.'
  } satisfies Record<NonNullable<AiSpendDto['blockedBy']>, string>
};

// A check costs thousandths of a cent: shown as «< $0.0001», never as a misleading «$0.0000». A no-break space
// keeps «<» with the amount in a narrow tile.
export const usd = (value: number) =>
  value === 0 ? '$0' : value < 0.0001 ? '< $0.0001' : value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
