import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const template = new URL('./composer-template.html', import.meta.url);
const screens = ['editor', 'emoji', 'media', 'compare', 'poll', 'settings'];
const browser = await chromium.launch({ headless: true });
try {
  for (const device of ['desktop', 'mobile']) {
    const mobile = device === 'mobile';
    const context = await browser.newContext({
      viewport: { width: mobile ? 390 : 1440, height: mobile ? 844 : 760 },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
      locale: 'ru-RU',
      reducedMotion: 'reduce'
    });
    const page = await context.newPage();
    for (const screen of screens) {
      const view = ['poll', 'settings'].includes(screen) ? screen : 'editor';
      const mode = ['emoji', 'media', 'compare'].includes(screen) ? screen : '';
      const url = new URL(template.href);
      url.searchParams.set('view', view);
      url.searchParams.set('device', device);
      if (mode) url.searchParams.set('mode', mode);
      await page.goto(url.href, { waitUntil: 'load' });
      await page.locator('#root .app').waitFor({ state: 'visible' });
      const output = new URL(`./compose_${device}_${screen}.png`, import.meta.url);
      await page.screenshot({ path: fileURLToPath(output), animations: 'disabled' });
      console.log(output.pathname);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
