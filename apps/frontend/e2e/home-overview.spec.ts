import { expect, test } from '@playwright/test';

test.describe('prototype overview navigation', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('approved unscheduled posts open their editor and weekday links open upcoming publications', async ({
    page
  }) => {
    await page.goto('/__proto');

    const approvedPosts = page.locator('[data-area="approved"] a[href*="/posts/"]');
    await expect(approvedPosts.first()).toBeVisible();
    const postHref = await approvedPosts.first().getAttribute('href');
    expect(postHref).toMatch(/^\/__proto\/posts\/[^/]+$/);
    await approvedPosts.first().click();
    await expect(page).toHaveURL(new RegExp(`${postHref}$`));

    await page.goto('/__proto');
    const weekdays = page.locator('[data-area="week"] ul[aria-label="Публикации по дням недели"] a');
    await expect(weekdays).toHaveCount(7);
    await weekdays.first().click();
    await expect(page).toHaveURL(/\/__proto\/publications\?view=upcoming$/);
  });
});
