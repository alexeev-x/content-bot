// «Рубрики» copy, kept beside the feature like the bot's.
export const rubricsCopy = {
  title: 'Рубрики',
  description: 'Когда какая рубрика выйдет в канал и почему. Время — московское.',
  forecastTitle: 'Это прогноз',
  forecastBody:
    'Автопубликация рубрик ещё не включена: план считается заново при каждом открытии и учитывает посты, уже стоящие в «Публикациях». Событийные рубрики (патч, анонсы, утечки) появятся, когда случится событие.',
  views: { label: 'Вид календаря', month: 'Месяц', list: 'Список' },
  weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  picture: 'с картинкой',
  poll: 'с опросом',
  empty: 'В ближайшие 35 дней рубрик нет',
  emptyHint: 'Ни одна рубрика не отдохнула или все слоты заняты другими постами.',
  error: 'Не удалось получить прогноз. Повторите запрос.',
  loading: 'Считаем прогноз…',
  unavailableTitle: (count: number) => `Не могут выходить на этом сервере: ${count}`,
  needs: {
    browser: 'Browser Rendering',
    ai_text: 'ИИ (текст)',
    ai_image: 'ИИ (картинки)',
    ai_upscale: 'ИИ (улучшение фото)',
    stratz: 'STRATZ',
    stats_db: 'база матчей'
  },
  missing: (needs: string) => `нужно: ${needs}`,
  computedAt: (time: string) => `Посчитано в ${time} МСК`
} as const;
