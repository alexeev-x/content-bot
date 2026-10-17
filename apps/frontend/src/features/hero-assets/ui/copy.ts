import type { HeroAssetKind } from '@alexeev/contracts';

export const copy = {
  intro:
    'Официальные анимации и картинки героев с сайта Dota 2, сохранённые в наше хранилище. Из них будут собираться ИИ-посты и карточки.',
  progress: (stored: number, total: number) => `Загружено ${stored} из ${total} файлов`,
  missing: (count: number) => `У Valve нет: ${count}`,
  failed: (count: number, codes: string) => `С ошибкой: ${count} (${codes}), повторим сами`,
  running: 'Загрузка идёт сама, несколько файлов в минуту.',
  done: 'Все файлы загружены.',
  emptyTitle: 'Список героев ещё не загружен',
  emptyText: 'Нажмите «Проверить у Valve»: сервер возьмёт список с сайта Dota 2 и сам скачает файлы.',
  check: 'Проверить у Valve',
  checkHint:
    'Нажмите, когда выйдет новый герой или файлы застряли с ошибкой: новые добавятся, а не скачанные пойдут заново.',
  checked: 'Список обновлён, не скачанные файлы снова в очереди',
  checkFailed: 'Сайт Dota 2 не ответил. Попробуйте позже.',
  loadError: 'Не удалось загрузить список героев.',
  gridLabel: 'Герои',
  open: (name: string) => `Открыть файлы героя ${name}`,
  download: 'Скачать',
  notStored: 'Ещё не загружено',
  asideMissing: 'нет у Valve',
  asideFailed: 'ошибка',
  asidePending: 'загружается',
  failedWith: (code: string) => `Не загрузилось (${code}), повторим сами`,
  notAtValve: 'У Valve нет такого файла',
  fileError: 'Не удалось открыть файл',
  transparentHint: 'Шахматный фон показывает прозрачность: у анимации и картинки фона нет.',
  kind: {
    render_webm: 'Анимация без фона (WebM: Chrome, Android, Telegram)',
    render_mov: 'Анимация без фона (MOV: iPhone, Safari, монтаж)',
    render_png: 'Картинка без фона',
    portrait: 'Портрет',
    icon: 'Иконка',
    crop: 'Крупный план'
  } satisfies Record<HeroAssetKind, string>
};
