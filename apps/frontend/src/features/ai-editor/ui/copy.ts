const day = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export const copy = {
  title: 'ИИ-редактор',
  tabs: { profile: 'Обо мне' },
  profile: {
    loadError: 'Не удалось загрузить профиль.',
    dotaTitle: 'Дота',
    aboutTitle: 'Обо мне',
    refresh: 'Обновить из Доты',
    dotaEmptyNoAccount:
      'Впишите Dota Friend ID ниже и сохраните — студия будет раз в день брать ранг и героев из OpenDota.',
    dotaEmpty: 'Данных из Доты ещё нет. Нажмите «Обновить из Доты».',
    rank: 'Ранг',
    noRank: 'нет ранга',
    games: 'Матчи',
    winLoss: (wins: number, losses: number) => `${wins} побед, ${losses} поражений`,
    yes: 'есть',
    no: 'нет',
    topHeroes: 'Чаще всего играете',
    heroLine: (games: number, winRate: number) => `${games} игр · ${Math.round(winRate * 100)}% побед`,
    privateTitle: 'Матчи скрыты',
    privateBody:
      'В Доте: Настройки → Опции → Социальные → «Открыть публичный доступ к данным матчей». После следующей игры здесь появятся матчи и герои.',
    fetched: (iso: string) => `Обновлено ${day(iso)}; дальше раз в день само.`,
    account: 'Dota Friend ID',
    accountHint: 'Цифры из профиля в Доте.',
    accountInvalid: 'Только цифры',
    hours: 'Часов в Доте',
    hoursInvalid: 'Целое число',
    learning: 'Учу сейчас',
    learningHint: 'Герои через запятую: Оракл, Феникс.',
    fields: {
      unknownAspects: { label: 'Пока не понимаю', hint: 'Что в игре ещё непонятно: тайминги Рошана, стаки…' },
      experiments: { label: 'Эксперименты рубрик', hint: 'Что сейчас пробуете в «Учу фидить» и «Учусь играть».' },
      notes: { label: 'Сейчас актуально', hint: 'Стримы, розыгрыши, призыв недели — то, что скоро устареет.' }
    },
    save: 'Сохранить',
    saved: 'Сохранено, ИИ уже пишет с учётом этого',
    saveFailed: 'Не удалось сохранить. Попробуйте ещё раз.',
    conflict: 'Профиль изменился в другом окне — загрузили свежий, повторите.',
    dotaUpdated: 'Данные из Доты обновлены',
    dotaFailed: 'OpenDota не ответил. Попробуйте позже.',
    noAccount: 'Сначала впишите и сохраните Dota Friend ID.',
    promptTitle: 'Так ИИ видит вас',
    promptNote: 'уходит с каждым запросом',
    promptEmpty: 'Пока пусто: заполните поля выше.'
  }
};
