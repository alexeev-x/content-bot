import type { AiFeedbackKind, AiSpendDto, AiUsageKind } from '@alexeev/contracts';

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
  spendTitle: 'Расходы и лимиты',
  spentIn: (month: string) => `Потрачено в ${MONTHS[Number(month.slice(5, 7)) - 1] ?? month}`,
  monthLabel: (month: string) =>
    new Date(`${month}-15T00:00:00Z`)
      .toLocaleString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .replace(' г.', '')
      .replace(/^./, (letter) => letter.toUpperCase()),
  used: (percent: number) => `${percent < 1 && percent > 0 ? '< 1' : Math.round(percent)}% использовано`,
  of: 'из',
  left: (value: string) => `Осталось ${value}`,
  spendBar: 'Потрачено от месячного бюджета',
  today: 'Сегодня',
  requests: 'Запросов',
  average: 'В среднем за запрос',
  tiles: {
    left: 'Осталось бюджета',
    leftShare: (percent: number) => `${Math.max(0, Math.round(100 - percent))}% от бюджета`,
    today: 'Потрачено сегодня',
    dailyOf: (value: string) => `из ${value} в день`,
    requests: 'Запросов за месяц',
    average: 'Средняя цена запроса'
  },
  noSpend: 'Запросов ещё не было.',
  kind: {
    check: 'проверки',
    draft: 'черновики',
    rewrite: 'правки',
    review: 'разборы',
    profile: 'профиль стиля',
    other: 'другое'
  } satisfies Record<AiUsageKind, string>,
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
    empty: 'Черновиков ещё не было. Напишите боту /redactor — здесь появится, сколько вы правите тексты ИИ.',
    editRatio: 'Правите перед «Одобрить»',
    noApprovals: 'одобрений пока нет',
    editHint: (ratio: number) =>
      ratio <= 0.15 ? 'почти ваш текст' : ratio <= 0.5 ? 'заметно правите' : 'переписываете почти всё',
    approved: 'Одобрено черновиков',
    unchanged: (count: number) => `без правок: ${count}`,
    draftCost: 'Цена черновика',
    draftCostMeta: 'в среднем',
    rewrites: 'Переписываний',
    rewritesMeta: '«Короче», «Смешнее», «Ещё вариант»',
    approvedShare: (percent: number) => `${percent}% черновиков`,
    lowTitle: 'Одобряете мало черновиков',
    lowBody: (percent: number) =>
      `За 30 дней одобрено ${percent}% черновиков. Посмотрите, что вы правите чаще всего, и пишите это в задании — или выберите модель посильнее.`,
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
  widget: {
    month: 'Расходы за месяц',
    today: 'Расходы сегодня',
    budget: 'Месячный бюджет',
    requests: 'Запросов за месяц',
    left: 'Осталось бюджета',
    used: 'Использовано',
    settings: 'Настройки',
    loadError: 'Не удалось загрузить расходы ИИ.'
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

// A check costs thousandths of a cent: shown as «< $0.0001», never as a misleading «$0.0000».
export const usd = (value: number) =>
  value === 0 ? '$0' : value < 0.0001 ? '< $0.0001' : value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
