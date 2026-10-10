import { expect, test } from '@playwright/test';
import { ids, mockApi } from './support/mock-api';
import { installFakeTelegram } from './support/telegram';

// WCAG 1.4.10 guard (docs/design/UX_SPEC.md Conventions): no route scrolls sideways at phone widths,
// with long titles and channel names in the fixtures, in a browser and inside the Mini App.
const ROUTES = [
  '/',
  '/posts',
  '/posts?view=archive',
  '/posts/new',
  '/posts/11111111-1111-4111-8111-0000000000a1',
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
          const heading = page.locator('main h1').first();
          if (miniApp) await expect(heading).toBeAttached();
          else await expect(heading).toBeVisible();
          await page.waitForLoadState('networkidle');
          const { scrollWidth, clientWidth, viewport, overflow } = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            viewport: { innerWidth, visualWidth: visualViewport?.width },
            overflow: [...document.body.querySelectorAll<HTMLElement>('*')]
              .map((element) => ({
                element,
                rect: element.getBoundingClientRect(),
                style: getComputedStyle(element)
              }))
              .filter(
                ({ element, rect, style }) =>
                  element.scrollWidth > element.clientWidth + 1 ||
                  rect.left < -1 ||
                  rect.right > innerWidth + 1 ||
                  (style.position === 'fixed' && rect.right > innerWidth + 1)
              )
              .slice(0, 20)
              .map(({ element, rect, style }) => ({
                tag: element.tagName,
                className: typeof element.className === 'string' ? element.className : '',
                text: element.textContent?.trim().slice(0, 60),
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width),
                position: style.position,
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth
              }))
          }));
          expect(scrollWidth, JSON.stringify({ clientWidth, viewport, overflow })).toBe(clientWidth);
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
            return box ? box.x : null;
          })
          .toBeGreaterThanOrEqual(0);
        await expect
          .poll(async () => {
            const box = await drawer.boundingBox();
            return box ? box.x + box.width : null;
          })
          .toBeLessThanOrEqual(width);
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth
        }));
        expect(scrollWidth).toBe(clientWidth);
      });
    });
  }
}

// Mobile audit 07.10.2026: controls that clipped or wrapped badly at 320px.
test.describe('mobile 320px control fit', () => {
  test.use({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });

  test('editor counters stay on one line and the back link is a 44px target', async ({ page }) => {
    await mockApi(page);
    await page.goto('/posts/new');
    const counter = page.locator('main .mono', { hasText: '/ 4096' }).first();
    await expect(counter).toBeVisible();
    // The span stretches to its sibling's height, so count the rendered line boxes of its text instead.
    const lines = await counter.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    });
    expect(lines).toBe(1);
    const back = page.getByRole('button', { name: 'Все посты' });
    expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test('pipeline labels in the publication drawer are never split inside a word', async ({ page }) => {
    await mockApi(page);
    await page.goto('/publications');
    await page
      .getByRole('button', { name: /Пост недоступен|Очень длинный/ })
      .first()
      .click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    const labels = drawer.getByRole('list', { name: 'Этапы публикации' }).getByRole('listitem');
    await expect(labels.first()).toBeVisible();
    // One line at font-size xs is ~15px; a label split mid-word takes two.
    const heights = await labels.evaluateAll((items) =>
      items.map((item) => (item.children[1] as HTMLElement).getBoundingClientRect().height)
    );
    expect(Math.max(...heights)).toBeLessThan(20);
  });
});

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
