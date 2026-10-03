import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Worker tests run inside workerd with the real wrangler config and real D1 migrations.
// Storage is isolated per test file; tests apply TEST_MIGRATIONS in their setup.
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      }),
    ],
    test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] },
  };
});
