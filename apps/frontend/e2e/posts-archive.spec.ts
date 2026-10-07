import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './support/mock-api';

// Archive, selection and delete dialog (docs/stories/posts-lifecycle.md §6a, §7). Set SHOTS_DIR to also save screenshots.
const SHOTS_DIR = process.env['SHOTS_DIR'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

async function shot(page: Page, name: string, width: number) {
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${name}-${width}.png`, fullPage: false });
}

async function expectNoViolations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(
    result.violations.map((item) => `${item.id}: ${item.nodes.map((node) => node.target.join(' ')).join(' | ')}`)
  ).toEqual([]);
}

for (const width of [1280, 375]) {
  test.describe(`posts lifecycle at ${width}px`, () => {
    test.use({
      viewport: { width, height: width === 375 ? 812 : 800 },
      isMobile: width === 375,
      hasTouch: width === 375
    });

    test('Posts page has no axe violations and no sideways scroll', async ({ page }) => {
      await mockApi(page);
      await page.goto('/posts');
      await expect(page.getByRole('heading', { level: 1, name: 'Посты' })).toBeVisible();
      await expect(page.getByRole('tab', { name: /Архив/ })).toContainText('3');
      await page.waitForLoadState('networkidle');
      await shot(page, 'posts-all', width);
      await expectNoViolations(page);
    });

    test('Archive tab, selection mode and delete dialog', async ({ page }) => {
      // The dialog fades in; axe must not sample colours mid-transition.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await mockApi(page);
      await page.goto('/posts?view=archive');
      await expect(page.getByText('Опубликованные посты хранятся здесь 30 дней, затем удаляются.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Итоги недели', exact: true })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await shot(page, 'archive', width);
      await expectNoViolations(page);

      if (width === 375) await page.getByRole('button', { name: 'Выбрать' }).click();
      // A real press on the visible box, so an overlay stealing the click would fail the test.
      for (const name of ['Выбрать пост «Итоги недели»', /Выбрать пост «Сверхдлинное/]) {
        await page.locator('label', { has: page.getByRole('checkbox', { name }) }).click();
      }
      const bar = page.getByRole('toolbar', { name: 'Выбранные посты' });
      await expect(bar).toContainText('Выбрано: 2');
      await shot(page, 'selection', width);
      await expectNoViolations(page);
      const scroll = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(scroll).toBe(0);

      // Every control in the bar is a real target of at least 44 px on a phone.
      if (width === 375) {
        for (const button of await bar.getByRole('button').all()) {
          expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43);
        }
      }

      await bar.getByRole('button', { name: 'Удалить' }).click();
      const dialog = page.getByRole('alertdialog', { name: 'Удалить 2 поста?' });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('Сообщения в каналах не удаляются');
      await expect(dialog.getByRole('button', { name: 'Не удалять' })).toBeFocused();
      await shot(page, 'delete-dialog', width);
      await expectNoViolations(page);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(bar).toContainText('Выбрано: 2');
    });
  });
}
