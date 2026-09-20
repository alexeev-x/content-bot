/**
 * Контракт раздела. Сам список разделов здесь НЕ живёт: каждая фича объявляет свои,
 * как и свои команды. Здесь только то, что нужно обеим сторонам — входу и фичам.
 */

/** Bot API принимает только эти шесть цветов иконки темы. */
export const iconColor = {
  blue: 7322096,
  yellow: 16766590,
  purple: 13338331,
  green: 9367192,
  pink: 16749490,
  red: 16478047,
} as const;

export type IconColor = (typeof iconColor)[keyof typeof iconColor];

/**
 * Ключ раздела — строка, а не закрытое объединение: разделы рубрик появляются на ходу,
 * их набор заранее не известен.
 */
export type SectionKey = string;

export type SectionDefinition = {
  key: SectionKey;
  title: string;
  color: IconColor;
  /** Первое сообщение в теме: чтобы раздел не был пустым и было видно, зачем он. */
  intro: string;
  /** Полная справка владельца раздела: команды и фразы обычным языком. */
  help: string;
};
