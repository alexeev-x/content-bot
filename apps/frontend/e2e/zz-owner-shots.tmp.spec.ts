import { expect, test } from '@playwright/test';
import { mockApi } from './support/mock-api';
const dir = process.env.SHOTS!;
for (const scheme of ['dark', 'light'] as const)
for (const width of [1440, 1280, 375]) {
  test(`home ${scheme} ${width}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await page.route('**/api/v1/dashboard**', async (r) => { await new Promise((x) => setTimeout(x, 1500)); await r.fallback(); });
    await page.goto('/');
    await page.waitForTimeout(700);
    const h = () => page.evaluate(() => [...document.querySelectorAll('main section')].map((s) => Math.round(s.getBoundingClientRect().height)).join(','));
    const h0 = await h();
    await page.screenshot({ path: `${dir}/r-${scheme}-${width}-loading.png`, fullPage: width === 375 });
    await page.waitForTimeout(2500);
    const h1 = await h();
    await page.screenshot({ path: `${dir}/r-${scheme}-${width}.png`, fullPage: width === 375 });
    console.log(scheme, width, 'loading', h0, 'loaded', h1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(errors).toEqual([]);
  });
}
