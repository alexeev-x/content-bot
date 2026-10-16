import type { AiSpendDto, AiUsageKind } from '@alexeev/contracts';

export const copy = {
  loadError: 'Не удалось загрузить настройки ИИ.',
  connectionTitle: 'Подключение',
  provider: 'Провайдер',
  providerName: 'OpenAI',
  keyOk: 'Ключ задан. Сам ключ студия не показывает.',
  keyMissing: (name: string) =>
    `Ключа нет. Добавьте секрет ${name} в Cloudflare: Workers → воркер окружения → Settings → Variables and Secrets → Add → Secret. Секреты задаёт только владелец.`,
  enabled: 'ИИ включён',
  enabledHint: 'Выключено — ни одного запроса к модели, что бы ни было в остальных настройках.',
  check: 'Проверить подключение',
  checkHint: 'Один крошечный запрос к модели: доля цента.',
  checked: (ok: boolean) => (ok ? 'Подключение работает' : 'Модель не ответила'),
  never: 'Подключение ещё не проверялось.',
  lastCheck: (ok: boolean, when: string, model: string | null, code: string | null) =>
    ok ? `Работает: ${model ?? ''}, ${when}` : `Ошибка ${code ?? ''}, ${when}`,
  checkBlocked: {
    NO_KEY: 'Сначала добавьте ключ.',
    DISABLED: 'Сначала включите ИИ и сохраните.',
    NO_MODEL: 'Укажите модель и сохраните.',
    NO_PRICE: 'У выбранной модели нет цены: добавьте её в «Цены моделей».',
    BUDGET: 'Бюджет исчерпан.'
  } as Record<string, string>,
  modelsTitle: 'Модели',
  modelsNote: 'Названия как в API провайдера',
  draftModel: 'Для черновиков',
  draftModelHint: 'Пишет посты и сценарии.',
  cheapModel: 'Для проверок',
  cheapModelHint: 'Проверки, теги, классификация: самая дешёвая.',
  pricesTitle: 'Цены моделей',
  pricesNote: 'USD за 1 млн токенов, со страницы цен провайдера',
  pricesHint: 'По этим ценам считаются расходы. Если модели нет в списке, её запросы считаются «без цены».',
  model: 'Модель',
  input: 'Вход',
  cached: 'Вход из кэша',
  output: 'Выход',
  addPrice: 'Добавить модель',
  removePrice: 'Убрать',
  budgetTitle: 'Бюджет',
  monthly: 'На месяц, $',
  monthlyHint: 'Кончился — ИИ останавливается до 1-го числа, бот пишет об этом.',
  daily: 'Дневной лимит, $',
  dailyHint: 'Чтобы один день не съел весь месяц.',
  warnAt: 'Предупредить в боте при, %',
  warnAtHint: 'Один раз в месяц.',
  save: 'Сохранить',
  saved: 'Настройки ИИ сохранены',
  saveFailed: 'Не удалось сохранить. Попробуйте ещё раз.',
  conflict: 'Настройки изменились в другом окне. Обновите страницу и повторите.',
  invalid: 'Проверьте поля: числа не меньше нуля, названия моделей без пробелов, у каждой выбранной модели есть цена.',
  spendTitle: 'Расходы',
  spendNote: (month: string) => `месяц ${month}`,
  spent: 'Потрачено',
  left: 'Осталось',
  today: 'Сегодня',
  requests: 'Запросов',
  average: 'В среднем за запрос',
  unpriced: (count: number) => `Без цены: ${count} — добавьте цену модели, чтобы их учесть.`,
  kind: {
    check: 'Проверки',
    draft: 'Черновики',
    rewrite: 'Правки',
    review: 'Разборы',
    profile: 'Профиль стиля',
    other: 'Другое'
  } satisfies Record<AiUsageKind, string>,
  blocked: {
    disabled: 'ИИ выключен.',
    no_key: 'Нет ключа — запросы не идут.',
    no_model: 'Не выбрана модель.',
    no_price: 'У выбранной модели нет цены — без неё расходы не посчитать, ИИ не запускается.',
    monthly_budget: 'Месячный бюджет исчерпан — ИИ остановлен до 1-го числа.',
    daily_cap: 'Дневной лимит исчерпан — продолжим завтра.'
  } satisfies Record<NonNullable<AiSpendDto['blockedBy']>, string>,
  voiceTitle: 'Голос',
  voiceBody:
    'Подготовлены профиль стиля (по 526 постам канала), база из 520 постов и справочник сленга и мемов Доты. Подключатся к генерации на следующем шаге, вместе с «Моим опытом» — правилами из ваших правок и разборов роликов.'
};

export const usd = (value: number) =>
  value === 0 ? '$0' : value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
