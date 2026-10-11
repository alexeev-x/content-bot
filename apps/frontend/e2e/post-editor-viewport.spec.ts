import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ids, mockApi, post } from './support/mock-api';

const photoFixtures = [
  {
    fileName: 'altai_lake.jpg',
    bytes: readFileSync(new URL('../src/pages/prototypes/assets/photo-altai.jpg', import.meta.url))
  },
  {
    fileName: 'blue_lake.jpg',
    bytes: readFileSync(new URL('../src/pages/prototypes/assets/photo-lake.jpg', import.meta.url))
  },
  {
    fileName: 'mountains.jpg',
    bytes: readFileSync(new URL('../src/pages/prototypes/assets/photo-mountains.jpg', import.meta.url))
  },
  {
    fileName: 'sunset.jpg',
    bytes: readFileSync(new URL('../src/pages/prototypes/assets/poster-sunset.jpg', import.meta.url))
  },
  {
    fileName: 'waterfall.jpg',
    bytes: readFileSync(new URL('../src/pages/prototypes/assets/poster-waterfall.jpg', import.meta.url))
  }
];
const viewportWidths = [320, 375, 390, 768, 859, 860, 861, 1024, 1280, 1440, 1920];
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

async function setupEditor(page: Page, width: number, theme: 'light' | 'dark') {
  const height = width < 860 ? 812 : 900;
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const requestFailures: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) =>
    requestFailures.push(`${request.url()}: ${request.failure()?.errorText ?? 'unknown'}`)
  );

  await mockApi(page);
  const mediaItems = photoFixtures.map(({ fileName, bytes }, position) => ({
    id: `66666666-6666-4666-8666-${String(position + 1).padStart(12, '0')}`,
    sourceMediaId: null,
    kind: 'photo',
    fileName,
    contentType: 'image/jpeg',
    sizeBytes: bytes.byteLength,
    width: 4032,
    height: 3024,
    durationMs: null,
    position
  }));
  await page.route(new RegExp(`/api/v1/posts/${ids.post}$`), (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(post(ids.post, 'Невероятные пейзажи Алтая', 'draft', { media: mediaItems }))
    })
  );
  const photoById = new Map(mediaItems.map((item, index) => [item.id, photoFixtures[index]?.bytes]));
  await page.route(/\/api\/v1\/media\/[^/]+\/content$/, (route) => {
    const mediaId = new URL(route.request().url()).pathname.split('/').at(-2);
    const bytes = mediaId ? photoById.get(mediaId) : undefined;
    if (!bytes) throw new Error(`No photo fixture for ${mediaId ?? 'unknown media'}`);
    return route.fulfill({ status: 200, contentType: 'image/jpeg', body: bytes });
  });

  await page.goto(`/posts/${ids.post}`);
  await expect(page.locator('section[aria-labelledby="post-media-heading"] ol li > div img')).toHaveCount(5);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(await page.evaluate(() => document.documentElement.clientWidth));

  return { pageErrors, consoleErrors, requestFailures };
}

async function expectNoRuntimeFailures(errors: Awaited<ReturnType<typeof setupEditor>>) {
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.requestFailures).toEqual([]);
}

for (const width of viewportWidths) {
  test(`post editor fits ${width}px in light theme`, async ({ page }) => {
    const errors = await setupEditor(page, width, 'light');
    if (width === 375 || width === 1280) {
      const result = await new AxeBuilder({ page }).withTags(axeTags).analyze();
      expect(result.violations.map((violation) => violation.id)).toEqual([]);
    }
    await expectNoRuntimeFailures(errors);
  });
}

for (const width of [375, 1280, 1440]) {
  test(`post editor fits ${width}px in dark theme`, async ({ page }) => {
    const errors = await setupEditor(page, width, 'dark');
    if (width === 375 || width === 1280) {
      const result = await new AxeBuilder({ page }).withTags(axeTags).analyze();
      expect(result.violations.map((violation) => violation.id)).toEqual([]);
    }
    await expectNoRuntimeFailures(errors);
  });
}
