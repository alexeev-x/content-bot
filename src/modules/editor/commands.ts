import { command } from 'src/const/commands';
import type { TelegramApi } from 'src/core/telegram';
import type { BotCommand } from 'src/types/bot';
import type { EditorService } from './service';

type Deps = { telegram: TelegramApi; editor: EditorService };

export const createEditorCommands = ({ telegram, editor }: Deps): BotCommand[] => [
  {
    name: command.rubrics,
    handle: async ({ chatId, threadId }) => {
      const rubrics = await editor.rubrics();
      await telegram.sendMessage({
        chatId,
        threadId,
        text: ['Рубрики:', ...rubrics.map((item) => `• ${item.title}\n  ${item.instructions}`)].join('\n'),
      });
    },
  },
  {
    name: command.memory,
    handle: async ({ chatId, threadId }) => {
      const memory = await editor.memory();
      await telegram.sendMessage({
        chatId,
        threadId,
        text: memory.length
          ? ['Память о стиле:', ...memory.map((item) => `• ${item.value}`)].join('\n')
          : 'Пока нет сохранённых правил.',
      });
    },
  },
];
