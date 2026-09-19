import { iconColor, type SectionDefinition } from 'src/const/sections';

/**
 * ⚠️ Временное место. «Редактор» — первый раздел, с которого начинаем продуктовую разработку.
 * Когда появятся продуктовые модули, их разделы переедут к владельцам в `modules/<name>/sections.ts`.
 * Разделы рубрик будут не статикой, а строками из базы.
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
];
