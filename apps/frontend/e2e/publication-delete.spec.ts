import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './support/mock-api';

const SHOTS_DIR = process.env['SHOTS_DIR'];
const SENT_ID = '33333333-3333-4333-8333-444444444444';

async function shot(page: Page, name: string, width: number) {
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${name}-${width}.png`, fullPage: false });
}

async function expectNoViolations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(
    result.violations.flatMap((item) =>
      item.nodes.map((node) => `${item.id}: ${node.target.join(' ')} — ${node.failureSummary ?? item.help}`)
    )
  ).toEqual([]);
}

for (const width of [375, 1280, 1920]) {
  test.describe(`final publication deletion at ${width}px`, () => {
    test.use({
      viewport: { width, height: width === 375 ? 812 : width === 1920 ? 1080 : 800 },
      isMobile: width === 375,
      hasTouch: width === 375
    });

    test('selects only final rows and confirms before deleting the Studio record', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.route('https://telegram.org/js/telegram-web-app.js', (route) =>
        route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.Telegram = { WebApp: {} };' })
      );
      await mockApi(page);
      let deleteInput: unknown;
      await page.route(new RegExp(`/api/v1/publications/${SENT_ID}/delete$`), async (route) => {
        deleteInput = route.request().postDataJSON();
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ id: SENT_ID, outcome: 'deleted' })
        });
      });
      await page.goto('/publications');
      await expect(page.getByRole('heading', { level: 1, name: 'Публикации' })).toBeVisible();
      const sentRow =
        width === 375
          ? page.getByRole('listitem').nth(1)
          : page.getByRole('grid', { name: 'Список публикаций' }).getByRole('row').filter({ hasText: '4242' });
      await expect(sentRow).toBeVisible();
      await expectNoViolations(page);
      await shot(page, 'publications-list', width);

      await page.getByRole('button', { name: 'Выбрать' }).click();
      const checkbox = sentRow.getByRole('checkbox');
      const checkboxLabel = sentRow.locator('label[data-rac]').first();
      if (width === 375) expect((await checkboxLabel.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(24);
      await checkbox.focus();
      await checkbox.press('Space');
      await page.getByRole('button', { name: /^Удалить$/ }).click();
      const dialog = page.getByRole('alertdialog', { name: /^Удалить запись публикации/ });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('Сообщение, уже отправленное в Telegram, останется в канале.');
      expect(deleteInput).toBeUndefined();
      await expectNoViolations(page);
      await shot(page, 'publications-delete-confirm', width);
      await dialog.getByRole('button', { name: 'Удалить запись' }).click();
      await expect.poll(() => deleteInput).toEqual({ revision: 0 });
      expect(errors).toEqual([]);
      await expect(page.getByRole('heading', { level: 1, name: 'Публикации' })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBe(0);
    });
  });
}
