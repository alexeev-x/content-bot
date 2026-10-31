// Copy of the calendar and its drawer; the rest of «Рубрики» stays in copy.ts.
export const calendarCopy = {
  forecast: 'Прогноз',
  forecastNote: 'Прогноз: слот ещё не создан. Рубрика выйдет, если условия до того не изменятся.',
  empty: 'Слотов нет',
  emptyHint: 'Запустите рубрики или включите нужные.',
  emptyDay: 'В этот день рубрик нет',
  month: { prev: 'Предыдущий месяц', next: 'Следующий месяц', today: 'Сегодня', grid: 'Календарь месяца' },
  more: (count: number) => `+${count}`,
  moreLabel: (count: number, day: string) => `Ещё ${count}: открыть ${day}`,
  dayButton: (day: string, count: number) => (count === 0 ? day : `${day}: записей ${count}`),
  openRubric: 'Открыть рубрику',
  back: 'К списку дня',
  sections: { what: 'Что выйдет', rubric: 'О рубрике', slot: 'О слоте' },
  rows: {
    rubric: 'Рубрика',
    when: 'Когда',
    content: 'Состав',
    reason: 'Почему',
    rest: 'Отдых',
    lastPost: 'Последний пост'
  },
  restDays: (days: number) => `${days} дн.`,
  noPost: 'ещё не было',
  seededPost: 'ещё не было (стартовая отметка)',
  withBoth: 'картинка и опрос',
  withPicture: 'картинка',
  withPoll: 'опрос',
  textOnly: 'только текст',
  /** «Отдых 14 дн. прошёл» is the usual reason; the row says it only when the reason is something else. */
  usualReason: /^Отдых \d+ дн\. прошёл\.?$/
} as const;
