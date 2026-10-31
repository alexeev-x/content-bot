/** Copy of the «Рубрики» tab list and the rubric drawer. */
export const listCopy = {
  search: 'Найти рубрику',
  searchPlaceholder: 'Поиск рубрики',
  filterLabel: 'Показать рубрики',
  filters: { all: 'Все', active: 'Выходят', off: 'Выключены', attention: 'Нужны действия' },
  groups: {
    active: 'Выходят',
    attention: 'Нужны действия',
    waiting: 'Ждут своего этапа',
    off: 'Выключены'
  },
  switchLabel: (title: string) => `Рубрика «${title}»: включить`,
  never: 'ещё не выходила',
  last: (when: string) => `был ${when}`,
  next: (when: string) => `следующий ${when}`,
  withPicture: 'С картинкой',
  withPoll: 'С опросом',
  noResults: 'Ничего не найдено',
  noResultsHint: 'Измените запрос или фильтр.',
  blocked: (count: number) => `Не могут выходить: ${count}`,
  detail: {
    restLabel: 'Отдых, дней',
    restHint: (base: number) => `По умолчанию ${base}. От 7 до 60.`,
    decrement: 'Меньше на день',
    increment: 'Больше на день',
    save: 'Сохранить',
    close: 'Закрыть',
    blockers: 'Что мешает',
    rest: 'Отдых между постами',
    history: 'История',
    historyEmpty: 'История пуста',
    historyHint: 'Слотов этой рубрики ещё не было.',
    state: 'Состояние',
    lastPost: 'Последний пост',
    nextPost: 'Следующий слот'
  }
} as const;
