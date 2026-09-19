import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

/**
 * Тесты идут внутри workerd с настоящей D1, а не в Node с моками: проверяем то, что поедет в прод.
 * Миграции читаются на этапе конфигурации и применяются к тестовой базе перед файлом.
 */
const migrations = await readD1Migrations('./migrations');

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc', environment: 'dev' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          // Секреты фиктивные: исходящие вызовы перехватываются, наружу ничего не уходит.
          BOT_TOKEN: '1:test',
          OWNER_TELEGRAM_ID: '100',
          TELEGRAM_WEBHOOK_SECRET: '0123456789abcdef0123456789abcdef0123456789',
          BOT_INFO: JSON.stringify({
            id: 1,
            is_bot: true,
            first_name: 'Test',
            username: 'test_bot',
            can_join_groups: false,
            can_read_all_group_messages: false,
            supports_inline_queries: false,
            can_connect_to_business: false,
            has_main_web_app: false,
          }),
        },
      },
    }),
  ],
  // Алиас тот же, что в tsconfig: тесты импортируют код так же, как он импортирует сам себя.
  resolve: {
    alias: [{ find: /^src\//, replacement: `${fileURLToPath(new URL('./src', import.meta.url))}/` }],
  },
  test: { setupFiles: ['./tests/setup.ts'] },
});
