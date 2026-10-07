import type { Page } from '@playwright/test';

export type TelegramCall = { method: string; args: unknown[] };

/**
 * Mini App mode: blocks the real telegram-web-app.js and installs a fake `window.Telegram.WebApp` with
 * non-empty initData. Every call is recorded in `window.__tgCalls`.
 */
export async function installFakeTelegram(page: Page, version = '9.1'): Promise<void> {
  await page.route('https://telegram.org/js/telegram-web-app.js', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' })
  );
  await page.addInitScript((appVersion: string) => {
    const calls: { method: string; args: unknown[] }[] = [];
    const record =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push({ method, args });
      };
    const [major = 0, minor = 0] = appVersion.split('.').map(Number);
    (window as unknown as Record<string, unknown>)['__tgCalls'] = calls;
    (window as unknown as Record<string, unknown>)['Telegram'] = {
      WebApp: {
        initData: 'query_id=e2e&hash=e2e',
        colorScheme: 'light',
        version: appVersion,
        isVersionAtLeast: (v: string) => {
          const [a = 0, b = 0] = v.split('.').map(Number);
          return major > a || (major === a && minor >= b);
        },
        safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
        contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
        viewportStableHeight: window.innerHeight,
        BackButton: {
          show: record('BackButton.show'),
          hide: record('BackButton.hide'),
          onClick: record('BackButton.onClick'),
          offClick: record('BackButton.offClick')
        },
        ready: record('ready'),
        expand: record('expand'),
        disableVerticalSwipes: record('disableVerticalSwipes'),
        enableClosingConfirmation: record('enableClosingConfirmation'),
        disableClosingConfirmation: record('disableClosingConfirmation'),
        setHeaderColor: record('setHeaderColor'),
        setBackgroundColor: record('setBackgroundColor'),
        setBottomBarColor: record('setBottomBarColor'),
        onEvent: record('onEvent'),
        offEvent: record('offEvent')
      }
    };
  }, version);
}

export async function telegramCalls(page: Page): Promise<TelegramCall[]> {
  return page.evaluate(() => [...((window as unknown as { __tgCalls?: TelegramCall[] }).__tgCalls ?? [])]);
}
