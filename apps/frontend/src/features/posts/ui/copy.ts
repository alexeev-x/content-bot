import type { PollIssue } from '@alexeev/contracts';
// Copy of the posts screens. Kept next to the feature so parallel screens do not collide in the shared ru.ts.
export const postsCopy = {
  list: {
    title: 'Посты',
    description: 'Черновики, одобренные и запланированные посты, сначала недавно изменённые.',
    create: 'Новый пост',
    searchLabel: 'Поиск по постам',
    tabs: { label: 'Раздел постов', all: 'Все', drafts: 'Черновики', archive: 'Архив' },
    tableLabel: 'Список постов',
    columns: { title: 'Пост', status: 'Статус', updated: 'Изменён', actions: 'Меню' },
    state: {
      draft: 'Черновик',
      approved: 'Одобрен',
      scheduled: 'Запланирован',
      sending: 'Отправляется',
      unknown: 'Нужна сверка'
    },
    scheduledAt: (time: string) => `на ${time}`,
    untitled: 'Без названия',
    emptyBody: 'Текст не заполнен',
    loaded: (count: number, total: number) => `Загружено ${count} из ${total}`,
    sendAt: (time: string) => `Отправка ${time}`,
    checkResult: 'Проверьте результат',
    panel: { all: 'Все посты', drafts: 'Черновики', archive: 'Архив' },
    filters: {
      searchHint: 'Название, текст, канал, статус',
      phoneSearch: 'Поиск',
      sort: 'Сортировка',
      sortDefault: 'По умолчанию',
      active: 'Включённые фильтры',
      resetAll: 'Сбросить всё'
    },
    loadMore: 'Показать ещё',
    loadingMore: 'Загружаем…',
    loadMoreFailed: 'Не удалось загрузить следующие посты.',
    emptyTitle: 'Постов пока нет',
    emptyDescription: 'Создайте первый черновик: он сохранится на сервере и его можно будет одобрить и опубликовать.',
    filteredEmptyTitle: 'В этом разделе постов нет',
    filteredEmptyDescription: 'Откройте «Все», чтобы увидеть все посты.',
    showAll: 'Показать все посты',
    searchEmptyTitle: 'Ничего не найдено',
    searchEmptyDescription: 'Попробуйте другой запрос или очистите поиск. Ищем по всем постам этой вкладки.',
    searchFoundInArchive: (count: number) =>
      `Здесь ничего нет, но в архиве совпадений: ${count}. Опубликованные посты уходят туда — откройте вкладку «Архив».`,
    errorTitle: 'Не удалось загрузить посты',
    errorMessage: 'Список не получен. Проверьте соединение и повторите.',
    forbiddenTitle: 'Нет доступа',
    forbiddenMessage: 'У этой учётной записи нет доступа к постам.'
  },
  archive: {
    tableLabel: 'Архив постов',
    note: 'Хранятся 30 дней, затем удаляются',
    columns: { title: 'Название', channels: 'Каналы', sentAt: 'Опубликовано', left: 'Осталось' },
    noChannels: 'Нет данных о каналах',
    daysLeft: (days: number) => `Удалится через ${days} дн.`,
    lastDays: (days: number) => `Удалится через ${days} дн.`,
    lastDaysHint: 'Скоро удалится',
    emptyTitle: 'Архив пуст',
    emptyDescription: 'Здесь появятся посты после публикации. Они хранятся 30 дней.',
    errorTitle: 'Не удалось загрузить архив',
    errorMessage: 'Архив не получен. Проверьте соединение и повторите.'
  },
  actions: {
    rowMenu: (title: string) => `Действия с постом «${title}»`,
    duplicate: 'Дублировать',
    duplicating: 'Создаём копию…',
    duplicateFailed: 'Не удалось завершить копирование',
    duplicateFailedBody:
      'Исходный пост не изменён. Черновик-копия мог уже создаться; повторите действие, чтобы безопасно продолжить копирование.',
    duplicateChanged: 'Черновик-копия изменился. Проверьте его в списке и создайте новую копию при необходимости.',
    delete: 'Удалить',
    deleteBlocked: (reason: string) => `Удалить: ${reason}`,
    blockedInProgress: 'идёт отправка',
    blockedUnknown: 'нужна сверка результата',
    reconcile: 'Сверить результат',
    publish: 'Опубликовать',
    returnToDraft: 'Вернуть в черновик',
    returnDraftBlockedPending: 'Вернуть в черновик: есть ожидающая публикация',
    returnDraftBlockedInProgress: 'Вернуть в черновик: идёт отправка',
    returnDraftBlockedUnknown: 'Вернуть в черновик: сначала сверьте результат',
    restore: 'Вернуть из архива',
    deleteNow: 'Удалить сейчас',
    pageMenu: 'Действия с постом'
  },
  selection: {
    select: 'Выбрать',
    done: 'Готово',
    row: (title: string) => `Выбрать пост «${title}»`,
    blockedRow: (title: string, reason: string) => `Пост «${title}» нельзя выбрать: ${reason}`,
    all: 'Выбрать все загруженные посты',
    bar: 'Выбранные посты',
    selected: (count: number) => `Выбрано: ${count}`,
    limit: (max: number) => `Не больше ${max} за раз.`,
    clear: 'Снять выделение',
    delete: 'Удалить',
    restore: 'Вернуть из архива',
    failedReason: (reason: string) => `Не удалось: ${reason}`
  },
  deleteDialog: {
    titleOne: (title: string) => `Удалить пост «${title}»?`,
    titleMany: (count: string) => `Удалить ${count}?`,
    channelsKept: 'Сообщения в каналах не удаляются.',
    irreversible: 'Восстановить нельзя.',
    plain: 'Пост будет удалён без возможности восстановления.',
    publicationsKept: 'Опубликованные публикации останутся в разделе «Публикации» с пометкой «Пост удалён».',
    withRecords:
      'Пост будет удалён без возможности восстановления. Опубликованные публикации останутся в разделе «Публикации» с пометкой «Пост удалён».',
    cancelling: (count: number) => `Будут отменены запланированные публикации: ${count}.`,
    cancellingFirst: (channel: string | undefined, time: string) => `Первая: ${channel ? `${channel}, ` : ''}${time}.`,
    recordsMany: 'Опубликованные публикации останутся в разделе «Публикации» с пометкой «Пост удалён».',
    confirmOne: 'Удалить',
    confirmMany: (count: string) => `Удалить ${count}`,
    pending: 'Удаляем…',
    keep: 'Не удалять',
    retry: 'Повторить'
  },
  lifecycle: {
    deleted: (title: string) => `Пост «${title}» удалён`,
    deletedAll: (count: number) => `Удалено: ${count}`,
    deletedSome: (done: number, total: number, failed: number) => `Удалено: ${done} из ${total}. Не удалось: ${failed}`,
    deletedNone: (failed: number) => `Ничего не удалено. Не удалось: ${failed}`,
    restored: 'Пост возвращён из архива',
    returnedToDraft: 'Пост возвращён в черновик',
    returnedToDraftBody: 'Теперь пост можно снова редактировать.',
    restoredAll: (count: number) => `Возвращено: ${count}`,
    restoredSome: (done: number, total: number, failed: number) =>
      `Возвращено: ${done} из ${total}. Не удалось: ${failed}`,
    restoredNone: (failed: number) => `Ничего не возвращено. Не удалось: ${failed}`,
    show: 'Показать',
    refused: {
      NOT_FOUND: 'пост уже удалён',
      STALE_REVISION: 'пост изменился, проверьте и повторите',
      PUBLICATION_IN_PROGRESS: 'идёт отправка',
      PUBLICATION_UNKNOWN: 'нужна сверка результата',
      NOT_ARCHIVED: 'пост уже не в архиве'
    },
    notices: {
      stale: { title: 'Состояние поста изменилось', body: 'Обновили данные. Проверьте пост и повторите действие.' },
      inProgress: {
        title: 'Идёт отправка',
        body: 'Пока публикация отправляется, пост удалить нельзя. Дождитесь результата и повторите.'
      },
      unknown: {
        title: 'Нужна сверка результата',
        body: 'Неизвестно, ушло ли сообщение в канал. Пока результат не сверен, пост удалить нельзя.'
      },
      notFound: { title: 'Пост уже удалён', body: 'Обновили список.' },
      notArchived: { title: 'Пост уже не в архиве', body: 'Обновили данные.' },
      notApproved: { title: 'Пост уже не одобрен', body: 'Обновили данные.' },
      pending: {
        title: 'Есть ожидающая публикация',
        body: 'Отмените или дождитесь её завершения, затем повторите действие.'
      },
      openPublication: 'Открыть публикацию',
      requestId: 'Идентификатор запроса'
    },
    errors: {
      deleteTitle: 'Не удалось удалить',
      restoreTitle: 'Не удалось вернуть из архива',
      draftTitle: 'Не удалось вернуть в черновик',
      validation: 'Сервер не принял запрос.',
      unavailable: 'Сервер сейчас недоступен.',
      rate: 'Слишком много запросов. Повторите чуть позже.',
      forbidden: 'Нет доступа к этому действию.',
      generic: 'Что-то пошло не так.',
      nothingRemoved: 'Ничего не удалено.',
      nothingRestored: 'Ничего не изменено.'
    }
  },
  archived: {
    title: 'Пост в архиве',
    body: (date: string) => `Пост в архиве. Удалится ${date}.`,
    readOnly: 'Текст нельзя изменить. Чтобы вернуться к работе над постом, верните его из архива.',
    restoreFailedTitle: 'Не удалось вернуть из архива'
  },
  quick: {
    title: 'Новый пост',
    description: 'Черновик сохранится без публикации.',
    saveDraft: 'Сохранить черновик',
    openInEditor: 'Открыть в редакторе',
    cancel: 'Отмена'
  },
  editor: {
    newTitle: 'Новый пост',
    untitled: 'Без названия',
    back: 'Все посты',
    titleLabel: 'Заголовок',
    titleCounter: (length: number, max: number) => `${length} / ${max}`,
    bodyLabel: 'Текст',
    bodyDescription:
      'Доступно форматирование Telegram: жирный, курсив, подчёркнутый, зачёркнутый, спойлер, ссылки, код и цитаты.',
    toolbar: {
      label: 'Форматирование текста',
      emoji: 'Эмодзи',
      bold: 'Жирный',
      italic: 'Курсив',
      underline: 'Подчёркнутый',
      strike: 'Зачёркнутый',
      spoiler: 'Спойлер',
      link: 'Ссылка',
      code: 'Код в строке',
      codeBlock: 'Блок кода',
      codeLanguage: 'Язык кода',
      quote: 'Цитата',
      bulletList: 'Маркированный список',
      numberedList: 'Нумерованный список',
      shortcut: (label: string, keys: string) => `${label} (${keys})`
    },
    linkDialog: {
      title: 'Ссылка',
      description: 'Ссылка работает в http://, https:// и tg://. Другие адреса Telegram не принимает.',
      urlLabel: 'Адрес',
      textLabel: 'Текст ссылки',
      apply: 'Применить',
      remove: 'Убрать ссылку',
      cancel: 'Отмена',
      urlRequired: 'Введите адрес ссылки',
      urlInvalid: 'Адрес должен начинаться с http://, https:// или tg:// и не содержать пробелов',
      urlTooLong: (max: number) => `Адрес не длиннее ${max} символов`,
      textRequired: 'Введите текст ссылки'
    },
    languageDialog: {
      title: 'Язык кода',
      description: 'Необязательно. Telegram подсветит код этого языка: js, python, bash.',
      label: 'Язык',
      apply: 'Применить',
      cancel: 'Отмена',
      invalid: (max: number) => `Язык пишется латиницей, цифрами и знаками + # _ - и не длиннее ${max} символов`
    },
    preview: {
      linkTitle: (href: string) => `Ссылка: ${href}`,
      spoilerHidden: 'Скрытый текст, нажмите, чтобы показать'
    },
    tabs: {
      label: 'Режим редактора',
      sideLabel: 'Боковая панель поста',
      edit: 'Текст',
      preview: 'Превью',
      publications: 'Публикации'
    },
    moreActions: 'Ещё',
    previewReturn: 'Назад к редактору',
    composer: {
      label: 'Тип публикации',
      newTitle: 'Создание публикации',
      editor: 'Редактор',
      poll: 'Опрос',
      mobilePreview: 'Предпросмотр'
    },
    overLimit: 'Лимит превышен',
    previewHeading: 'Так увидят в Telegram',
    previewEmpty: 'Здесь появится ваш пост',
    previewNote:
      'Заголовок выделен жирным, далее пустая строка и текст с вашим форматированием. Символы < > & показываются как есть, превью ссылок отключено. Спойлер скрыт: нажмите на него, чтобы прочитать.',
    messageLength: (length: number, max: number) => `В сообщении ${length} из ${max} символов`,
    messageLengthHelp: 'Заголовок, пустая строка и текст вместе не должны превышать лимит Telegram.',
    messageTooLong: (over: number) =>
      `Сообщение длиннее лимита Telegram на ${over}. Черновик сохранить можно, но одобрить и отправить нельзя.`,
    save: 'Сохранить',
    saveAndExit: 'Сохранить и выйти',
    create: 'Создать черновик',
    saveHint: 'Ctrl/⌘+S',
    saveInPlaceHint: 'Ctrl/⌘+S — сохранить без выхода',
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
      emptyBody: 'Добавьте текст поста: без него одобрить нельзя',
      nothingToSend: 'Напишите текст или добавьте фото или видео',
      entities: {
        ENTITIES_TOO_MANY: 'В тексте слишком много форматирования. Уберите часть выделений.',
        ENTITIES_TOO_LARGE: 'Форматирование слишком объёмное, чаще всего из-за длинных ссылок. Уберите часть ссылок.',
        ENTITIES_OUT_OF_RANGE: 'Форматирование выходит за пределы текста. Перезагрузите страницу и повторите правку.',
        ENTITIES_SPLIT_SURROGATE: 'Выделение режет эмодзи пополам. Выделите символ целиком.',
        ENTITIES_INVALID_NESTING:
          'Это форматирование Telegram не поддерживает: ссылка, код и цитата не могут частично пересекаться с другими выделениями. Выделите их целиком или уберите пересечение.',
        ENTITIES_REQUIRED: 'Текст изменён без форматирования. Обновите страницу и повторите правку.'
      }
    },
    approved: {
      readOnlyTitle: 'Пост готов к публикации',
      readOnlyBody: 'Чтобы изменить текст — «Вернуть в черновик».',
      readOnlyBodyNoReturn: 'Чтобы выпустить другую версию, создайте новый пост.',
      footerNote: 'Пост одобрен',
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
      entitiesTooMany: 'В тексте слишком много форматирования. Уберите часть выделений.',
      entitiesTooLarge: 'Форматирование слишком объёмное, чаще всего из-за длинных ссылок. Уберите часть ссылок.',
      entitiesOutOfRange:
        'Форматирование не совпало с текстом. Ничего не потеряно: сохраните ещё раз или перезагрузите страницу.',
      entitiesSplitSurrogate: 'Выделение режет эмодзи пополам. Выделите символ целиком.',
      entitiesInvalidNesting:
        'Сервер не принял форматирование: ссылка, код или цитата частично пересекаются с другим выделением. Выделите их целиком.',
      entitiesRequired: 'Сервер не получил форматирование вместе с текстом. Сохраните ещё раз.',
      kindMismatch:
        'Тип поста не меняется после создания: текст нельзя добавить в опрос, а опрос — в текстовый пост. Создайте отдельную публикацию.',
      pollInvalid: 'Сервер не принял опрос: проверьте вопрос, варианты и режим викторины.',
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
    revision: (revision: number) => `ред. ${revision}`,
    created: 'Публикация создана',
    openAll: 'Все публикации'
  },
  // The «Опрос» tab (post-composer.md §5): a poll is a separate Telegram message, never mixed into a text post.
  poll: {
    title: 'Новый опрос',
    mark: 'Опрос',
    questionLabel: 'Вопрос',
    questionPlaceholder: 'О чём спросить подписчиков?',
    optionsLabel: 'Варианты ответов',
    optionLabel: (index: number) => `Вариант ${index + 1}`,
    add: 'Добавить вариант',
    addFull: (max: number) => `Не больше ${max} вариантов`,
    remove: (index: number) => `Удалить вариант ${index + 1}`,
    removeMin: (min: number) => `Нужно не меньше ${min} вариантов`,
    dragLabel: (index: number) => `Переместить вариант ${index + 1}`,
    dragHint:
      'Перетащите вариант за ручку. Или нажмите ручку, затем ручку того места, куда его поставить. С клавиатуры — стрелки вверх и вниз.',
    moved: (index: number) => `Вариант перемещён на место ${index + 1}`,
    errors: {
      question: 'Напишите вопрос',
      optionEmpty: 'Заполните вариант или удалите его',
      optionDuplicate: 'Такой вариант уже есть'
    },
    count: (count: number, max: number) => `${count} из ${max}`,
    settingsTitle: 'Настройки опроса',
    anonymousNote: 'В каналах опросы всегда анонимные: Telegram не показывает, кто как ответил.',
    multiple: 'Несколько ответов',
    multipleDescription: 'Можно выбрать больше одного варианта',
    multipleBlockedByQuiz: 'В викторине верный ответ один, поэтому несколько ответов недоступны.',
    quiz: 'Режим викторины',
    quizDescription: 'Один верный ответ; пояснение Telegram покажет после ответа',
    quizBlockedByMultiple: 'Сначала выключите «Несколько ответов»: в викторине верный ответ один.',
    correctLabel: 'Верный ответ',
    correctOption: (index: number, text: string) =>
      text.trim() ? `${index + 1}. ${text.trim()}` : `Вариант ${index + 1}`,
    explanationLabel: 'Пояснение',
    explanationDescription: 'Необязательно. Видно после ответа; не больше двух переносов строки.',
    issueIntro: 'Опрос ещё нельзя отправить',
    issues: {
      QUESTION_EMPTY: 'Напишите вопрос.',
      TOO_FEW_OPTIONS: 'Добавьте хотя бы два варианта ответа.',
      OPTION_EMPTY: 'Заполните все варианты или удалите пустые.',
      OPTION_DUPLICATE: 'Варианты ответов не должны повторяться.',
      QUIZ_MULTIPLE_ANSWERS: 'В викторине нельзя выбирать несколько ответов.',
      QUIZ_ANSWER_MISSING: 'Выберите верный ответ.',
      EXPLANATION_LINE_FEEDS: 'В пояснении не больше двух переносов строки.'
    } satisfies Record<PollIssue, string>,
    ready: 'Опрос готов к публикации.',
    textPostTitle: 'Это текстовый пост',
    textPostBody: 'Опрос — отдельная публикация в Telegram: его нельзя добавить к посту с текстом и медиа.',
    createPoll: 'Создать опрос',
    pollPostTitle: 'Это опрос',
    pollPostBody: 'Опрос — отдельная публикация без текста и медиа. Пост с текстом и фото пишется отдельно.',
    createText: 'Создать пост с текстом',
    mixedTitle: 'Текст и опрос — разные публикации',
    mixedBody:
      'В редакторе уже есть текст, а на вкладке «Опрос» — опрос. Оставьте что-то одно: после первого сохранения тип поста не меняется. Ничего не потеряно.',
    preview: { anonymous: 'Анонимный опрос', quiz: 'Викторина', empty: 'Вопрос опроса' }
  },
  // The «Настройки» tab: per-post Telegram send options (owner, 18.10.2026). Channel and time live on the next step.
  sendSettings: {
    optionsTitle: 'Параметры отправки',
    silent: 'Без звука',
    silentDescription: 'Подписчики получат сообщение без звукового уведомления',
    protect: 'Запретить пересылку и сохранение',
    protectDescription: 'Сообщение нельзя будет переслать или сохранить из Telegram',
    linkPreview: 'Предпросмотр ссылок',
    linkPreviewDescription: 'Карточка страницы под текстом, если в нём есть ссылка',
    linkPreviewOnlyText: 'Только для текста без фото и видео: у подписи и опроса карточки ссылки нет.',
    readOnly: 'Пост одобрен: параметры отправки не меняются, пока он не возвращён в черновик.',
    stale: 'Пост изменился в другой вкладке. Обновите страницу и повторите.',
    failed: 'Не удалось сохранить параметр. Проверьте связь и переключите ещё раз.'
  },
  // Only the owner sees it; a channel never gets the mark (owner, 16.10.2026).
  origin: {
    short: 'ИИ',
    full: (source: 'bot' | 'studio', editRatio: number | null) =>
      `Из ИИ-редактора (${source === 'bot' ? 'бот' : 'студия'})${
        editRatio === null ? '' : `, вы поправили ${Math.round(editRatio * 100)}%`
      }. Видно только вам.`
  },
  // «✦ Улучшить через ИИ» (post-composer.md §4): a suggestion is never put into the text without «Применить».
  ai: {
    button: 'Улучшить через ИИ',
    emptyHint: 'Сначала напишите текст',
    title: 'Улучшить через ИИ',
    resultTitle: 'Предложение ИИ',
    actionsLabel: 'Что сделать',
    actions: {
      improve: ['Улучшить текст', 'Яснее, живее, лучше структура — ваша мысль и голос'],
      shorter: ['Короче', 'Убрать воду, не потеряв факты и смысл'],
      funnier: ['Смешнее', 'Шутка там, где уместно; без выдуманных историй'],
      fix: ['Исправить ошибки', 'Только орфография, пунктуация и опечатки'],
      variants: ['Предложи 3 варианта', 'Разная подача той же мысли'],
      custom: ['Свой запрос', 'Опишите, что поменять']
    },
    instructionLabel: 'Пожелание',
    instructionPlaceholder: 'Например: усиль первые две строки, финал не меняй',
    scopeLabel: 'Что править',
    scope: { selection: 'Только выделение', all: 'Весь текст' },
    paid: 'Каждый запрос — платный. Расход виден в Настройки → ИИ.',
    run: 'Получить вариант',
    loading: 'ИИ думает…',
    before: 'Было',
    after: 'Стало',
    variant: (index: number) => `Вариант ${index + 1}`,
    variantsLabel: 'Варианты',
    chars: (count: number) => `${count} симв.`,
    tooLong: (limit: number) => `Длиннее ${limit} символов — Telegram не примет`,
    stale: 'Текст изменился после запроса. Запросите вариант заново, чтобы не затереть ваши правки.',
    apply: 'Применить',
    another: 'Другой вариант',
    cancel: 'Отмена',
    back: 'Изменить запрос',
    question: 'ИИ спрашивает',
    questionHint: 'Допишите факты в текст или в пожелание и запросите снова.',
    failed: 'Не получилось',
    retry: 'Повторить',
    errors: {
      NO_KEY: 'ИИ не подключён: нет ключа. Настройки → ИИ.',
      DISABLED: 'ИИ выключен. Включите в Настройки → ИИ.',
      NO_MODEL: 'Не выбрана модель. Настройки → ИИ.',
      NO_PRICE: 'У модели нет цены. Настройки → ИИ.',
      BUDGET: 'Бюджет на ИИ исчерпан. Настройки → ИИ.',
      RATE_LIMIT: 'Слишком много запросов подряд. Подождите пару минут.',
      AI_BAD_FORMAT: 'ИИ ответил не в том формате. Попробуйте ещё раз.',
      network: 'Нет связи с сервером. Попробуйте ещё раз.',
      other: 'ИИ не ответил. Попробуйте ещё раз.'
    }
  }
} as const;
