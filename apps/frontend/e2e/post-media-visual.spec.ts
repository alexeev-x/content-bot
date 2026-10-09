import AxeBuilder from '@axe-core/playwright';
import { cropPostMediaResultSchema } from '@alexeev/contracts';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ids, mockApi, post } from './support/mock-api';

const SHOTS_DIR = process.env['SHOTS_DIR'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const realPhoto = readFileSync(new URL('../src/pages/prototypes/assets/photo-altai.jpg', import.meta.url));
const photoFixtures = [
  { fileName: 'altai_lake.jpg', bytes: realPhoto },
  {
    fileName: 'blue_lake.jpg',
    bytes: readFileSync(new URL('../src/pages/prototypes/assets/photo-lake.jpg', import.meta.url))
  },
  {
    fileName: 'mountains.jpg',
    bytes: readFileSync(new URL('../src/pages/prototypes/assets/photo-mountains.jpg', import.meta.url))
  },
  {
    fileName: 'sunset.jpg',
    bytes: readFileSync(new URL('../src/pages/prototypes/assets/poster-sunset.jpg', import.meta.url))
  },
  {
    fileName: 'waterfall.jpg',
    bytes: readFileSync(new URL('../src/pages/prototypes/assets/poster-waterfall.jpg', import.meta.url))
  }
];
const longTitle = 'Чемпионский плей-офф: как команда прошла финальную серию и что это меняет · '
  .repeat(3)
  .slice(0, 200);
const media = {
  id: '44444444-4444-4444-8444-444444444444',
  sourceMediaId: null,
  kind: 'photo',
  fileName: 'altai_lake.jpg',
  contentType: 'image/jpeg',
  sizeBytes: realPhoto.byteLength,
  width: 4032,
  height: 3024,
  durationMs: null,
  position: 0
};
for (const width of [320, 375, 1280]) {
  test(`server-confirmed attachment editor at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 812 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await mockApi(page);
    await page.route(new RegExp(`/api/v1/posts/${ids.post}$`), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(post(ids.post, longTitle, 'draft', { media: [media] }))
      })
    );
    let croppedPhoto: Buffer | null = null;
    const croppedMediaId = '55555555-5555-4555-8555-555555555555';
    await page.route(new RegExp(`/api/v1/posts/${ids.post}/media/${media.id}/crop\\?`), async (route) => {
      const request = route.request();
      const body = request.postDataBuffer();
      if (!body) throw new Error('Crop request must contain the encoded photo bytes');
      croppedPhoto = body;
      const contentType = request.headers()['content-type'] ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          media: {
            ...media,
            id: croppedMediaId,
            fileName: 'altai_lake.jpg',
            contentType,
            sizeBytes: body.byteLength,
            width: 2048,
            height: 2048
          },
          revision: 2
        })
      });
    });
    await page.route(`**/api/v1/media/${media.id}/content`, (route) =>
      route.fulfill({ status: 200, contentType: 'image/jpeg', body: realPhoto })
    );
    await page.route(`**/api/v1/media/${croppedMediaId}/content`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        body: croppedPhoto ?? realPhoto
      })
    );
    await page.goto(`/posts/${ids.post}`);
    await expect(page.getByRole('heading', { name: 'Фото и видео' })).toBeVisible();
    if (width < 860) {
      await expect(page.getByRole('tab')).toHaveCount(0);
      await expect(page.getByRole('textbox', { name: 'Заголовок' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Текст' })).toBeVisible();
      const primaryAction = page.getByRole('button', { name: /настроить публикацию/i });
      await expect(primaryAction).toBeInViewport();
      const actionBox = await primaryAction.boundingBox();
      expect(actionBox?.x).toBeGreaterThanOrEqual(0);
      expect((actionBox?.x ?? 0) + (actionBox?.width ?? 0)).toBeLessThanOrEqual(width);
    }
    await expect(page.getByText('altai_lake.jpg').first()).toBeVisible();
    await expect(page.getByText('Загружено на сервер')).toBeVisible();
    const tile = page.getByRole('button', { name: 'altai_lake.jpg', exact: true });
    await expect(tile).toBeVisible();
    const tileBox = await tile.boundingBox();
    expect(tileBox).not.toBeNull();
    if (width === 375) expect(Math.abs((tileBox?.width ?? 0) - 104)).toBeLessThanOrEqual(6);
    if (width === 1280) expect(Math.abs((tileBox?.width ?? 0) - 124)).toBeLessThanOrEqual(1);
    if (width === 320) expect(tileBox?.width ?? 0).toBeLessThanOrEqual(104);
    expect(Math.abs((tileBox?.width ?? 0) - (tileBox?.height ?? 0))).toBeLessThanOrEqual(1);
    const editorTitle = page.locator('main h1');
    const titleBox = await editorTitle.boundingBox();
    expect(titleBox).not.toBeNull();
    expect((titleBox?.x ?? 0) + (titleBox?.width ?? 0)).toBeLessThanOrEqual(width);
    const photo = page.locator('li img').first();
    await expect
      .poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThanOrEqual(1000);
    if (width === 375) {
      if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/media-editor-375.png`, fullPage: true });
      const primaryAction = page.getByRole('button', { name: /настроить публикацию/i });
      await expect(primaryAction).toBeInViewport();
      await expect(page.getByRole('button', { name: /сохранить и выйти/i })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /выше|ниже|переместить .* выше|переместить .* ниже/i })
      ).toHaveCount(0);
      const lastMediaAction = page.getByRole('button', { name: 'Убрать из поста: altai_lake.jpg' });
      await lastMediaAction.evaluate((element) => element.scrollIntoView({ block: 'end', behavior: 'instant' }));
      await expect(lastMediaAction).toBeInViewport();
      const actionBox = await lastMediaAction.boundingBox();
      const footerBox = await primaryAction.locator('xpath=../..').boundingBox();
      expect(actionBox).not.toBeNull();
      expect(footerBox).not.toBeNull();
      expect((actionBox?.y ?? 0) + (actionBox?.height ?? 0)).toBeLessThanOrEqual((footerBox?.y ?? 0) - 4);
      await tile.focus();
      const openPreview = page.getByRole('button', { name: 'altai_lake.jpg', exact: true });
      await expect(openPreview).toBeVisible();
      await openPreview.focus();
      await page.keyboard.press('Enter');
      const previewDialog = page.getByRole('dialog', { name: 'altai_lake.jpg' });
      await expect(previewDialog).toBeVisible();
      const cropAction = previewDialog.getByRole('button', { name: 'Кадрировать' });
      const replaceAction = previewDialog.getByRole('button', { name: 'Заменить altai_lake.jpg' });
      await expect(cropAction).toBeVisible();
      await expect(replaceAction).toBeVisible();
      const [cropBounds, replaceBounds] = await Promise.all([cropAction.boundingBox(), replaceAction.boundingBox()]);
      expect(cropBounds).not.toBeNull();
      expect(replaceBounds).not.toBeNull();
      if (cropBounds && replaceBounds) {
        expect(cropBounds.width).toBeGreaterThanOrEqual(44);
        expect(cropBounds.height).toBeGreaterThanOrEqual(44);
        expect(replaceBounds.width).toBeGreaterThanOrEqual(44);
        expect(replaceBounds.height).toBeGreaterThanOrEqual(44);
        expect(cropBounds.y).toBeGreaterThanOrEqual(0);
        expect(cropBounds.y + cropBounds.height).toBeLessThanOrEqual(812);
        expect(replaceBounds.y).toBeGreaterThanOrEqual(0);
        expect(replaceBounds.y + replaceBounds.height).toBeLessThanOrEqual(812);
        const overlaps =
          cropBounds.x < replaceBounds.x + replaceBounds.width &&
          cropBounds.x + cropBounds.width > replaceBounds.x &&
          cropBounds.y < replaceBounds.y + replaceBounds.height &&
          cropBounds.y + cropBounds.height > replaceBounds.y;
        expect(overlaps).toBe(false);
      }
      await cropAction.click();
      const cropDialog = page.getByRole('dialog', { name: 'Кадрирование фото' });
      await expect(cropDialog).toBeVisible();
      const originalRatio = cropDialog.getByRole('radio', { name: 'Оригинал' });
      const squareRatio = cropDialog.getByRole('radio', { name: '1:1' });
      await originalRatio.focus();
      await page.keyboard.press('ArrowRight');
      await expect(squareRatio).toBeChecked();
      const cropResponse = page.waitForResponse((response) => response.url().includes(`/media/${media.id}/crop?`));
      const cropRequest = page.waitForRequest((request) => request.url().includes(`/media/${media.id}/crop?`));
      await cropDialog.getByRole('button', { name: 'Готово' }).click();
      const request = await cropRequest;
      const response = await cropResponse;
      expect(response.status()).toBe(200);
      const parsedResponse = cropPostMediaResultSchema.safeParse(await response.json());
      if (!parsedResponse.success) throw new Error(JSON.stringify(parsedResponse.error.issues));
      const contentType = request.headers()['content-type'] ?? '';
      const encoded = request.postDataBuffer();
      expect(['image/jpeg', 'image/webp']).toContain(contentType);
      expect(encoded).not.toBeNull();
      expect(encoded?.byteLength ?? 0).toBeLessThanOrEqual(10_000_000);
      const dimensions = await page.evaluate(
        async ({ base64, type }) => {
          const blob = await (await fetch(`data:${type};base64,${base64}`)).blob();
          const bitmap = await createImageBitmap(blob);
          const result = { width: bitmap.width, height: bitmap.height };
          bitmap.close();
          return result;
        },
        { base64: encoded?.toString('base64') ?? '', type: contentType }
      );
      expect(dimensions.width).toBeLessThanOrEqual(2048);
      expect(dimensions.height).toBeLessThanOrEqual(2048);
      expect(Math.abs(dimensions.width / dimensions.height - 1)).toBeLessThanOrEqual(0.01);
      await expect(cropDialog).toBeHidden();
      await expect(page.locator('[data-live-announcer] [role="log"] [role="img"]')).toHaveCount(0, { timeout: 8000 });
    }

    const addMedia = page.locator('section[aria-labelledby="post-media-heading"] button').first();
    await addMedia.focus();
    await expect(addMedia).toBeFocused();
    const focusNotObscured = await page.evaluate(() => {
      const focused = document.activeElement?.getBoundingClientRect();
      const actionBar = document.querySelector('[data-testid="post-editor-action-bar"]')?.getBoundingClientRect();
      return !focused || !actionBar || focused.bottom <= actionBar.top || focused.top >= actionBar.bottom;
    });
    expect(focusNotObscured).toBe(true);
    await addMedia.evaluate((element) => element.blur());

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBe(clientWidth);
    if (width !== 320) {
      const axe = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(
        axe.violations.map((item) => `${item.id}: ${item.nodes.map((node) => node.target.join(' ')).join(' | ')}`)
      ).toEqual([]);
    }
    if (SHOTS_DIR && width !== 320) {
      await page.screenshot({ path: `${SHOTS_DIR}/media-editor-${width}.png`, fullPage: true });
    }
    expect(pageErrors).toEqual([]);
  });
}

for (const width of [375, 1440]) {
  test(`five-photo post editor matches the compact media layout at ${width}px`, async ({ page }) => {
    const height = width === 1440 ? 748 : 812;
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await mockApi(page);
    const mediaItems = photoFixtures.map(({ fileName, bytes }, position) => ({
      id: `66666666-6666-4666-8666-${String(position + 1).padStart(12, '0')}`,
      sourceMediaId: null,
      kind: 'photo',
      fileName,
      contentType: 'image/jpeg',
      sizeBytes: bytes.byteLength,
      width: 4032,
      height: 3024,
      durationMs: null,
      position
    }));
    await page.route(new RegExp(`/api/v1/posts/${ids.post}$`), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(post(ids.post, 'Невероятные пейзажи Алтая', 'draft', { media: mediaItems }))
      })
    );
    const photoById = new Map(mediaItems.map((item, index) => [item.id, photoFixtures[index]?.bytes]));
    await page.route(/\/api\/v1\/media\/[^/]+\/content$/, (route) => {
      const mediaId = new URL(route.request().url()).pathname.split('/').at(-2);
      const bytes = mediaId ? photoById.get(mediaId) : undefined;
      if (!bytes) throw new Error(`No real photo fixture for ${mediaId ?? 'unknown media'}`);
      return route.fulfill({ status: 200, contentType: 'image/jpeg', body: bytes });
    });
    await page.goto(`/posts/${ids.post}`);

    await expect(page.locator('section[aria-labelledby="post-media-heading"] ol li > div img')).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Добавить файлы' })).toBeVisible();
    for (const photo of photoFixtures) {
      const tile = page.getByRole('button', { name: photo.fileName, exact: true });
      const tileItem = page.locator('section[aria-labelledby="post-media-heading"] ol li').filter({ has: tile });
      const tileFrame = tileItem.locator('div[class*="tile"]').first();
      await expect(tile).toBeVisible();
      await expect
        .poll(() =>
          tileItem.locator('div[class*="tile"] img').evaluate((image: HTMLImageElement) => image.naturalWidth)
        )
        .toBeGreaterThanOrEqual(1000);
      const box = await tileFrame.boundingBox();
      expect(box).not.toBeNull();
      const expected = width === 375 ? 104 : 120;
      expect(Math.abs((box?.width ?? 0) - expected)).toBeLessThanOrEqual(1);
      expect(Math.abs((box?.height ?? 0) - expected)).toBeLessThanOrEqual(1);
    }
    if (width === 1440) {
      const mediaList = page.locator('section[aria-labelledby="post-media-heading"] ol').first();
      const listBounds = await mediaList.boundingBox();
      const lastPhoto = await page
        .locator('section[aria-labelledby="post-media-heading"] ol li')
        .filter({ has: page.getByRole('button', { name: 'waterfall.jpg', exact: true }) })
        .locator('div[class*="tile"]')
        .first()
        .boundingBox();
      expect(listBounds).not.toBeNull();
      expect(lastPhoto).not.toBeNull();
      expect((lastPhoto?.x ?? 0) + (lastPhoto?.width ?? 0)).toBeLessThanOrEqual(
        (listBounds?.x ?? 0) + (listBounds?.width ?? 0) + 1
      );
    }

    if (width === 1440) {
      const carousel = page.getByRole('region', { name: 'Медиа поста' });
      await expect(carousel).toHaveAttribute('aria-roledescription', 'carousel');
      await expect(carousel.getByText('1 / 5')).toBeVisible();
      await page.getByRole('button', { name: 'Следующее фото' }).click();
      await expect(carousel.getByText('2 / 5')).toBeVisible();
      await page.getByRole('button', { name: 'Предыдущее фото' }).click();
      await expect(carousel.getByText('1 / 5')).toBeVisible();
    }

    if (width === 375) {
      await expect(page.getByRole('tab')).toHaveCount(0);
      await expect(page.getByRole('textbox', { name: 'Заголовок' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Текст' })).toBeVisible();
      await expect(page.getByRole('button', { name: /настроить публикацию/i })).toBeInViewport();
      const lastTile = page.getByRole('button', { name: 'waterfall.jpg', exact: true });
      await lastTile.focus();
      const removeButton = page.getByRole('button', { name: 'Убрать из поста: waterfall.jpg' });
      await expect(removeButton).toBeVisible();
      const removeBounds = await removeButton.boundingBox();
      const footerBounds = await page.locator('main footer').boundingBox();
      expect(removeBounds).not.toBeNull();
      expect(footerBounds).not.toBeNull();
      expect((removeBounds?.y ?? 0) + (removeBounds?.height ?? 0)).toBeLessThanOrEqual(footerBounds?.y ?? 0);
      await removeButton.focus();
      await expect(removeButton).toBeFocused();
    }
    const layoutMetrics = await page.locator('main').evaluate((main) => {
      const editor = main.querySelector('[class*="editor"]');
      const actionBar = main.querySelector('footer');
      const textEditor = main.querySelector('[contenteditable="true"]');
      const textEditorStyle = textEditor ? getComputedStyle(textEditor) : undefined;
      const panes = editor?.querySelector('[class*="panes"]');
      const leftColumn = panes?.querySelector('[class*="leftColumn"]');
      const describe = (element: Element | null | undefined) =>
        element
          ? {
              name: element.tagName,
              className: typeof element.className === 'string' ? element.className : '',
              ...element.getBoundingClientRect().toJSON(),
              scrollHeight: element.scrollHeight,
              clientHeight: element.clientHeight
            }
          : undefined;
      return {
        main: { scrollHeight: main.scrollHeight, clientHeight: main.clientHeight },
        editor: editor?.getBoundingClientRect().toJSON(),
        editorChildren: editor
          ? Array.from(editor.children, (child) => ({
              name: child.tagName,
              className: typeof child.className === 'string' ? child.className : '',
              ...child.getBoundingClientRect().toJSON(),
              scrollHeight: child.scrollHeight,
              clientHeight: child.clientHeight
            }))
          : [],
        panesChildren: panes ? Array.from(panes.children, describe) : [],
        leftChildren: leftColumn ? Array.from(leftColumn.children, describe) : [],
        fields: describe(editor?.querySelector('[class*="fields"]')),
        panelBodies: editor ? Array.from(editor.querySelectorAll('[class*="body"]'), describe) : [],
        mediaSection: describe(editor?.querySelector('#post-media-heading')?.parentElement?.parentElement),
        previewColumn: describe(editor?.querySelector('[class*="previewColumn"]')),
        textEditor: textEditor?.getBoundingClientRect().toJSON(),
        textEditorStyle: textEditorStyle
          ? {
              minHeight: textEditorStyle.minHeight,
              maxHeight: textEditorStyle.maxHeight,
              height: textEditorStyle.height
            }
          : undefined,
        document: {
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: document.documentElement.clientHeight
        },
        actionBar: actionBar?.getBoundingClientRect().toJSON()
      };
    });
    if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/media-five-${width}.png`, fullPage: true });
    expect(
      layoutMetrics.main.scrollHeight - layoutMetrics.main.clientHeight,
      JSON.stringify(layoutMetrics)
    ).toBeLessThanOrEqual(1);
    expect(
      layoutMetrics.document.scrollHeight - layoutMetrics.document.clientHeight,
      JSON.stringify(layoutMetrics)
    ).toBeLessThanOrEqual(1);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBe(clientWidth);
    await expect(page.locator('[data-live-announcer] [role="log"] [role="img"]')).toHaveCount(0, { timeout: 8000 });
    const axe = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(
      await Promise.all(
        axe.violations.map(
          async (item) =>
            `${item.id}: ${await Promise.all(
              item.nodes.map(async (node) => {
                const selector = node.target.join(' ');
                const details = await page.locator(selector).evaluate((element) => {
                  const bounds = element.getBoundingClientRect();
                  return `${element.tagName.toLowerCase()} ${element.getAttribute('aria-label') ?? element.textContent?.trim()} ${Math.round(bounds.width)}x${Math.round(bounds.height)}`;
                });
                return `${selector} (${details}; ${node.any.map((check) => `${check.id}: ${check.message}`).join('; ')})`;
              })
            ).then((nodes) => nodes.join(' | '))}`
        )
      )
    ).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}

for (const width of [375, 1280]) {
  test(`empty-media editor at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 812 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await mockApi(page);
    await page.route(new RegExp(`/api/v1/posts/${ids.post}$`), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(post(ids.post, 'Empty media fixture', 'draft', { media: [] }))
      })
    );
    await page.goto(`/posts/${ids.post}`);
    await expect(page.locator('#post-media-heading')).toBeVisible();
    await expect(page.locator('section[aria-labelledby="post-media-heading"] p').last()).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(scrollWidth).toBe(clientWidth);
    const axe = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(
      axe.violations.map((item) => `${item.id}: ${item.nodes.map((node) => node.target.join(' ')).join(' | ')}`)
    ).toEqual([]);
    if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/media-empty-${width}.png`, fullPage: true });
    expect(pageErrors).toEqual([]);
  });
}
