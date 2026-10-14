import { test } from '@playwright/test';
import { mockApi } from './support/mock-api';

// `npm run shots [-- --grep <page>]`: screenshots of the main pages on mock data, both themes, phone and laptop,
// into .logs/shots/. For the visual check (skill visual-check); not part of the e2e suite.
const PAGES = [
  '/',
  '/posts',
  '/posts/new',
  '/posts/11111111-1111-4111-8111-111111111111',
  '/posts/11111111-1111-4111-8111-111111111111/publish',
  '/publications',
  '/media',
  '/sources',
  '/sources?tab=heroes',
  '/settings/channels',
  '/settings/appearance',
  '/settings/general',
  '/login'
];
const WIDTHS = [
  { width: 375, height: 812 },
  { width: 1280, height: 800 }
];

for (const path of PAGES) {
  test(path, async ({ page }) => {
    await mockApi(page);
    const name =
      path === '/'
        ? 'home'
        : path
            .slice(1)
            .replaceAll('/', '-')
            .replace(/[?=&]/g, '-')
            .replace(/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/, 'id');
    for (const viewport of WIDTHS) {
      await page.setViewportSize(viewport);
      // The mock appearance follows the system scheme, so the emulated scheme picks the theme.
      for (const colorScheme of ['dark', 'light'] as const) {
        await page.emulateMedia({ colorScheme });
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        // Skeletons swap to data a moment after the mocked responses; polling keeps the network busy.
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `../../.logs/shots/${name}-${viewport.width}-${colorScheme}.png` });
        if (path === '/settings/general') {
          await page.getByRole('heading', { name: /Уведомлять/ }).scrollIntoViewIfNeeded();
          await page.waitForTimeout(200);
          await page.screenshot({ path: `../../.logs/shots/${name}-${viewport.width}-${colorScheme}-end.png` });
        }
        if (path === '/') {
          await page.getByRole('button', { name: /Меню владельца/ }).click();
          await page.waitForTimeout(300);
          await page.screenshot({ path: `../../.logs/shots/account-menu-${viewport.width}-${colorScheme}.png` });
          await page.keyboard.press('Escape');
          await page.keyboard.press('ControlOrMeta+k');
          await page.keyboard.type('пост');
          await page.waitForTimeout(800);
          await page.screenshot({ path: `../../.logs/shots/search-${viewport.width}-${colorScheme}.png` });
          await page.keyboard.press('Escape');
        }
      }
    }
  });
}
