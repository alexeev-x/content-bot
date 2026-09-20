import type { TelegramApi } from 'src/core/telegram';
import { isAppError } from 'src/lib/errors';
import type { BotTextHandler } from 'src/types/bot';
import { editorSections } from './sections';
import { createEditorService } from './service';
import type { TextGenerator } from './types';

type Deps = { d1: D1Database; telegram: TelegramApi; generator: TextGenerator };

export const createEditor = ({ d1, telegram, generator }: Deps) => {
  const editor = createEditorService({ d1, generator });
  const textHandler: BotTextHandler = async (input) => {
    if (input.section?.key !== 'editor') return false;

    const normalized = input.text.trim();
    if (/^запомни\s+/i.test(normalized)) {
      await editor.remember({
        chatId: input.chatId,
        messageId: input.messageId,
        value: normalized.replace(/^запомни\s+/i, ''),
      });
      await telegram.sendMessage({
        chatId: input.chatId,
        threadId: input.threadId,
        text: 'Запомнил это как постоянное правило стиля.',
      });
      return true;
    }
    if (/^(?:что\s+ты\s+запомнил|покажи\s+память)$/i.test(normalized)) {
      const memory = await editor.memory();
      await telegram.sendMessage({
        chatId: input.chatId,
        threadId: input.threadId,
        text: memory.length
          ? ['Память о стиле:', ...memory.map((item) => `• ${item.value}`)].join('\n')
          : 'Пока нет сохранённых правил.',
      });
      return true;
    }
    if (/^(?:рубрики|какиеs+уs+меняs+рубрики)$/i.test(normalized)) {
      const rubrics = await editor.rubrics();
      await telegram.sendMessage({
        chatId: input.chatId,
        threadId: input.threadId,
        text: rubrics.map((item) => `• ${item.title}`).join('\n'),
      });
      return true;
    }

    if (editor.isGenerationRequest(normalized)) {
      let result;
      try {
        result = await editor.generate(input);
      } catch (error) {
        const text =
          isAppError(error) && error.code === 'outcome_unknown'
            ? 'Не удалось понять, успел ли ИИ выполнить запрос. Ничего не повторяю автоматически, чтобы не получить двойной расход.'
            : isAppError(error) && error.code === 'operation_busy'
              ? 'Этот запрос ещё обрабатывается. Подожди немного и отправь новый, если ответа не будет.'
              : 'Не получилось получить ответ от ИИ. Твой запрос сохранён; попробуй отправить его новым сообщением позже.';
        await telegram.sendMessage({ chatId: input.chatId, threadId: input.threadId, text });
        return true;
      }
      await telegram.sendMessage({
        chatId: input.chatId,
        threadId: input.threadId,
        text:
          'notConfigured' in result
            ? 'Генерация пока выключена: добавь OPENAI_API_KEY в .dev.vars и перезапусти pnpm dev.'
            : 'rubricRequired' in result
              ? 'Для этой задачи укажи рубрику: «Учу фидить в Доту» или «Учусь играть в Доту». Напишу после этого.'
              : [
                  result.text,
                  result.reused ? '\n\nПоказываю сохранённый результат этого запроса.' : '',
                  result.budgetWarning ? '\n\n⚠️ Расход ИИ за текущий месяц достиг $12 из $15.' : '',
                ].join(''),
      });
      return true;
    }

    const material = await editor.saveText(input);
    const label = material.kind === 'author_example' ? 'авторский пример' : 'черновик';
    await telegram.sendMessage({
      chatId: input.chatId,
      threadId: input.threadId,
      text: [
        `Сохранил как ${label}.`,
        material.rubric ? `Рубрика: ${material.rubric.title}.` : 'Рубрика пока не выбрана.',
        'Напиши «запомни …», чтобы добавить постоянное правило, или /rubrics, чтобы посмотреть рубрики.',
      ].join('\n'),
    });
    return true;
  };

  return { sections: editorSections, commands: [], textHandler };
};
