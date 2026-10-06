// Copy of the posts screens. Kept next to the feature so parallel screens do not collide in the shared ru.ts.
export const postsCopy = {
  list: {
    title: 'Посты',
    description: 'Черновики и одобренные посты, сначала недавно изменённые.',
    create: 'Новый пост',
    searchLabel: 'Поиск по загруженным постам',
    searchPlaceholder: 'Поиск по названию и тексту',
    searchScope: 'Поиск идёт только по уже загруженным постам.',
    statusFilter: 'Статус',
    allStatuses: 'Все',
    tableLabel: 'Список постов',
    columns: { title: 'Пост', status: 'Статус', updated: 'Изменён', revision: 'Ревизия' },
    revision: (revision: number) => `ред. ${revision}`,
    untitled: 'Без названия',
    emptyBody: 'Текст не заполнен',
    loaded: (count: number) => `Загружено постов: ${count}`,
    loadMore: 'Показать ещё',
    loadingMore: 'Загружаем…',
    loadMoreFailed: 'Не удалось загрузить следующие посты.',
    emptyTitle: 'Постов пока нет',
    emptyDescription: 'Создайте первый черновик: он сохранится на сервере и его можно будет одобрить и опубликовать.',
    filteredEmptyTitle: 'Нет постов с такими условиями',
    filteredEmptyDescription: 'Измените запрос или статус, либо сбросьте фильтры.',
    resetFilters: 'Сбросить фильтры',
    errorTitle: 'Не удалось загрузить посты',
    errorMessage: 'Список не получен. Проверьте соединение и повторите.',
    forbiddenTitle: 'Нет доступа',
    forbiddenMessage: 'У этой учётной записи нет доступа к постам.'
  },
  editor: {
    newTitle: 'Новый пост',
    untitled: 'Без названия',
    back: 'Все посты',
    titleLabel: 'Заголовок',
    titleCounter: (length: number, max: number) => `${length} / ${max}`,
    bodyLabel: 'Текст',
    bodyDescription: 'Обычный текст: разметка не применяется.',
    tabs: { label: 'Режим редактора', edit: 'Текст', preview: 'Превью' },
    previewHeading: 'Так увидят в Telegram',
    previewEmpty: 'Здесь появится ваш пост',
    previewNote:
      'Заголовок выделен жирным, далее пустая строка и текст. Символы < > & показываются как есть, превью ссылок отключено.',
    messageLength: (length: number, max: number) => `В сообщении ${length} из ${max} символов`,
    messageLengthHelp: 'Заголовок, пустая строка и текст вместе не должны превышать лимит Telegram.',
    messageTooLong: (over: number) =>
      `Сообщение длиннее лимита Telegram на ${over}. Черновик сохранить можно, но одобрить и отправить нельзя.`,
    revision: (revision: number) => `Ревизия ${revision}`,
    save: 'Сохранить',
    create: 'Создать черновик',
    saveHint: 'Ctrl/⌘+S',
    approve: 'Одобрить',
    approveFirstSave: 'Сначала сохраните черновик',
    saveState: {
      new: 'Черновик ещё не создан',
      saved: (time: string) => `Сохранено в ${time}`,
      dirty: 'Есть несохранённые изменения',
      saving: 'Сохранение…',
      failed: 'Не сохранено'
    },
    validation: {
      titleRequired: 'Введите заголовок',
      titleTooLong: (max: number) => `Заголовок не длиннее ${max} символов`,
      bodyTooLong: (max: number) => `Текст не длиннее ${max} символов`,
      forbiddenChars: 'Уберите управляющие символы: допустимы только переносы строк и табуляция',
      emptyBody: 'Добавьте текст поста: без него одобрить нельзя'
    },
    approveDialog: {
      title: (title: string) => `Одобрить пост «${title}»?`,
      description:
        'После одобрения текст нельзя изменить. Одобрение ничего не отправляет: публикацию вы запустите отдельно.',
      descriptionDirty:
        'Сначала будут сохранены ваши правки. После одобрения текст нельзя изменить. Одобрение ничего не отправляет.',
      confirm: 'Одобрить пост',
      cancel: 'Не одобрять'
    },
    approved: {
      readOnlyTitle: 'Пост одобрен и закрыт для правок',
      readOnlyBody: 'Текст нельзя изменить. Чтобы выпустить другую версию, создайте новый пост.',
      newPost: 'Новый пост',
      announce: 'Пост одобрен. Теперь его можно опубликовать.'
    },
    conflict: {
      staleTitle: 'Пост уже изменён в другом месте',
      staleBody:
        'Ваши правки не потеряны и остаются в редакторе. Ничего не перезаписано: сравните версии и решите, что оставить.',
      lockedTitle: 'Пост уже одобрен в другом месте',
      lockedBody: 'Ваши правки не сохранены, но остаются перед вами. Одобренный пост нельзя изменить.',
      showServer: 'Показать серверную версию',
      overwrite: 'Перезаписать моими',
      loadingServer: 'Загружаем серверную версию…',
      serverFailed: 'Не удалось загрузить серверную версию.',
      retryServer: 'Повторить',
      dialogTitle: 'Сравнение версий',
      dialogDescription: 'Ниже ваш текст и версия на сервере. Пока вы ничего не выбрали, ничего не изменено.',
      mine: 'Ваша версия',
      server: (revision: number) => `На сервере, ревизия ${revision}`,
      titleField: 'Заголовок',
      bodyField: 'Текст',
      empty: 'Пусто',
      takeServer: 'Взять серверную версию',
      close: 'К редактору',
      overwriteDialog: {
        title: 'Перезаписать серверную версию вашей?',
        description:
          'Правки, сделанные в другом месте, будут заменены вашим текстом. Сначала мы загрузим актуальную ревизию.',
        confirm: 'Перезаписать',
        cancel: 'Не перезаписывать'
      }
    },
    leave: {
      title: 'Выйти без сохранения?',
      description: 'Несохранённые изменения будут потеряны.',
      confirm: 'Выйти без сохранения',
      cancel: 'Остаться'
    },
    errors: {
      saveTitle: 'Не удалось сохранить',
      approveTitle: 'Не удалось одобрить',
      keep: 'Ваш текст остался в редакторе.',
      validation: 'Сервер не принял текст. Проверьте заголовок и текст.',
      tooLarge: 'Пост слишком большой для сервера. Сократите текст.',
      unavailable: 'Сервер сейчас недоступен. Повторите чуть позже.',
      rate: 'Слишком много запросов. Повторите чуть позже.',
      forbidden: 'Нет доступа к этому действию.',
      generic: 'Что-то пошло не так.',
      requestId: 'Идентификатор запроса',
      retry: 'Повторить'
    },
    loading: 'Загружаем пост…',
    loadError: 'Не удалось загрузить пост',
    loadErrorMessage: 'Пост не получен. Повторите попытку.',
    notFoundTitle: 'Пост не найден',
    notFoundMessage: 'Возможно, ссылка устарела. Вернитесь к списку постов.'
  },
  publications: {
    title: 'Публикации поста',
    publish: 'Опубликовать',
    empty: 'Этот пост ещё не публиковали и не планировали.',
    loadError: 'Не удалось загрузить публикации поста.',
    scheduledFor: (time: string, zone: string) => `${time}, ${zone}`,
    revision: (revision: number) => `ред. ${revision}`,
    created: 'Публикация создана',
    openAll: 'Все публикации'
  }
} as const;
