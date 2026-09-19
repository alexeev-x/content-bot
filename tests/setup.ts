import { applyD1Migrations, env } from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';
import { beforeAll, beforeEach } from 'vitest';
import { installTelegramMock } from './telegram-mock';

declare global {
  // Расширение внешнего namespace Cloudflare — обязательная форма объявления биндингов.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  // Текущая версия плагина изолирует файлы, но не очищает D1 между тестами файла.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM telegram_operations'),
    env.DB.prepare('DELETE FROM telegram_updates'),
    env.DB.prepare('DELETE FROM sections'),
  ]);
  installTelegramMock();
});
