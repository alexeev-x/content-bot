import { test } from '@playwright/test';
import { mockApi } from './support/mock-api';

// `npm run shots [-- --grep <page>]`: screenshots of the main pages on mock data, both themes, phone and laptop,
// into .logs/shots/. For the visual check (skill visual-check); not part of the e2e suite.
const PAGES = ['/', '/posts', '/publications', '/analytics', '/media', '/incidents', '/settings/channels'];
const WIDTHS = [
  { width: 375, height: 812 },
  { width: 1280, height: 800 }
];

for (const path of PAGES) {
  test(path, async ({ page }) => {
    await mockApi(page);
    const name = path === '/' ? 'home' : path.slice(1).replaceAll('/', '-');
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
      }
    }
  });
}
