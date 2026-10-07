import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './support/mock-api';

// Dashboard blocks and /incidents (docs/stories/dashboard-today-incidents.md). Set SHOTS_DIR to also save screenshots.
const SHOTS_DIR = process.env['SHOTS_DIR'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const UNKNOWN_PUBLICATION = '33333333-3333-4333-8333-555555555555';

async function shot(page: Page, name: string, width: number, scheme: string) {
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${name}-${scheme}-${width}.png`, fullPage: true });
}

async function expectNoViolations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(
    result.violations.map((item) => `${item.id}: ${item.nodes.map((node) => node.target.join(' ')).join(' | ')}`)
  ).toEqual([]);
}

async function expectNoSidewaysScroll(page: Page) {
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(scroll).toBe(0);
}

async function expectTapTargets(page: Page, names: RegExp[]) {
  for (const name of names) {
    for (const button of await page.getByRole('button', { name }).all()) {
      expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5);
    }
  }
}

for (const width of [1280, 375]) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`dashboard and incidents at ${width}px, ${scheme}`, () => {
      test.use({
        viewport: { width, height: width === 375 ? 812 : 800 },
        isMobile: width === 375,
        hasTouch: width === 375,
        colorScheme: scheme
      });

      test('dashboard blocks pass axe, fit the width and keep 44 px actions on a phone', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: scheme });
        await mockApi(page);
        await page.goto('/');
        await expect(page.getByRole('heading', { level: 1, name: 'Обзор' })).toBeVisible();
        for (const name of ['Требует внимания', 'Сегодня', 'Ближайшие', 'Недавно отправлено']) {
          await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
        }
        await expect(page.getByRole('link', { name: /Открыть в Telegram/ })).toHaveCount(1);
        await page.waitForLoadState('networkidle');
        await shot(page, 'dashboard', width, scheme);
        await expectNoViolations(page);
        await expectNoSidewaysScroll(page);
        if (width === 375) await expectTapTargets(page, [/^Проверить/, /^Открыть:/]);
      });

      test('incidents list passes axe, fits the width and keeps 44 px actions on a phone', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: scheme });
        await mockApi(page);
        await page.goto('/incidents');
        await expect(page.getByRole('heading', { level: 1, name: 'Инциденты' })).toBeVisible();
        await expect(page.getByRole('list', { name: 'Инциденты' }).getByRole('listitem')).toHaveCount(3);
        await page.waitForLoadState('networkidle');
        await shot(page, 'incidents', width, scheme);
        await expectNoViolations(page);
        await expectNoSidewaysScroll(page);
        if (width === 375) await expectTapTargets(page, [/^Проверить/, /^Открыть:/, /^Закрыть инцидент/]);
      });
    });
  }
}

test.describe('flows', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('dashboard «Проверить» opens the reconciliation drawer; after it the incident is closed', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockApi(page);
    await page.goto('/');
    const attention = page.getByRole('region', { name: 'Требует внимания' });
    await expect(attention.getByText('Возможен дубль при повторной отправке')).toBeVisible();
    await attention.getByRole('button', { name: /^Проверить/ }).click();

    await expect(page).toHaveURL(new RegExp(`/publications\\?.*id=${UNKNOWN_PUBLICATION}`));
    const drawer = page.getByRole('dialog', { name: 'Короткий пост' });
    await expect(drawer.getByRole('group', { name: 'Что произошло' })).toBeVisible();
    await drawer.getByRole('button', { name: 'Не вышел — отменить' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Отменить публикацию' }).click();
    await expect(drawer.getByText('Отменено').first()).toBeVisible();
    await drawer.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await expect(drawer).toBeHidden();

    await page.getByRole('link', { name: /^Инциденты/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Инциденты' })).toBeVisible();
    const open = page.getByRole('list', { name: 'Инциденты' });
    await expect(open.getByText('Короткий пост')).toHaveCount(0);
    await page.locator('label').filter({ hasText: 'Закрытые' }).click();
    await expect(page.getByRole('list', { name: 'Инциденты' }).getByText('Короткий пост')).toBeVisible();
    await expect(page.getByText(/Закрыт 7 окт\./)).toBeVisible();
  });

  test('closing a failed incident keeps the row until the server answers, then toasts and moves it', async ({
    page
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockApi(page);
    await page.goto('/incidents');
    const list = page.getByRole('list', { name: 'Инциденты' });
    await expect(list.getByRole('button', { name: /^Закрыть инцидент/ })).toHaveCount(2);
    await expect(
      list
        .getByRole('listitem')
        .filter({ hasText: 'Короткий пост' })
        .getByRole('button', { name: /Закрыть/ })
    ).toHaveCount(0);

    await expectNoViolations(page);
    await list.getByRole('button', { name: 'Закрыть инцидент: «Итоги недели»' }).click();
    await expect(page.getByText('Инцидент закрыт')).toBeVisible();
    await expect(list.getByText('Итоги недели')).toHaveCount(0);

    await page.locator('label').filter({ hasText: 'Закрытые' }).click();
    await expect(page.getByRole('list', { name: 'Инциденты' }).getByText('Итоги недели')).toBeVisible();
  });

  test('the sidebar item shows the open count', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Инциденты.*3 требуют внимания/ })).toBeVisible();
  });
});
