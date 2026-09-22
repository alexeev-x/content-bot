import { fileURLToPath } from 'node:url';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

/** Тесты идут внутри workerd, а не в Node с моками: проверяем то, что поедет в прод. */
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc', environment: 'dev' } })],
  // Алиас тот же, что в tsconfig: тесты импортируют код так же, как он импортирует сам себя.
  resolve: {
    alias: [{ find: /^src\//, replacement: `${fileURLToPath(new URL('./src', import.meta.url))}/` }],
  },
  test: { include: ['tests/**/*.test.ts'], setupFiles: ['./tests/setup.ts'] },
});
