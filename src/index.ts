import { Hono } from 'hono';
import { errorHandler } from 'src/app/middleware/error';
import { requestLogger } from 'src/app/middleware/logger';
import type { AppEnv } from 'src/types/env';

/**
 * Composition root: единственное место, где вход и фичи знают друг о друге.
 * Роутов пока нет — любой путь отвечает 404. Первый вход появится здесь же.
 */
const app = new Hono<AppEnv>();

app.use('*', requestLogger);
app.onError(errorHandler);

export default app;
