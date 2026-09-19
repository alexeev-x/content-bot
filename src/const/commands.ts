/**
 * Команды бота в одном месте: отсюда собирается меню в Telegram, справка и проверка доступности.
 *
 * ⚠️ Меню в интерфейсе Telegram одно на чат: у setMyCommands есть scope на чат, участника и
 * админов, но **не на тему**. Поэтому разграничение по разделам — наша логика: команда из чужого
 * раздела видна в меню, но вход её не выполнит и подскажет, где она работает.
 */
export const command = {
  start: 'start',
  help: 'help',
  setup: 'setup',
} as const;

export type CommandSpec = {
  name: string;
  description: string;
  /** Разделы, в которых команда доступна. Не указано — работает везде. */
  sections?: readonly string[];
};

/**
 * `/start` сюда не входит: Telegram присылает его сам при первом открытии чата,
 * а в списке команд личного бота он только занимает место.
 */
export const menuCommands: readonly CommandSpec[] = [
  { name: command.help, description: 'Что бот умеет и где мы сейчас' },
  { name: command.setup, description: 'Показать разделы бота' },
];

export const findCommandSpec = (name: string): CommandSpec | undefined =>
  menuCommands.find((item) => item.name === name);

/** Доступна ли команда в текущем месте: без ограничения — везде, иначе только в своих разделах. */
export const isCommandAvailable = (spec: CommandSpec | undefined, sectionKey?: string) =>
  !spec?.sections || (sectionKey !== undefined && spec.sections.includes(sectionKey));
