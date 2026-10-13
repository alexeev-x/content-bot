import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockApi } from './support/mock-api';

const operations = {
  timezone: 'Europe/Chisinau',
  notifications: {
    warningsEnabled: true,
    publicationAlerts: true,
    sourceAlerts: true,
    automationAlerts: true,
    recoveryAlerts: true,
    dotaWatchlistAlerts: true
  },
  revision: 1,
  updatedAt: '2026-10-12T10:00:00.000Z'
};

for (const width of [375, 1280, 1920]) {
  test(`notifications show bot status without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockApi(page);
    await page.route('**/api/v1/settings/operations', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(operations)
      })
    );
    await page.goto('/settings/notifications');

    await expect(page.getByRole('heading', { name: 'Связь с ботом' })).toBeVisible();
    await expect(page.getByText('Подключён', { exact: true })).toBeVisible();
    await expect(page.getByText('@alexeev_bot')).toBeVisible();
    await expect(page.getByText('Только в личный чат с ботом')).toBeVisible();
    await expect(page.getByRole('switch')).toHaveCount(6);
    await expect(page.getByRole('button', { name: 'Сохранить' })).toBeDisabled();

    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth
    }));
    expect(widths.scroll).toBe(widths.client);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((violation) => violation.id)).toEqual([]);
    await page.screenshot({ path: `../../.logs/notifications-status-${width}.png`, fullPage: width !== 375 });
  });
}
