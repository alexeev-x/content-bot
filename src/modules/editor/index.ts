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
    let text: string;
    try {
      const result = await editor.generate(input);
      text =
        'notConfigured' in result
          ? 'Я пока не подключён к ИИ и не могу разобрать твою мысль. Добавь OPENAI_API_KEY в .dev.vars и перезапусти pnpm dev — тогда сможем общаться свободно.'
          : result.text + (result.budgetWarning ? '\n\n⚠️ Учтённые расходы ИИ достигли $12 из $15 за месяц.' : '');
    } catch (error) {
      text =
        isAppError(error) && error.code === 'outcome_unknown'
          ? 'Не удалось получить надёжный ответ. Автоматически повторять платный запрос не буду. Твоё сообщение осталось в журнале — попробуй позже новым сообщением.'
          : isAppError(error) && error.code === 'operation_busy'
            ? 'Я ещё работаю над предыдущим сообщением. Дождись ответа и повтори эту мысль, чтобы мы не перепутали правки.'
            : isAppError(error) && error.code === 'budget_exhausted'
              ? 'На этот запрос не хватает оставшегося месячного бюджета ИИ. Платный вызов не запускал.'
              : 'Сейчас не получилось ответить. Попробуй чуть позже — бот продолжает работать.';
    }
    // Длинная статья отправляется частями; транспорт сохраняет отдельный ключ для каждой отправки.
    const chars = Array.from(text);
    for (let offset = 0; offset < chars.length; offset += 1700) {
      await telegram.sendMessage({
        chatId: input.chatId,
        threadId: input.threadId,
        text: chars.slice(offset, offset + 1700).join(''),
      });
    }
    return true;
  };
  return { sections: editorSections, commands: [], textHandler };
};
