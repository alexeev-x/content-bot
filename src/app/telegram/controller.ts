import type { Context, Filter } from 'grammy';
import { command, isCommandAvailable, menuCommands } from 'src/const/commands';
import type { Sections } from 'src/core/sections';
import type { TelegramApi } from 'src/core/telegram';
import type { BotCommand } from 'src/types/bot';

/** Что бот умеет прямо сейчас. Обещаний на будущее здесь нет — они в плане. */
const capabilities = [
  'Сейчас умею: завести разделы и понять, в каком из них идёт разговор.',
  'В работе: рубрики, черновики с версиями, память об авторском стиле, публикации.',
].join('\n');

/** В справке — только то, что работает здесь: команды чужих разделов лишь путают. */
const commandList = (sectionKey?: string) =>
  menuCommands
    .filter((item) => isCommandAvailable(item, sectionKey))
    .map((item) => `/${item.name} — ${item.description}`)
    .join('\n');

const message = {
  start: 'На связи. Что умею — /help, разделы — /setup.',

  helpInGeneral: (sections: { title: string; intro: string }[]) =>
    [
      'Это общая часть чата — работа идёт внутри разделов.',
      '',
      'Разделы:',
      sections.map((item) => `• ${item.title} — ${item.intro}`).join('\n'),
      '',
      'Команды:',
      commandList(),
      '',
      capabilities,
    ].join('\n'),

  helpInSection: (section: { key: string; title: string; intro: string }) =>
    [`Раздел «${section.title}».`, section.intro, '', 'Команды:', commandList(section.key), '', capabilities].join(
      '\n',
    ),

  sections: (titles: string[]) =>
    [
      titles.length > 0 ? `Разделы:\n${titles.map((title) => `• ${title}`).join('\n')}` : 'Разделов нет.',
      '',
      'Создаются сами при первом сообщении — отдельная команда для этого не нужна.',
    ].join('\n'),

  inSection: (title: string) => `Раздел «${title}» — принял. Здесь скоро появится работа с материалами.`,

  outsideSection:
    'Это общая часть чата. Разделы создаются автоматически, список — /setup. Работа идёт внутри разделов.',
} as const;

type Deps = {
  telegram: TelegramApi;
  sections: Sections;
};

/**
 * Свои команды модуля — только про самого бота. Всё предметное приходит из модулей-владельцев
 * списком BotCommand и регистрируется в bot.ts.
 */
export const createController = ({ telegram, sections }: Deps) => {
  // Тип сужен до апдейта с сообщением: у него chat есть всегда, и `?? 0`, который молча отправил
  // бы в несуществующий чат, больше не нужен.
  const reply = (ctx: Filter<Context, 'message:text'>, text: string) =>
    telegram.sendMessage({ chatId: ctx.chat.id, text, threadId: ctx.message.message_thread_id });

  const own: BotCommand[] = [
    {
      name: command.start,
      handle: ({ chatId, threadId }) => telegram.sendMessage({ chatId, threadId, text: message.start }),
    },
    {
      name: command.help,
      // Раздел уже найден входом и пришёл в CommandInput — второй запрос в базу не нужен.
      handle: async ({ chatId, threadId, section }) => {
        await telegram.sendMessage({
          chatId,
          threadId,
          text: section
            ? message.helpInSection({ ...section, intro: await sections.intro(section.key) })
            : message.helpInGeneral(await sections.list()),
        });
      },
    },
    {
      // Раздел — устройство самого бота, а не продуктовая фича: команда живёт во входе.
      // Создание уже отработало в middleware, здесь остаётся показать состояние.
      name: command.setup,
      handle: async ({ chatId, threadId }) => {
        const titles = (await sections.list()).map((item) => item.title);
        await telegram.sendMessage({ chatId, threadId, text: message.sections(titles) });
      },
    },
  ];

  /** Обычный текст: пока только подсказываем, где находимся. Дальше здесь будет работа с материалами. */
  const onText = async (ctx: Filter<Context, 'message:text'>) => {
    const section = await sections.findByThreadId(ctx.message.message_thread_id);
    await reply(ctx, section ? message.inSection(section.title) : message.outsideSection);
  };

  return { own, onText };
};
