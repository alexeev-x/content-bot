import { iconColor, type SectionDefinition } from 'src/const/sections';

/**
 * ⚠️ Временное место. Раздел принадлежит фиче: «Редактор» уедет в `modules/editor`,
 * публикации — в `modules/publishing`, память — в `modules/memory`, как только эти папки
 * появятся. Разделы рубрик будут не статикой, а строками из базы.
 *
 * Пока фич нет, набор лежит здесь и передаётся в composition root явно — механизм уже готов,
 * переезд сведётся к переносу строк.
 */
export const defaultSections: readonly SectionDefinition[] = [
  {
    key: 'editor',
    title: 'Редактор',
    color: iconColor.blue,
    intro: 'Идеи, контент-план и общие вопросы. Отсюда расходятся задачи по рубрикам.',
  },
  {
    key: 'telegram-posts',
    title: 'Публикации: Telegram',
    color: iconColor.green,
    intro: 'Готовые посты в канал: предпросмотр, расписание, статусы.',
  },
  {
    key: 'video',
    title: 'Публикации: видео',
    color: iconColor.purple,
    intro: 'Ролики для YouTube и TikTok: загрузка, оформление под площадку, статусы.',
  },
  {
    key: 'memory',
    title: 'Память и настройки',
    color: iconColor.yellow,
    intro: 'Авторский стиль, одобренные примеры, правила и предпочтения.',
  },
];
