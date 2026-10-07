import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ids, mockApi, post } from './support/mock-api';

// Rich post editor (docs/plan/content-studio.md §5.1). Set SHOTS_DIR to also save screenshots.
const SHOTS_DIR = process.env['SHOTS_DIR'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

const BODY = 'Жирный курсив спойлер ссылка код 😀\nпервая строка цитаты\nвторая строка цитаты\nlet a = 1;';
const FORMATTED = post(ids.post, 'Итоги недели', 'draft', {
  body: BODY,
  entities: [
    { type: 'bold', offset: 0, length: 6 },
    { type: 'italic', offset: 7, length: 6 },
    { type: 'spoiler', offset: 14, length: 7 },
    { type: 'text_link', offset: 22, length: 6, url: 'https://example.com/' },
    { type: 'code', offset: 29, length: 3 },
    { type: 'blockquote', offset: 36, length: 41 },
    { type: 'pre', offset: 78, length: 10, language: 'ts' }
  ]
});

async function shot(page: Page, name: string, width: number) {
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${name}-${width}.png`, fullPage: true });
}

async function expectNoViolations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(
    result.violations.map((item) => `${item.id}: ${item.nodes.map((node) => node.target.join(' ')).join(' | ')}`)
  ).toEqual([]);
}

async function expectNoSideScroll(page: Page) {
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(scroll).toBe(0);
}

async function openFormatted(page: Page, override: Record<string, unknown> = {}) {
  await mockApi(page);
  await page.route(/\/api\/v1\/posts\/11111111-1111-4111-8111-111111111111$/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...FORMATTED, ...override }) })
  );
  await page.goto(`/posts/${ids.post}`);
  await expect(page.getByRole('textbox', { name: 'Текст' })).toBeVisible();
}

for (const width of [1280, 375]) {
  test.describe(`rich editor at ${width}px`, () => {
    test.use({
      viewport: { width, height: width === 375 ? 812 : 800 },
      isMobile: width === 375,
      hasTouch: width === 375
    });

    test('empty editor: toolbar targets, no sideways scroll, axe', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await mockApi(page);
      await page.goto('/posts/new');
      await expect(page.getByRole('toolbar', { name: 'Форматирование текста' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await shot(page, 'editor-empty', width);
      await expectNoSideScroll(page);
      const minimum = width === 375 ? 43 : 24;
      for (const button of await page
        .getByRole('toolbar', { name: 'Форматирование текста' })
        .getByRole('button')
        .all()) {
        const box = await button.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(minimum);
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(minimum);
      }
      await expectNoViolations(page);
    });

    test('formatted post: editor, preview, axe', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openFormatted(page);
      if (width === 375) await page.getByRole('tab', { name: 'Превью' }).click();
      await expect(page.getByRole('figure', { name: 'Предпросмотр в Telegram' }).locator('blockquote')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await shot(page, 'preview-formatted', width);
      if (width === 375) await page.getByRole('tab', { name: 'Текст' }).click();
      await shot(page, 'editor-formatted', width);
      await expectNoSideScroll(page);
      await expectNoViolations(page);
    });

    test('link dialog: keyboard flow, focus returns to the editor, axe', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openFormatted(page);
      const editor = page.getByRole('textbox', { name: 'Текст' });
      await editor.getByText('ссылка', { exact: true }).dblclick();
      await page.keyboard.press('ControlOrMeta+k');
      const dialog = page.getByRole('dialog', { name: 'Ссылка' });
      await expect(dialog).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null))
        .toBe(true);
      await dialog.getByRole('textbox', { name: 'Адрес' }).fill('javascript:alert(1)');
      await page.keyboard.press('Enter');
      await expect(dialog.getByText(/должен начинаться с http/)).toBeVisible();
      await shot(page, 'link-dialog', width);
      await expectNoViolations(page);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(editor).toBeFocused();
    });

    test('approved post renders read-only with its formatting', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await mockApi(page);
      await page.route(/\/api\/v1\/posts\/11111111-1111-4111-8111-111111111111$/, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...FORMATTED, status: 'approved', revision: 2 })
        })
      );
      await page.goto(`/posts/${ids.post}`);
      const bubble = page.getByRole('figure', { name: 'Предпросмотр в Telegram' });
      await expect(bubble.locator('blockquote')).toBeVisible();
      await expect(page.getByRole('toolbar', { name: 'Форматирование текста' })).toHaveCount(0);
      await page.waitForLoadState('networkidle');
      await shot(page, 'editor-approved', width);
      await expectNoSideScroll(page);
      await expectNoViolations(page);
    });
  });
}

test.describe('keyboard pass at 1280px', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Tab reaches title, one toolbar stop with arrows, then the editor; shortcuts format; Ctrl+S saves', async ({
    page
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openFormatted(page);
    const patches: Array<Record<string, unknown>> = [];
    await page.route(/\/api\/v1\/posts\/11111111-1111-4111-8111-111111111111$/, async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      patches.push(route.request().postDataJSON() as Record<string, unknown>);
      const sent = patches.at(-1) ?? {};
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...FORMATTED, ...sent, revision: 1 })
      });
    });

    await page.getByRole('textbox', { name: /Заголовок/ }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Жирный' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: 'Курсив' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('textbox', { name: 'Текст' })).toBeFocused();

    // The focus ring is not covered by the sticky action bar and the toolbar button shows it.
    await page.getByRole('textbox', { name: /Заголовок/ }).focus();
    await page.keyboard.press('Tab');
    // The toolbar remembers the last button, so Tab lands on «Курсив» here.
    const bold = page.getByRole('button', { name: 'Курсив' });
    await expect(bold).toBeFocused();
    await expect(bold).toHaveAttribute('data-focus-visible', 'true');
    await expect.poll(() => bold.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe('none');

    const editor = page.getByRole('textbox', { name: 'Текст' });
    await editor.getByText('первая строка цитаты').click({ clickCount: 3 });
    await page.keyboard.press('ControlOrMeta+u');
    await expect(page.getByRole('button', { name: 'Подчёркнутый' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0]?.['entities']).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'underline', offset: 36, length: 20 })])
    );
    // Tooltips fade in while the pointer rests on the toolbar; axe samples a settled page.
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await expectNoViolations(page);
  });
});
