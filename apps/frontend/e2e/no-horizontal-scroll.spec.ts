import { expect, test } from '@playwright/test';
import { ids, mockApi } from './support/mock-api';
import { installFakeTelegram } from './support/telegram';

// WCAG 1.4.10 guard (docs/stories/mobile-layout.md, M1): no route scrolls sideways at phone widths,
// with long titles and channel names in the fixtures, in a browser and inside the Mini App.
const ROUTES = [
  '/',
  '/posts',
  '/posts/new',
  `/posts/${ids.post}`,
  '/publications',
  '/calendar',
  '/automations',
  '/media',
  '/incidents',
  '/settings',
  '/settings/channels',
  '/settings/appearance'
];
const WIDTHS = [320, 375, 390];

for (const miniApp of [false, true]) {
  for (const width of WIDTHS) {
    test.describe(`${miniApp ? 'mini app' : 'browser'} ${width}px`, () => {
      test.use({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });

      for (const route of ROUTES) {
        test(`${route} has no horizontal scroll`, async ({ page }) => {
          await mockApi(page);
          if (miniApp) await installFakeTelegram(page);
          await page.goto(route);
          await expect(page.locator('main h1').first()).toBeVisible();
          await page.waitForLoadState('networkidle');
          const { scrollWidth, clientWidth } = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth
          }));
          expect(scrollWidth).toBe(clientWidth);
        });
      }

      test('publication drawer has no horizontal scroll and fits the viewport', async ({ page }) => {
        await mockApi(page);
        if (miniApp) await installFakeTelegram(page);
        await page.goto('/publications');
        await page
          .getByRole('button', { name: /Очень длинный/ })
          .first()
          .click();
        const drawer = page.getByRole('dialog');
        await expect(drawer).toBeVisible();
        // The panel slides in: wait until it rests inside the viewport.
        await expect
          .poll(async () => {
            const box = await drawer.boundingBox();
            return box ? { left: box.x >= 0, right: box.x + box.width <= width } : null;
          })
          .toEqual({ left: true, right: true });
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth
        }));
        expect(scrollWidth).toBe(clientWidth);
      });
    });
  }
}

// Density revision: working tables are fluid at desktop width. A long title or channel name is clipped with an
// ellipsis inside its cell; neither the page nor the table's own scroller may scroll sideways, and the time
// column stays visible.
test.describe('desktop 1280px', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const route of ['/publications', '/posts']) {
    test(`${route} fits the viewport with long fixtures`, async ({ page }) => {
      await mockApi(page);
      await page.goto(route);
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(page.getByRole('grid').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => {
        const scrollers = [...document.querySelectorAll<HTMLElement>('main *')].filter((element) => {
          const { overflowX } = getComputedStyle(element);
          return (overflowX === 'auto' || overflowX === 'scroll') && element.scrollWidth > element.clientWidth;
        });
        return {
          page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          scrollers: scrollers.map((element) => element.className)
        };
      });
      expect(overflow).toEqual({ page: 0, scrollers: [] });
      if (route === '/publications') {
        const time = page.getByRole('columnheader', { name: 'Время' });
        await expect(time).toBeVisible();
        const box = await time.boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(1280);
      }
    });
  }
});
