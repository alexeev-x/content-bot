import { defineConfig } from '@playwright/test';

// Local visual suite (skill visual-check): not part of CI, which has no browser step. Run `npm run test:e2e`.
// `channel: 'chrome'` reuses the installed Chrome, so no browser download is needed.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Each worker is a full Chrome; more than two plus the dev server overloads a 16 GB laptop.
  workers: 2,
  reporter: 'list',
  outputDir: '../../.logs/e2e-results',
  use: { baseURL: 'http://localhost:5199', channel: 'chrome' },
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 120_000
  }
});
