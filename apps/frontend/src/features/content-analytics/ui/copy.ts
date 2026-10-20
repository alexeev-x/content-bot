import type { AiChainWarning, AiChangedPart, AiReviewLimit, ContentPlatform } from '@alexeev/contracts';

export const copy = {
  title: 'Аналитика',
  subtitle: 'Telegram, YouTube и TikTok в одном месте',
  refresh: 'Обновить',
  refreshed: 'Данные обновлены',
  refreshFailed: 'Не удалось обновить. Попробуйте ещё раз через минуту.',
  updated: (when: string) => `Обновлено ${when}`,
  neverUpdated: 'Ещё не обновлялось',
  followers: 'подписчиков',
  week: 'за 7 дней',
  views7d: 'Просмотры за 7 дней',
  items7d: 'Публикаций за 7 дней',
  noHistory: 'Изменение появится через неделю сбора',
  openProfile: (platform: string) => `Открыть ${platform}`,
  state: {
    not_configured: 'Не подключено',
    pending: 'Первый сбор в течение часа',
    error: 'Сбор не удался'
  },
  setup: {
    telegram: 'Укажите публичный канал в настройках Worker (ANALYTICS_TELEGRAM_CHANNEL).',
    youtube: 'Добавьте ключ YouTube Data API в секреты Worker (YOUTUBE_API_KEY).',
    tiktok: 'Нажмите «Подключить TikTok» в разделе «Аналитика» и разрешите доступ на TikTok.'
  } satisfies Record<ContentPlatform, string>,
  errors: {
    TELEGRAM_PREVIEW_FETCH: 'Telegram не ответил. Повторим через 15 минут.',
    TELEGRAM_PREVIEW_HTTP: 'Telegram не отдал ленту канала. Повторим через 15 минут.',
    TELEGRAM_PREVIEW_SHAPE: 'Лента канала пустая или изменилась. Проверьте, что канал публичный.',
    TELEGRAM_PREVIEW_BODY_LIMIT: 'Лента канала слишком большая.',
    YOUTUBE_KEY: 'YouTube не принял ключ. Проверьте YOUTUBE_API_KEY и что YouTube Data API v3 включён.',
    YOUTUBE_QUOTA: 'Закончился дневной лимит YouTube API. Сбор продолжится завтра.',
    YOUTUBE_CHANNEL_NOT_FOUND: 'YouTube не нашёл канал. Проверьте ANALYTICS_YOUTUBE_CHANNEL_ID.',
    YOUTUBE_FETCH: 'YouTube не ответил. Повторим через 15 минут.',
    TIKTOK_RECONNECT: 'Доступ к TikTok истёк или отозван. Подключите TikTok заново.',
    TIKTOK_SCOPE: 'TikTok не дал нужных разрешений. Подключите заново и разрешите всё.',
    TIKTOK_RATE: 'TikTok ограничил частоту запросов. Повторим через 15 минут.',
    TIKTOK_FETCH: 'TikTok не ответил. Повторим через 15 минут.',
    TIKTOK_HTTP: 'TikTok вернул ошибку. Повторим через 15 минут.',
    TIKTOK_SHAPE: 'TikTok прислал неожиданный ответ. Повторим через 15 минут.'
  } as Record<string, string>,
  errorFallback: (code: string) => `Сбор не удался (${code}). Повторим через 15 минут.`,
  top: {
    title: 'Лучшее за 30 дней',
    empty: 'Пока нет публикаций за 30 дней',
    emptyHint: 'Появятся после первого сбора.'
  },
  table: {
    title: 'Все публикации и видео',
    label: 'Публикации и видео',
    filter: 'Платформа',
    all: 'Все',
    item: 'Публикация',
    platform: 'Платформа',
    published: 'Опубликовано',
    views: 'Просмотры',
    likes: 'Лайки',
    comments: 'Комментарии',
    er: 'Вовлечённость',
    multiple: 'К обычному',
    more: 'Показать ещё',
    shown: (n: number) => `Показано: ${n}`,
    empty: 'Здесь будут посты и видео',
    emptyHint: 'Подключите платформу выше или нажмите «Обновить».',
    error: 'Не удалось загрузить список.'
  },
  detail: {
    open: (platform: string) => `Открыть в ${platform}`,
    growth: 'Рост просмотров',
    growthLabel: (views: string) => `График просмотров, сейчас ${views}`,
    growthEmpty: 'Кривая появится после второго замера: первые 72 часа замеры каждый час, потом раз в день.',
    observed: (when: string) => `Последний замер ${when}`,
    rank: (rank: number, total: number, platform: string, days: number) =>
      `${rank}-е место из ${total} в ${platform} за ${days} дней`,
    versus: (multiple: number, median: string) =>
      multiple >= 1
        ? `В ${multiple.toLocaleString('ru-RU')} раза больше медианы (${median})`
        : `${Math.round(multiple * 100)}% от медианы (${median})`,
    error: 'Не удалось загрузить публикацию.'
  },
  loadError: 'Не удалось загрузить аналитику.',
  truncated: 'Публикаций больше 1000: самые старые в расчёт не вошли. Выберите период короче.',
  filters: { period: 'Период', platform: 'Платформа' },
  sources: { label: 'Источники данных' },
  tiktok: {
    connect: 'Подключить TikTok',
    disconnect: 'Отключить',
    connectFailed: 'Не удалось начать вход в TikTok. Проверьте ключи приложения в Cloudflare.',
    disconnectTitle: 'Отключить TikTok?',
    disconnectDescription:
      'Studio забудет ключи доступа и отзовёт их в TikTok. Уже собранная статистика останется. Подключить снова можно в любой момент.',
    disconnectConfirm: 'Отключить TikTok',
    disconnectCancel: 'Оставить',
    disconnected: 'TikTok отключён',
    result: {
      connected: 'TikTok подключён. Нажмите «Обновить», чтобы сразу загрузить данные.',
      denied: 'Доступ в TikTok не разрешён. Подключение отменено.',
      expired: 'Ссылка входа устарела или уже использована. Нажмите «Подключить TikTok» ещё раз.',
      failed: 'TikTok не подтвердил вход. Попробуйте ещё раз через минуту.'
    }
  },
  insights: {
    title: (days: number) => `Что сделать · ${days} дней`,
    empty: 'Пока мало данных для выводов. Они появятся после первых сборов.'
  },
  performance: {
    title: 'Каждая публикация',
    note: 'По порядку выхода; наведите или выберите стрелками',
    legend: 'Обозначения',
    strong: 'Выше 1,5× медианы',
    soft: 'Остальные',
    median: 'Медиана',
    empty: 'За период публикаций нет.',
    summary: (count: number, median: string) => `${count} публ., медиана ${median}`,
    chartLabel: (platform: string, count: number, median: string) =>
      `${platform}: просмотры ${count} публикаций по порядку выхода, медиана ${median}. Стрелки выбирают публикацию, Enter открывает.`,
    multiple: (multiple: number) =>
      multiple >= 1
        ? `${(Math.round(multiple * 10) / 10).toLocaleString('ru-RU')}× к медиане`
        : `${Math.round(multiple * 100)}% от медианы`
  },
  followersPanel: {
    title: 'Подписчики',
    chartLabel: (platform: string, now: string) => `${platform}: подписчики по дням, сейчас ${now}`,
    none: 'Нет данных',
    collecting: (since: string) => `История копится с ${since}: график появится со второго дня.`
  },
  heatmap: {
    title: 'Когда публиковать',
    note: (timezone: string) => `Медиана просмотров к обычной, ${timezone}`,
    none: 'Нет публикаций',
    weekday: 'День',
    cell: (items: number, median: string, multiple: number | null) =>
      `${items} публ., медиана ${median}${multiple === null ? '' : `, ${multiple.toLocaleString('ru-RU')}× к обычной`}`
  },
  compare: {
    title: 'Сравнение платформ',
    note: 'В скобках — изменение к прошлому периоду',
    platform: 'Платформа',
    followers: 'Подписчики',
    items: 'Публикаций',
    views: 'Просмотры',
    median: 'Медиана',
    engagement: 'Вовлечённость',
    reach: 'Охват'
  },
  ranked: {
    best: 'Лучшие',
    worst: 'Ниже обычного',
    note: 'Во сколько раз выше медианы своей платформы',
    worstNote: 'Без последних двух суток: они ещё набирают',
    empty: 'Пока нечего сравнивать.'
  },
  // «Сценарий из ИИ-редактора» → the way from the task to this video (plan stage 4).
  chain: {
    label: 'Путь сценария',
    task: 'Задание',
    draft: 'Черновик ИИ',
    noDraft: 'Первый черновик не сохранился',
    edits: 'Ваши правки',
    approved: 'Одобренный текст',
    sameVideo: 'Это же видео',
    model: (model: string) => `модель ${model}`,
    pack: (hash: string) => `набор ${hash}`,
    changed: (percent: number) => `изменено ${percent}%`,
    unchanged: 'без правок',
    parts: (parts: string) => `Правили: ${parts}`,
    showAll: 'Показать полностью',
    showLess: 'Свернуть',
    open: (label: string) => `Открыть видео: ${label}`,
    part: {
      hook: 'хук',
      ending: 'концовку',
      length: 'длину',
      structure: 'разбивку на абзацы',
      swearing: 'мат',
      ai_wording: 'ИИ-обороты'
    } satisfies Record<AiChangedPart, string>,
    warning: {
      approved_after_video: 'Сценарий одобрен после выхода видео — возможно, привязан не тот',
      approved_long_before: 'Сценарий одобрен больше чем за 14 дней до видео — проверьте привязку'
    } satisfies Record<AiChainWarning, string>
  },
  // «Разбор через 72 часа» (plan stage 5): facts, the same-format observation, hypotheses that are not conclusions.
  review: {
    title: 'Разбор через 72 часа',
    notDue: 'Разбор появится, когда видео исполнится 72 часа',
    pending: 'Разбор готовится',
    loadError: 'Не удалось загрузить разбор.',
    retry: 'Повторить',
    views: 'Просмотры на 72-м часу',
    likes: 'Лайков на 1 000',
    comments: 'Комментариев на 1 000',
    shares: 'Репостов на 1 000',
    position: {
      above: 'Выше обычного для формата',
      within: 'В обычных пределах',
      below: 'Ниже обычного'
    },
    range: (median: string, low: string, high: string) => `Медиана ${median}, обычно ${low}–${high}`,
    basedOn: (count: number, format: string | null) =>
      format === null
        ? `по ${count} видео платформы: сравнение со всеми видео платформы — слабое`
        : `по ${count} видео формата «${format}»`,
    hypotheses: 'Гипотезы (не выводы)',
    nextTest: 'Следующий тест',
    meta: (model: string | null, cost: string | null) =>
      [model === null ? null : `модель ${model}`, cost === null ? null : `стоимость ${cost}`]
        .filter((part) => part !== null)
        .join(' · '),
    limited: {
      no_script: 'Нет привязанного сценария — гипотез нет',
      weak_baseline: 'Мало видео этого формата для сравнения',
      no_snapshot: 'Нет замера на 72 часах',
      contaminated: 'Видео отмечено как искажённое',
      reviews_off: 'Разборы ИИ выключены в настройках',
      budget: 'ИИ сейчас недоступен: бюджет, лимит, ключ или модель',
      model_failed: 'Модель не ответила — только цифры'
    } satisfies Record<AiReviewLimit, string>
  },
  widget: {
    audience: 'Аудитория',
    top: 'Лучшее за 30 дней',
    all: 'Вся аналитика',
    error: 'Аналитика недоступна.'
  }
};

export function collectErrorText(code: string | null): string {
  if (code === null) return copy.state.error;
  return copy.errors[code] ?? copy.errorFallback(code);
}
