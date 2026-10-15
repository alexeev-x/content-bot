import type { HeroAssetKind } from '@alexeev/contracts';

export const copy = {
  intro:
    'Официальные анимации и картинки героев с сайта Dota 2, сохранённые в наше хранилище. Из них будут собираться ИИ-посты и карточки.',
  progress: (stored: number, total: number) => `Загружено ${stored} из ${total} файлов`,
  missing: (count: number) => `У Valve нет: ${count}`,
  failed: (count: number) => `С ошибкой: ${count} (повторим сами)`,
  running: 'Загрузка идёт сама, несколько файлов в минуту.',
  done: 'Все файлы загружены.',
  emptyTitle: 'Список героев ещё не загружен',
  emptyText: 'Он появится в течение пары минут: сервер сам возьмёт его с сайта Dota 2.',
  loadError: 'Не удалось загрузить список героев.',
  gridLabel: 'Герои',
  open: (name: string) => `Открыть файлы героя ${name}`,
  download: 'Скачать',
  notStored: 'Ещё не загружено',
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
