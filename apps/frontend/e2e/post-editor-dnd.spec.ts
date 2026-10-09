import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Post editor prototype: media order changes by drag-and-drop only (no «Выше» / «Ниже»). Local suite.
const URL = '/__proto/posts/new';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

const ready = (page: Page) => expect(page.locator('[data-reorder-item]').nth(3)).toBeVisible();
const order = (page: Page) =>
  page.locator('[data-reorder-item]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-item-id')));
const previewOrder = (page: Page) =>
  page.locator('figure img').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('src')));

test('desktop: mouse drag of tile 1 to position 3 reorders tiles and preview', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL);
  await ready(page);
  const before = await order(page);
  expect(before.length).toBeGreaterThan(3);
  await expect(page.getByText('Выше', { exact: true })).toHaveCount(0);
  const previewBefore = await previewOrder(page);
  const tiles = page.locator('[data-reorder-item]');
  const a = (await tiles.nth(0).boundingBox())!;
  const c = (await tiles.nth(2).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2, { steps: 4 });
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 10 });
  await expect(page.locator('[data-dragging]')).toHaveCount(1);
  await expect(page.locator('[data-drop]')).toHaveCount(1);
  await page.mouse.up();
  const after = await order(page);
  expect(after).toEqual([before[1], before[2], before[0], ...before.slice(3)]);
  const previewAfter = await previewOrder(page);
  expect(previewAfter).not.toEqual(previewBefore);
});

test('phone: touch hold-and-drag of tile 1 to position 3 reorders tiles and preview', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto(URL);
  await ready(page);
  const before = await order(page);
  const previewBefore = await previewOrder(page);
  const tiles = page.locator('[data-reorder-item]');
  const a = (await tiles.nth(0).boundingBox())!;
  const c = (await tiles.nth(2).boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  await touch('touchStart', ax, ay);
  await page.waitForTimeout(450);
  for (let i = 1; i <= 10; i++) {
    await touch('touchMove', ax + ((c.x + c.width / 2 - ax) * i) / 10, ay + ((c.y + c.height / 2 - ay) * i) / 10);
    await page.waitForTimeout(16);
  }
  await expect(page.locator('[data-dragging]')).toHaveCount(1);
  await touch('touchEnd', 0, 0);
  const after = await order(page);
  expect(after).toEqual([before[1], before[2], before[0], ...before.slice(3)]);
  const firstSrc = await tiles.first().locator('img').getAttribute('src');
  expect(firstSrc).not.toBe(previewBefore[0]);
  await page.locator('header').getByRole('button', { name: 'Ещё' }).click();
  await page.getByRole('menuitem', { name: 'Предпросмотр' }).click();
  await expect(page.locator('figure img').first()).toHaveAttribute('src', firstSrc!);
  await context.close();
});

for (const [state, width] of [
  ['default', 375],
  ['default', 1440],
  ['reorder', 375]
] as const) {
  test(`axe ${state} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/__proto/posts/new${state === 'default' ? '' : `?state=${state}`}`);
    await page.waitForTimeout(500);
    const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}

test('axe reorder 1440 and keyboard Alt+Arrow reorder', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/__proto/posts/new?state=reorder');
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(result.violations.map((v) => v.id)).toEqual([]);
  await page.goto(URL);
  await ready(page);
  const before = await order(page);
  await page.locator('[data-reorder-item] button').first().focus();
  await page.keyboard.press('Alt+ArrowRight');
  expect((await order(page)).slice(0, 2)).toEqual([before[1], before[0]]);
});
