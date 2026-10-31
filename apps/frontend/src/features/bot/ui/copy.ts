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
  card: {
    title: 'Связь с ботом',
    username: 'Имя бота',
    copy: 'Скопировать имя бота',
    copied: 'Имя бота скопировано',
    copyFailed: 'Не удалось скопировать',
    openChat: 'Открыть чат',
    pending: 'Ждут доставки',
    pendingMeta: 'сообщений от Telegram',
    lastError: 'Ошибка доставки',
    noError: 'нет',
    address: 'Адрес бота',
    addressHere: 'этот сервер',
    addressOther: 'другой сервер',
    addressNone: 'не задан'
  },
  audience: {
    label: 'Реакции и комментарии',
    meta: (reactions: number, polls: number, comments: number) =>
      `за сутки: реакции ${reactions}, опросы ${polls}, комментарии ${comments}`,
    state: {
      not_checked: 'не проверено',
      ok: 'бот их слышит',
      bot_not_admin_in_channel: 'бот не админ канала',
      no_linked_group: 'у канала нет группы обсуждения',
      bot_blind_in_group: 'бот не видит группу обсуждения',
      no_key: 'не задан AUDIENCE_HASH_KEY',
      silent: 'за сутки ничего не пришло'
    },
    fix: {
      not_checked: 'Нажмите «Переподключить»: бот проверит канал и группу обсуждения.',
      bot_not_admin_in_channel: 'Сделайте бота админом канала и нажмите «Переподключить».',
      no_linked_group: 'Привяжите к каналу группу обсуждения — без неё комментариев нет.',
      bot_blind_in_group:
        'Сделайте бота админом группы обсуждения (или выключите privacy в BotFather) и нажмите «Переподключить».',
      no_key:
        'Задайте секрет AUDIENCE_HASH_KEY в Cloudflare → Workers → Settings → Variables and Secrets: без него комментарии не сохраняются.',
      silent: 'Проверьте, что бот админ канала и группы обсуждения, и нажмите «Переподключить».'
    }
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
