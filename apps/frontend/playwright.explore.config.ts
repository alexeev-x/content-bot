import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Manual look at the admin without Telegram sign-in: `npm run explore` opens Chrome on the local dev server with the
// e2e mock API, so the session and data are fake and nothing reaches the Worker. Kept out of the e2e suite because it
// waits until the window is closed.
export default defineConfig({
  ...base,
  testMatch: 'explore.ts',
  timeout: 0,
  use: { ...base.use, headless: false, viewport: null }
});
