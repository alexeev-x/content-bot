// Safe-area CSS variables (--tg-content-safe-area-inset-*) are set by telegram-web-app.js itself.
// The only module that touches window.Telegram. Inside Telegram = non-empty initData (never the User-Agent).
type TelegramWebApp = {
  initData: string;
  colorScheme: 'light' | 'dark';
  ready(): void;
  expand(): void;
  onEvent(event: string, handler: () => void): void;
  offEvent(event: string, handler: () => void): void;
};

function getWebApp(): TelegramWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

export function isInsideTelegram(): boolean {
  const initData = getWebApp()?.initData;
  return typeof initData === 'string' && initData.length > 0;
}

/** Tells Telegram the app is ready and expands it. No fullscreen mode. No-op outside Telegram. */
export function initTelegram(): void {
  if (!isInsideTelegram()) return;
  const app = getWebApp();
  app?.ready();
  app?.expand();
}

export function getTelegramColorScheme(): 'light' | 'dark' | undefined {
  if (!isInsideTelegram()) return undefined;
  return getWebApp()?.colorScheme;
}

function subscribe(event: string, handler: () => void): () => void {
  const app = getWebApp();
  if (!isInsideTelegram() || !app) return () => {};
  app.onEvent(event, handler);
  return () => app.offEvent(event, handler);
}

export function subscribeThemeChanged(handler: () => void): () => void {
  return subscribe('themeChanged', handler);
}
