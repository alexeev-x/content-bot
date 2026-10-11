import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, post as mockPost } from './support/mock-api';

// Archive, selection and delete dialog (docs/design/UX_SPEC.md §3.2). Set SHOTS_DIR to also save screenshots.
const SHOTS_DIR = process.env['SHOTS_DIR'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

async function shot(page: Page, name: string, width: number) {
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${name}-${width}.png`, fullPage: false });
}

async function expectNoViolations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(
    result.violations.flatMap((item) =>
      item.nodes.map((node) => `${item.id}: ${node.target.join(' ')} — ${node.failureSummary ?? item.help}`)
    )
  ).toEqual([]);
}

for (const width of [1280, 375]) {
  test.describe(`posts lifecycle at ${width}px`, () => {
    test.use({
      viewport: { width, height: width === 375 ? 812 : width === 1920 ? 1080 : 800 },
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
      const weekPost =
        width === 375
          ? page.getByRole('listitem').filter({ hasText: 'Итоги недели' })
          : page.getByRole('rowheader', { name: /^Итоги недели/ });
      await expect(weekPost).toBeVisible();
      await page.waitForLoadState('networkidle');
      await shot(page, 'archive', width);
      await expectNoViolations(page);

      await page.getByRole('button', { name: 'Выбрать' }).click();
      // A real press on the visible box, so an overlay stealing the click would fail the test.
      for (const title of ['Итоги недели', 'Сверхдлинноеназваниеканалабезпробелов']) {
        if (width === 375) {
          const card = page.getByRole('listitem').filter({ hasText: title });
          await card.locator('label').click();
        } else {
          const row = page
            .getByRole('row')
            .filter({ has: page.getByRole('rowheader', { name: new RegExp(`^${title}`) }) });
          await row.locator('label[slot="selection"]').click();
        }
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

const COPY_ID = '11111111-1111-4111-8111-999999999999';

for (const width of [375, 1280, 1920]) {
  test.describe(`duplicate post action at ${width}px`, () => {
    test.use({
      viewport: { width, height: width === 375 ? 812 : width === 1920 ? 1080 : 800 },
      isMobile: width === 375,
      hasTouch: width === 375
    });

    test('keyboard opens duplicate action and navigates to the new draft', async ({ page }) => {
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
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.route('https://telegram.org/js/telegram-web-app.js', (route) =>
        route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.Telegram = { WebApp: {} };' })
      );
      await mockApi(page);
      let copy = mockPost(COPY_ID, '');
      let createInput: { title: string; body: string; entities: unknown[] } | undefined;
      await page.route(/\/api\/v1\/posts(?:\?.*)?$/, async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        const input = route.request().postDataJSON() as { title: string; body: string; entities: unknown[] };
        createInput = input;
        copy = mockPost(COPY_ID, input.title, 'draft', {
          body: input.body,
          entities: input.entities,
          revision: 0
        });
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(copy) });
      });
      await page.route(new RegExp(`/api/v1/posts/${COPY_ID}$`), (route) =>
        route.fulfill({ contentType: 'application/json', body: JSON.stringify(copy) })
      );
      await page.goto('/posts');
      await expect(page.getByRole('heading', { level: 1, name: 'Посты' })).toBeVisible();
      const menuButton = page.getByRole('button', { name: /^Действия с постом/ }).first();
      await expect(menuButton).toBeVisible();
      if (width === 375) expect((await menuButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43);
      if (width === 375) {
        await menuButton.focus();
        await page.keyboard.press('ArrowDown');
      } else {
        await menuButton.click();
      }
      const duplicate = page.getByRole('menuitem', { name: 'Дублировать' });
      if (width !== 375) await duplicate.focus();
      await expect(duplicate).toBeFocused();
      await shot(page, 'posts-duplicate-menu', width);
      await expectNoViolations(page);
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/posts/${COPY_ID}$`));
      expect(createInput).toBeDefined();
      expect(createInput?.title).toBe(copy.title);
      expect(createInput?.body).toBe(copy.body);
      expect(pageErrors).toEqual([]);
      expect(requestFailures.filter((failure) => !failure.endsWith('net::ERR_ABORTED'))).toEqual([]);
      expect(consoleErrors).toEqual([]);
      const scroll = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(scroll).toBe(0);
    });
  });
}
