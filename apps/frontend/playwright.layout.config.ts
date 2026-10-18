import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// `npm run layout:check`: skeleton-to-data jumps on a production build (the dev server loads fonts late, which
// moves text by itself). Its own port, so it never reuses a running dev server.
export default defineConfig({
  ...base,
  testMatch: 'layout-stability.ts',
  workers: 1,
  use: { ...base.use, baseURL: 'http://localhost:5198' },
  webServer: {
    command: 'npx vite build && npx vite preview --port 5198 --strictPort',
    url: 'http://localhost:5198',
    reuseExistingServer: false,
    timeout: 180_000
  }
});
