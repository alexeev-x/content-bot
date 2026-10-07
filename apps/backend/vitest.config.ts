import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  // The real migrations, applied to an empty local D1 before each test file (tests/setup).
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } }
      })
    ],
    test: {
      include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
      // Each worker is a separate workerd process; the default (one per core) overloads a 16 GB laptop.
      maxWorkers: process.env.CI ? undefined : 3,
      setupFiles: ['./tests/setup/apply-migrations.ts']
    }
  };
});
