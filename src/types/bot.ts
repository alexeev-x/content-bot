/**
 * Контракт команды бота. Лежит на уровне 0, чтобы модуль-владелец мог объявить свои команды,
 * не импортируя app, а вход — зарегистрировать их, не зная про модули.
 * Связывание — в src/index.ts.
 */
export type SectionRef = {
  key: string;
  title: string;
};

export type CommandInput = {
  chatId: number;
  /** Тема, в которой вызвали команду. Без неё это общая часть чата. */
  threadId?: number;
  /** Раздел, определённый по теме. Вход резолвит его один раз и отдаёт готовым. */
  section?: SectionRef;
  text: string;
};

export type BotCommand = {
  name: string;
  handle: (input: CommandInput) => Promise<void>;
};

/** Обычное текстовое сообщение, очищенное от деталей grammY для продуктовых модулей. */
export type TextMessageInput = {
  chatId: number;
  messageId: number;
  threadId: number;
  section?: SectionRef;
  text: string;
};

/** Возвращает true, когда модуль принял сообщение и сформировал ответ. */
export type BotTextHandler = (input: TextMessageInput) => Promise<boolean>;
