import { mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { PublicationAnalyticsReportDto } from '@alexeev/contracts';
import { expect, test } from '@playwright/test';
import { mockApi, ids } from './support/mock-api';

const REPORT_AT = '2026-10-13T09:00:00.000Z';
const ROW_ID = ids.publication;

function makeReport(from: string, to: string, comparison: 'destination' | 'media'): PublicationAnalyticsReportDto {
  return {
    from,
    to,
    observedAt: REPORT_AT,
    comparison,
    summary: { publications: 42, sent: 38, failed: 2, unknown: 2, attempts: 47, retries: 5 },
    groups:
      comparison === 'destination'
        ? [
            {
              key: ids.destination,
              label: 'Канал Dota',
              counts: { publications: 20, sent: 18, failed: 1, unknown: 1, attempts: 22, retries: 2 },
              coveredPublications: 20,
              unrecordedPublications: 0
            }
          ]
        : [
            {
              key: 'photo',
              label: 'Фото',
              counts: { publications: 18, sent: 17, failed: 1, unknown: 0, attempts: 19, retries: 1 },
              coveredPublications: 18,
              unrecordedPublications: 2
            }
          ],
    publications: {
      items: [
        {
          publicationId: ROW_ID,
          postId: ids.post,
          postRevision: 2,
          title: 'Патч: изменения баланса',
          outcome: 'unknown',
          observedAt: '2026-10-12T10:30:00.000Z',
          destinationId: ids.destination,
          destinationTitle: 'Канал Dota',
          mediaKinds: ['photo'],
          attemptCount: 2,
          retryCount: 1
        }
      ],
      nextCursor: null
    },
    mediaCoverage: { recorded: 40, unrecorded: 2 }
  };
}

test('production analytics route is accessible and responsive', async ({ page }) => {
  mkdirSync('../../.logs/analytics-production-check', { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockApi(page);
  await page.route('https://telegram.org/js/telegram-web-app.js', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.Telegram = { WebApp: {} };' })
  );
  await page.route('**/api/v1/settings/operations', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
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
        updatedAt: REPORT_AT
      })
    })
  );
  await page.route('**/api/v1/analytics/publications*', (route) => {
    const url = new URL(route.request().url());
    const from = url.searchParams.get('from') ?? '2026-09-14T21:00:00.000Z';
    const to = url.searchParams.get('to') ?? '2026-10-14T21:00:00.000Z';
    const comparison = url.searchParams.get('comparison') === 'media' ? 'media' : 'destination';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeReport(from, to, comparison))
    });
  });

  for (const width of [320, 375, 390, 768, 860, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/analytics');
    await expect(page.getByRole('heading', { name: 'Аналитика публикаций' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Аналитика публикаций — ALEXEEV Studio' })).toBeFocused();
    await expect(page.getByText('38', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Снимок отчёта:/)).toBeVisible();
    await expect(page.getByText(/снимок наблюдения/i)).toBeVisible();
    await expect(page.getByText('Патч: изменения баланса')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Публикации и их результаты в выбранном периоде' })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);

    if ([375, 1280, 1920].includes(width)) {
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(axe.violations.map((violation) => violation.id)).toEqual([]);
      await page.screenshot({
        path: `../../.logs/analytics-production-check/analytics-${width}.png`,
        fullPage: true
      });
    }

    if (width === 375) {
      const rowButton = page.getByRole('button', { name: /Патч: изменения баланса/ });
      const filterButton = page.getByRole('button', { name: /Фильтры/ });
      const rowTarget = await rowButton.boundingBox();
      const filterTarget = await filterButton.boundingBox();
      expect(rowTarget?.height).toBeGreaterThanOrEqual(44);
      expect(filterTarget?.height).toBeGreaterThanOrEqual(44);

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const lastRow = page
        .getByRole('table', { name: 'Публикации и их результаты в выбранном периоде' })
        .locator('tbody tr')
        .last();
      const nav = page.getByRole('navigation', { name: 'Основная навигация' });
      const rowBox = await lastRow.boundingBox();
      const navBox = await nav.boundingBox();
      expect(rowBox).not.toBeNull();
      expect(navBox).not.toBeNull();
      expect(rowBox!.y + rowBox!.height).toBeLessThanOrEqual(navBox!.y);

      const tabs = page.getByRole('tablist', { name: 'Измерение сравнения' });
      const channelTab = tabs.getByRole('tab', { name: 'Каналы' });
      const mediaTab = tabs.getByRole('tab', { name: 'Типы медиа' });
      await channelTab.focus();
      await channelTab.press('ArrowRight');
      await expect(mediaTab).toBeFocused();

      const before = page.url();
      await filterButton.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: 'Закрыть' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(filterButton).toBeFocused();
      expect(page.url()).toBe(before);

      await rowButton.click();
      const drawer = page.getByRole('dialog');
      await expect(drawer.getByText(/Результат не подтверждён/)).toBeVisible();
      await expect(drawer.getByRole('button', { name: /повторить|сверить|отправить/i })).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(rowButton).toBeFocused();
      await rowButton.click();
      await page.getByRole('dialog').getByRole('button', { name: 'Открыть публикацию и проверку' }).click();
      await expect(page).toHaveURL(new RegExp(`/publications\\?[^#]*id=${ROW_ID}`));
      await expect(page.getByRole('heading', { name: 'Публикации' })).toBeVisible();
    }
  }
});
