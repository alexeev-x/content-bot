import { Hono } from 'hono';
import { errorHandler } from 'src/app/middleware/error';
import { requestLogger } from 'src/app/middleware/logger';
import { createTelegramRouter } from 'src/app/telegram';
import { createOpenAiTextGenerator } from 'src/core/ai';
import { createSections } from 'src/core/sections';
import { createTelegramApi } from 'src/core/telegram';
import { createEditor } from 'src/modules/editor';
import { createSettings } from 'src/modules/settings';
import type { AppEnv } from 'src/types/env';

/**
 * Composition root: единственное место, где вход и фичи знают друг о друге.
 * Зависимости передаются явно — импортов «вбок» между app и modules нет.
 */
const app = new Hono<AppEnv>();

app.use('*', requestLogger);
app.onError(errorHandler);

// Единственное место, где вход и фичи знают друг о друге: фичи отдают сюда команды и разделы.
app.route(
  '/telegram',
  createTelegramRouter((env, updateId, signal) => {
    const telegram = createTelegramApi(env.BOT_TOKEN, { d1: env.DB, scope: `update:${updateId}`, signal });
    // Разделы и команды объявляет их продуктовый владелец; здесь только связываем зависимости.
    const settings = createSettings({ d1: env.DB, telegram });
    const generator = createOpenAiTextGenerator({ apiKey: env.OPENAI_API_KEY, signal, settings: settings.ai });
    const editor = createEditor({ d1: env.DB, telegram, generator });
    const sections = createSections({ d1: env.DB, telegram, catalog: [...editor.sections] });

    return {
      telegram,
      sections,
      commands: [...settings.commands, ...editor.commands],
      textHandlers: [editor.textHandler],
      callbackHandlers: settings.callbackHandlers,
    };
  }),
);

export default app;
