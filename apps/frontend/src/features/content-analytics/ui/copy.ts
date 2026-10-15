import type { ContentPlatform } from '@alexeev/contracts';

export const copy = {
  title: 'Аналитика',
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
    tiktok: 'Нужно приложение TikTok for Developers и вход через TikTok. Подключим следующим шагом.'
  } satisfies Record<ContentPlatform, string>,
  errors: {
    TELEGRAM_PREVIEW_FETCH: 'Telegram не ответил. Повторим через 15 минут.',
    TELEGRAM_PREVIEW_HTTP: 'Telegram не отдал ленту канала. Повторим через 15 минут.',
    TELEGRAM_PREVIEW_SHAPE: 'Лента канала пустая или изменилась. Проверьте, что канал публичный.',
    TELEGRAM_PREVIEW_BODY_LIMIT: 'Лента канала слишком большая.',
    YOUTUBE_KEY: 'YouTube не принял ключ. Проверьте YOUTUBE_API_KEY и что YouTube Data API v3 включён.',
    YOUTUBE_QUOTA: 'Закончился дневной лимит YouTube API. Сбор продолжится завтра.',
    YOUTUBE_CHANNEL_NOT_FOUND: 'YouTube не нашёл канал. Проверьте ANALYTICS_YOUTUBE_CHANNEL_ID.',
    YOUTUBE_FETCH: 'YouTube не ответил. Повторим через 15 минут.'
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
    likes: 'Лайки, реакции',
    comments: 'Комментарии',
    er: 'Вовлечённость',
    untitled: 'Без текста',
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
    error: 'Не удалось загрузить публикацию.'
  },
  loadError: 'Не удалось загрузить аналитику.',
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
