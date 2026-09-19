import { Hono } from 'hono';
import { errorHandler } from 'src/app/middleware/error';
import { requestLogger } from 'src/app/middleware/logger';
import { createTelegramRouter } from 'src/app/telegram';
import { createSections, defaultSections } from 'src/core/sections';
import { createTelegramApi } from 'src/core/telegram';
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
    // Разделы объявляют фичи-владельцы; пока фич нет — набор по умолчанию.
    const sections = createSections({ d1: env.DB, telegram, catalog: [...defaultSections] });

    return {
      telegram,
      sections,
      // Команды продуктовых фич приходят сюда же: [...createRubricCommands({ ... })]
      commands: [],
    };
  }),
);

export default app;
