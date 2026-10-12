import { expect, test } from '@playwright/test';
import { ids, mockApi } from './support/mock-api';

test('returning from the post editor focuses the Posts heading on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockApi(page);
  await page.goto(`/posts/${ids.post}`);

  await expect(page.locator('input[name="title"]')).toBeVisible();
  await page.locator('main header button[aria-label]').first().click();

  await expect(page).toHaveURL(/\/posts(?:\?.*)?$/);
  await expect(page.getByRole('heading', { name: 'Посты', level: 1 })).toBeFocused();
});
