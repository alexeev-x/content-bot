import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './support/mock-api';

// Reconciliation of an `unknown` publication (docs/stories/posts-lifecycle.md §6). Set SHOTS_DIR to also save screenshots.
const SHOTS_DIR = process.env['SHOTS_DIR'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const UNKNOWN_ID = '33333333-3333-4333-8333-555555555555';

async function shot(page: Page, name: string, width: number) {
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${name}-${width}.png`, fullPage: false });
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

for (const width of [1280, 375]) {
  test.describe(`reconcile unknown at ${width}px`, () => {
    test.use({
      viewport: { width, height: width === 375 ? 812 : 800 },
      isMobile: width === 375,
      hasTouch: width === 375
    });

    test('posts list opens the reconciliation drawer and the choices pass axe', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await mockApi(page);
      await page.goto('/posts');
      await page.getByRole('button', { name: 'Действия с постом «Короткий пост»' }).click();
      await page.getByRole('menuitem', { name: 'Сверить результат' }).click();

      await expect(page).toHaveURL(new RegExp(`/publications\\?.*id=${UNKNOWN_ID}`));
      const drawer = page.getByRole('dialog', { name: 'Короткий пост' });
      await expect(drawer.getByText('Отправка не подтверждена')).toBeVisible();
      const choices = drawer.getByRole('group', { name: 'Что произошло' });
      await expect(choices.getByRole('button')).toHaveCount(3);
      if (width === 375) {
        for (const button of await choices.getByRole('button').all()) {
          expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43);
        }
      }
      await page.waitForLoadState('networkidle');
      await shot(page, 'unknown-drawer', width);
      await expectNoViolations(page);
      await expectNoSidewaysScroll(page);
    });

    test('«Пост вышел» validates the link, then confirms with the returned status', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await mockApi(page);
      await page.goto(`/publications?id=${UNKNOWN_ID}`);
      const drawer = page.getByRole('dialog', { name: 'Короткий пост' });
      await drawer.getByRole('button', { name: 'Пост вышел', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Пост вышел в канале' });
      const field = dialog.getByRole('textbox', { name: /Ссылка на сообщение или номер/ });
      await field.fill('не ссылка');
      await dialog.getByRole('button', { name: 'Подтвердить публикацию' }).click();
      await expect(dialog.getByText(/Не удалось разобрать/)).toBeVisible();
      await expect(field).toHaveValue('не ссылка');
      await shot(page, 'resolve-sent-error', width);
      await expectNoViolations(page);

      await field.fill('t.me/c/1234567890/321');
      await expect(dialog).toContainText('номер сообщения 321');
      await dialog.getByRole('button', { name: 'Подтвердить публикацию' }).click();
      await expect(dialog).toBeHidden();
      await expect(drawer.getByText('Опубликовано').first()).toBeVisible();
      await expect(drawer.getByRole('group', { name: 'Что произошло' })).toBeHidden();
      await expectNoSidewaysScroll(page);
    });

    test('«Не вышел — отправить снова» and the destructive cancel confirmation', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await mockApi(page);
      await page.goto(`/publications?id=${UNKNOWN_ID}`);
      const drawer = page.getByRole('dialog', { name: 'Короткий пост' });

      await drawer.getByRole('button', { name: 'Не вышел — отправить снова' }).click();
      const resend = page.getByRole('dialog', { name: 'Отправить снова' });
      await expect(resend).toContainText('дубль');
      await shot(page, 'resolve-resend', width);
      await expectNoViolations(page);
      await page.keyboard.press('Escape');
      await expect(resend).toBeHidden();

      await drawer.getByRole('button', { name: 'Не вышел — отменить' }).click();
      const confirm = page.getByRole('alertdialog', { name: 'Отменить публикацию без отправки?' });
      await expect(confirm.getByRole('button', { name: 'Не отменять' })).toBeFocused();
      await shot(page, 'resolve-cancel', width);
      await expectNoViolations(page);
      await confirm.getByRole('button', { name: 'Отменить публикацию' }).click();
      await expect(confirm).toBeHidden();
      await expect(drawer.getByText('Отменено').first()).toBeVisible();
    });
  });
}
