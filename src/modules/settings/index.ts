import { command } from 'src/const/commands';
import type { InlineKeyboard, TelegramApi } from 'src/core/telegram';
import type { BotCallbackHandler, BotCommand } from 'src/types/bot';
import { createSettingsService, efforts, models } from './service';

const modelLabels: Record<(typeof models)[number], string> = {
  'gpt-5.6-luna': 'Luna — экономно',
  'gpt-5.6-terra': 'Terra — баланс',
  'gpt-5.6-sol': 'Sol — качество',
  'gpt-6-astra': 'Astra — максимум',
};

const modelKeyboard: InlineKeyboard = {
  inline_keyboard: models.map((model) => [{ text: modelLabels[model], callback_data: `settings:model:${model}` }]),
};

const settingsKeyboard: InlineKeyboard = {
  inline_keyboard: [[{ text: '🤖 AI model', callback_data: 'settings:ai' }]],
};

const back = (data: string) => [{ text: '← Назад', callback_data: data }];

const effortKeyboard = (model: (typeof models)[number]): InlineKeyboard => ({
  inline_keyboard: efforts
    .filter((effort) => model !== 'gpt-6-astra' || effort !== 'none')
    .map((effort) => [{ text: effort, callback_data: `settings:effort:${effort}` }]),
});

export const createSettings = ({ d1, telegram }: { d1: D1Database; telegram: TelegramApi }) => {
  const settings = createSettingsService({ d1 });
  const commandHandler: BotCommand = {
    name: command.settings,
    handle: async ({ chatId, threadId }) => {
      await telegram.sendMessage({
        chatId,
        threadId,
        text: 'Настройки\n\nЧто хочешь изменить?',
        replyMarkup: settingsKeyboard,
      });
    },
  };
  const callbackHandler: BotCallbackHandler = async ({ chatId, messageId, data }) => {
    if (!data.startsWith('settings:')) return false;
    const [, action, model, effort] = data.split(':');
    if (!action) return true;
    const edit = (text: string, replyMarkup: InlineKeyboard) =>
      telegram.editMessage({ chatId, messageId, text, replyMarkup });
    if (action === 'home') {
      await edit('Настройки\n\nЧто хочешь изменить?', settingsKeyboard);
      return true;
    }
    if (action === 'ai') {
      const current = await settings.ai();
      await edit(
        `AI model\n\nСейчас: ${modelLabels[current.model]} · reasoning ${current.effort}\n\nВыбери новую модель:`,
        {
          inline_keyboard: [...modelKeyboard.inline_keyboard, back('settings:home')],
        },
      );
      return true;
    }
    if (action === 'model') {
      if (!model) return true;
      const selected = settings.model(model);
      await edit(`Выбрана ${modelLabels[selected]}.\n\nТеперь выбери уровень reasoning:`, {
        inline_keyboard: [
          ...effortKeyboard(selected).inline_keyboard.map((row) =>
            row.map((item) => ({ ...item, callback_data: `${item.callback_data}:${selected}` })),
          ),
          back('settings:ai'),
        ],
      });
      return true;
    }
    if (action === 'effort') {
      if (!model || !effort) return true;
      const selectedModel = settings.model(effort);
      const selectedEffort = settings.effort(selectedModel, model);
      await edit(`Подтверди изменение:\n\n${modelLabels[selectedModel]} · reasoning ${selectedEffort}`, {
        inline_keyboard: [
          [{ text: '✅ Сохранить', callback_data: `settings:confirm:${selectedModel}:${selectedEffort}` }],
          [{ text: 'Отмена', callback_data: 'settings:home' }],
          back(`settings:model:${selectedModel}`),
        ],
      });
      return true;
    }
    if (action === 'confirm') {
      if (!model || !effort) return true;
      const selectedModel = settings.model(model);
      const selectedEffort = settings.effort(selectedModel, effort);
      await settings.save(selectedModel, selectedEffort);
      await edit(
        `Сохранено для всего бота:\n\n${modelLabels[selectedModel]} · reasoning ${selectedEffort}`,
        settingsKeyboard,
      );
    }
    return true;
  };
  return { ai: settings.ai, commands: [commandHandler], callbackHandlers: [callbackHandler] };
};
