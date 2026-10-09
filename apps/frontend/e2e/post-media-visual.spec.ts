import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ids, mockApi, post } from './support/mock-api';

const SHOTS_DIR = process.env['SHOTS_DIR'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const media = {
  id: '44444444-4444-4444-8444-444444444444',
  sourceMediaId: null,
  kind: 'photo',
  fileName: 'arena.png',
  contentType: 'image/png',
  sizeBytes: 68,
  width: 1,
  height: 1,
  durationMs: null,
  position: 0
};
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/n3sAAAAASUVORK5CYII=',
  'base64'
);

for (const width of [320, 375, 1280]) {
  test(`server-confirmed attachment editor at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 812 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await mockApi(page);
    await page.route(new RegExp(`/api/v1/posts/${ids.post}$`), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(post(ids.post, 'Матч плей-офф', 'draft', { media: [media] }))
      })
    );
    await page.route(`**/api/v1/media/${media.id}/content`, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: png })
    );
    await page.goto(`/posts/${ids.post}`);
    await expect(page.getByRole('heading', { name: 'Фото и видео' })).toBeVisible();
    await expect(page.getByText('arena.png').first()).toBeVisible();
    await expect(page.getByText('Загружено на сервер')).toBeVisible();
    await expect(page.getByRole('img', { name: 'arena.png' }).first()).toBeVisible();

    const addMedia = page.locator('section[aria-labelledby="post-media-heading"] button').first();
    await addMedia.focus();
    await expect(addMedia).toBeFocused();
    const focusNotObscured = await page.evaluate(() => {
      const focused = document.activeElement?.getBoundingClientRect();
      const actionBar = document.querySelector('[data-testid="post-editor-action-bar"]')?.getBoundingClientRect();
      return !focused || !actionBar || focused.bottom <= actionBar.top || focused.top >= actionBar.bottom;
    });
    expect(focusNotObscured).toBe(true);
    await addMedia.evaluate((element) => element.blur());

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBe(clientWidth);
    if (width !== 320) {
      const axe = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(
        axe.violations.map((item) => `${item.id}: ${item.nodes.map((node) => node.target.join(' ')).join(' | ')}`)
      ).toEqual([]);
    }
    if (SHOTS_DIR && width !== 320) {
      await page.screenshot({ path: `${SHOTS_DIR}/media-editor-${width}.png`, fullPage: true });
    }
    expect(pageErrors).toEqual([]);
  });
}

for (const width of [375, 1280]) {
  test(`empty-media editor at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 812 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await mockApi(page);
    await page.route(new RegExp(`/api/v1/posts/${ids.post}$`), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(post(ids.post, 'Empty media fixture', 'draft', { media: [] }))
      })
    );
    await page.goto(`/posts/${ids.post}`);
    await expect(page.locator('#post-media-heading')).toBeVisible();
    await expect(page.locator('section[aria-labelledby="post-media-heading"] p').last()).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(scrollWidth).toBe(clientWidth);
    const axe = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(
      axe.violations.map((item) => `${item.id}: ${item.nodes.map((node) => node.target.join(' ')).join(' | ')}`)
    ).toEqual([]);
    if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/media-empty-${width}.png`, fullPage: true });
    expect(pageErrors).toEqual([]);
  });
}
