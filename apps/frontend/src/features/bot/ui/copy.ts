// Copy of the dashboard bot widget and its details drawer, kept beside the feature like the channels copy.
export const botCopy = {
  info: 'Подключение регистрирует адрес этого сервера в Telegram, ставит кнопку «Студия» в меню бота и убирает старые команды. Секреты не покидают сервер.',
  loading: 'Загружаем состояние бота…',
  error: 'Не удалось получить состояние бота. Повторите запрос.',
  forbidden: 'Нет доступа к настройкам бота.',
  refresh: 'Обновить',
  connect: 'Подключить бота',
  reconnect: 'Переподключить',
  connecting: 'Подключаем…',
  connected: 'Бот подключён. Отправьте ему /start',
  state: {
    not_configured: 'Бот не настроен',
    not_connected: 'Не подключён: Telegram не знает, куда отправлять сообщения',
    other_address: 'Подключён к другому адресу',
    connected: 'Подключён'
  },
  missingList: (names: string) => `Не заданы или заданы неверно: ${names}`,
  secretRule: 'TELEGRAM_WEBHOOK_SECRET: только латинские буквы, цифры, «_» и «-», до 256 символов.',
  missingHint: 'Задайте их в Cloudflare → Workers → Settings → Variables and Secrets',
  connectDisabledReason: 'Сначала задайте настройки на сервере',
  otherAddressHint: 'Подключение перенаправит бота сюда',
  currentAddress: 'Текущий адрес',
  expectedAddress: 'Адрес этого сервера',
  deliveryErrorTitle: 'Последняя ошибка доставки',
  deliveryErrorAt: (when: string) => `Когда: ${when}`,
  pending: (count: number) => `Ждут доставки: ${count}`,
  failure: {
    not_configured: {
      title: 'Бот не настроен',
      body: 'На сервере не хватает настроек. Задайте их и обновите состояние.'
    },
    migration_pending: {
      title: 'Нужно применить миграцию базы',
      body: 'GitHub → Actions → D1 migrations → Run workflow (dev)'
    },
    rate_limited: { title: 'Слишком частые запросы' },
    unavailable: {
      title: 'Telegram не ответил',
      body: 'Сервер не смог связаться с Telegram или получил неожиданный ответ. Повторите позже.'
    },
    forbidden: { title: 'Нет доступа', body: 'Подключать бота может только владелец.' },
    unexpected: { title: 'Не удалось подключить бота', body: 'Что-то пошло не так. Повторите попытку.' }
  },
  wait: (seconds: number) => `Подождите примерно ${seconds} с и повторите.`,
  retry: 'Повторить',
  widget: {
    title: 'Бот',
    loading: 'Загружаем состояние бота…',
    statusError: 'Не удалось получить статус бота',
    details: 'Подробнее',
    detailsTitle: 'Бот',
    connect: 'Подключить',
    reconnect: 'Подключить заново',
    healthy: (username: string | null) => (username ? `Бот @${username}` : 'Бот'),
    notConfigured: 'Бот не настроен',
    notConnected: 'Бот не подключён',
    otherAddress: 'Подключён к другому адресу',
    deliveryError: 'Ошибка доставки',
    missing: (names: string) => `Не заданы: ${names}`
  }
} as const;
