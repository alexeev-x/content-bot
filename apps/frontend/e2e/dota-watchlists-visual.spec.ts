import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockApi } from './support/mock-api';

const UPDATE_ID = 'patch_notes:7.41';
const FACT_ID = 'patch:7.41:hero:0:hero:0:0';
const WATCH_ID = '55555555-5555-4555-8555-555555555555';
const NOW = '2026-10-13T09:00:00.000Z';

test('production Dota watchlists are responsive, accessible and keyboard-safe', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await mockApi(page);
  await page.route('**/api/v1/settings/operations', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ timezone: 'Europe/Chisinau', notifications: {}, revision: 1, updatedAt: NOW })
    })
  );
  await page.route('**/api/v1/dota?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sources: [
          {
            key: 'steam_news',
            name: 'Dota 2 · Steam Community',
            officialUrl: 'https://steamcommunity.com/games/dota2/news',
            lastAttemptAt: NOW,
            lastSuccessAt: NOW,
            health: 'healthy'
          },
          {
            key: 'patch_notes',
            name: 'Dota 2 · Patch notes',
            officialUrl: 'https://www.dota2.com/patches',
            lastAttemptAt: NOW,
            lastSuccessAt: NOW,
            health: 'healthy'
          }
        ],
        updates: [
          {
            id: UPDATE_ID,
            sourceKey: 'patch_notes',
            type: 'patch',
            title: 'Patch 7.41',
            sourceUrl: 'https://www.dota2.com/patches/7.41',
            publishedAt: NOW,
            detectedAt: NOW,
            isBaseline: false
          }
        ]
      })
    })
  );

  const watch = {
    id: WATCH_ID,
    entityType: 'hero',
    entityName: 'Axe',
    createdAt: NOW,
    lastMatchedUpdate: null
  };
  let watches: (typeof watch)[] = [];
  let postCount = 0;
  let deleteCount = 0;
  let idempotencyKey = '';
  await page.route('**/api/v1/dota/watchlists', async (route) => {
    const method = route.request().method();
    if (method === 'GET')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ watches, matches: [] })
      });
    if (method === 'POST') {
      postCount += 1;
      idempotencyKey = route.request().headers()['idempotency-key'] ?? '';
      watches = [watch];
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ watch, created: true })
      });
    }
    throw new Error(`Unexpected watchlist method: ${method}`);
  });
  await page.route(`**/api/v1/dota/watchlists/${WATCH_ID}`, async (route) => {
    if (route.request().method() !== 'DELETE') throw new Error('Expected a watch removal');
    deleteCount += 1;
    watches = [];
    return route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/v1/dota/updates/patch_notes/7.41', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        update: {
          id: UPDATE_ID,
          sourceKey: 'patch_notes',
          type: 'patch',
          title: 'Patch 7.41',
          sourceUrl: 'https://www.dota2.com/patches/7.41',
          publishedAt: NOW,
          detectedAt: NOW,
          isBaseline: false
        },
        parseStatus: 'incomplete',
        facts: [
          {
            id: FACT_ID,
            entityType: 'hero',
            entityName: 'Axe',
            section: 'hero',
            change: 'Damage increased by 10',
            direction: 'increase'
          }
        ]
      })
    })
  );

  for (const width of [320, 375, 390, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: width < 860 ? 812 : 900 });
    await page.goto(`/sources?update=${encodeURIComponent(UPDATE_ID)}`);
    await expect(page.getByRole('heading', { name: 'Patch 7.41' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Axe/ })).toBeVisible();
    const size = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(size.scrollWidth, `horizontal overflow at ${width}px`).toBe(size.clientWidth);

    if (width === 375 || width === 1280) {
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(
        axe.violations.map((violation) => violation.id),
        `axe violations at ${width}px`
      ).toEqual([]);
      await page.screenshot({ path: `../../.logs/dota-watchlists-${width}.png`, fullPage: true });
    }
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/sources');
  await page.getByRole('tablist').getByRole('tab').first().click();
  await page.getByRole('link', { name: /Patch 7\.41/ }).click();
  await expect(page).toHaveURL(new RegExp(`update=${encodeURIComponent(UPDATE_ID)}`));
  await page.getByRole('button', { name: /Axe/ }).click();
  await expect(page).toHaveURL(/\/sources(?:\?.*)?$/);
  await expect(page.getByText('Axe', { exact: true })).toBeVisible();
  expect(postCount).toBe(1);
  expect(idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);

  const menuTrigger = page.getByRole('button', { name: /Axe/ });
  await menuTrigger.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(menuTrigger).toBeFocused();
  await menuTrigger.click();
  await page.getByRole('menuitem', { name: /Axe/ }).click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('H2');
  expect(deleteCount).toBe(1);
  expect(pageErrors).toEqual([]);
});
