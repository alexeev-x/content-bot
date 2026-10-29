import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  // The real migrations, applied to an empty local D1 before each test file (tests/setup).
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  const statsMigrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations-stats'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        // Tests never reach Cloudflare: the remote browser binding of local runs would need an API token CI lacks
        // (PR #30's CI failed on it, 29.10.2026).
        remoteBindings: false,
        miniflare: { bindings: { TEST_MIGRATIONS: migrations, TEST_STATS_MIGRATIONS: statsMigrations } }
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
