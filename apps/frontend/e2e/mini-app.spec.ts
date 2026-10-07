import { expect, test } from '@playwright/test';
import { ru } from '../src/shared/lib/ru';
import { ids, mockApi } from './support/mock-api';
import { installFakeTelegram, telegramCalls } from './support/telegram';

// Mini App integration (docs/stories/mobile-layout.md, items 5, 6, 9) against a fake window.Telegram.
// Screenshots go to E2E_SHOT_DIR when it is set (never committed).
const SHOT_DIR = process.env['E2E_SHOT_DIR'];
const SCREENS = [
  { name: 'publications', path: '/publications' },
  { name: 'posts', path: '/posts' },
  { name: 'posts-new', path: '/posts/new' },
  { name: 'settings-channels', path: '/settings/channels' }
];

test.describe('Mini App', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await installFakeTelegram(page);
  });

  test('hides the app top bar and puts the owner menu into the page header; no disabled search placeholder', async ({
    page
  }) => {
    await page.goto('/posts');
    const title = page.locator('main h1');
    await expect(title).toBeVisible();
    // The browser top bar is the only banner outside main.
    await expect(page.locator('main').locator('..').locator('> header')).toHaveCount(0);
    const header = page.locator('main header').first();
    // Search is not wired yet, so the cramped Telegram header shows no disabled placeholder for it.
    await expect(header.getByRole('button', { name: ru.shell.searchPlaceholder })).toHaveCount(0);
    const tools = [header.getByRole('button', { name: new RegExp(ru.auth.ownerMenu) })];
    for (const button of tools) {
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('BackButton is hidden on a tab root and shown on a child route; the in-page link is gone', async ({ page }) => {
    await page.goto('/posts');
    await expect(page.locator('main h1')).toBeVisible();
    expect((await telegramCalls(page)).some((call) => call.method === 'BackButton.show')).toBe(false);

    await page.goto(`/posts/${ids.post}`);
    await expect(page.locator('main h1')).toBeVisible();
    await expect.poll(async () => (await telegramCalls(page)).map((call) => call.method)).toContain('BackButton.show');
    await expect(page.getByRole('link', { name: 'Все посты' })).toHaveCount(0);
  });

  test('sets colors and disables vertical swipes', async ({ page }) => {
    await page.goto('/posts');
    await expect(page.locator('main h1')).toBeVisible();
    const calls = await telegramCalls(page);
    expect(calls.map((call) => call.method)).toEqual(
      expect.arrayContaining(['disableVerticalSwipes', 'setHeaderColor', 'setBackgroundColor', 'setBottomBarColor'])
    );
    const header = calls.find((call) => call.method === 'setHeaderColor');
    expect(header?.args[0]).toMatch(/^#[0-9a-f]{6}$/);
  });

  for (const screen of SCREENS) {
    test(`screenshot ${screen.name}`, async ({ page }) => {
      test.skip(!SHOT_DIR, 'E2E_SHOT_DIR is not set');
      await page.goto(screen.path);
      await expect(page.locator('main h1')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${SHOT_DIR}/${screen.name}-375-miniapp.png`, fullPage: true });
    });
  }
});

test.describe('Browser', () => {
  test('keeps the top bar and the in-page back link', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/posts/${ids.post}`);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Все посты' })).toBeVisible();
    await expect(page.locator('header').first()).toBeVisible();
  });

  for (const screen of SCREENS) {
    test(`screenshot ${screen.name} 1280`, async ({ page }) => {
      test.skip(!SHOT_DIR, 'E2E_SHOT_DIR is not set');
      await page.setViewportSize({ width: 1280, height: 800 });
      await mockApi(page);
      await page.goto(screen.path);
      await expect(page.locator('main h1')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${SHOT_DIR}/${screen.name}-1280.png`, fullPage: true });
    });
  }
});
