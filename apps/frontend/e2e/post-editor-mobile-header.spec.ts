import { expect, test } from '@playwright/test';
import { ids, mockApi } from './support/mock-api';

test('mobile post editor keeps the title and media geometry aligned with the accepted prototype', async ({
  page
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockApi(page);
  await page.goto(`/posts/${ids.post}`);

  const header = page.locator('header').first();
  const back = header.locator('button[aria-label]').first();
  const title = header.locator('h1');
  const titleField = page.locator('input[name="title"]');
  const mediaHeading = page.locator('#post-media-heading');
  await expect(back).toBeVisible();
  await expect(back.locator('svg path')).toHaveAttribute('d', 'm15 6-6 6 6 6');
  await expect(back.locator('svg')).toHaveCSS('width', '18px');
  await expect(title).toBeVisible();
  await expect(titleField).toBeVisible();
  await expect(mediaHeading).toBeVisible();

  const order = await page.evaluate(() => {
    const nodes = [
      document.querySelector('header button[aria-label]'),
      document.querySelector('header h1'),
      document.querySelector('input[name="title"]'),
      document.querySelector('#post-media-heading')
    ];
    return nodes.map((node) => (node ? Array.from(document.querySelectorAll('body *')).indexOf(node) : -1));
  });
  expect(order.every((position) => position >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((left, right) => left - right));

  const productionTitle = await titleField.boundingBox();
  const productionMedia = await mediaHeading.boundingBox();
  if (!productionTitle || !productionMedia) throw new Error('Production geometry targets are missing');
  await page.screenshot({ path: testInfo.outputPath('production-375.png') });

  await page.goto('/__proto/posts/new?state=media');
  const prototypeTitle = page.locator('input').first();
  const prototypeMedia = page.locator('h2').first();
  await expect(prototypeTitle).toBeVisible();
  await expect(prototypeMedia).toBeVisible();
  const targetTitle = await prototypeTitle.boundingBox();
  const targetMedia = await prototypeMedia.boundingBox();
  if (!targetTitle || !targetMedia) throw new Error('Prototype geometry targets are missing');
  expect(
    Math.abs(productionTitle.y - targetTitle.y),
    `title field y: production ${productionTitle.y}, prototype ${targetTitle.y}`
  ).toBeLessThanOrEqual(4);
  expect(
    Math.abs(productionMedia.y - targetMedia.y),
    `media heading y: production ${productionMedia.y}, prototype ${targetMedia.y}`
  ).toBeLessThanOrEqual(4);
});
