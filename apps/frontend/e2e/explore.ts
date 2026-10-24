import { test } from '@playwright/test';
import { mockApi } from './support/mock-api';

// Opened by `npm run explore` (playwright.explore.config.ts). The browser stays open until the owner closes it.
test('explore the admin with mock data', async ({ page }) => {
  await mockApi(page);
  await page.goto('/posts');
  await page.waitForEvent('close', { timeout: 0 });
});
