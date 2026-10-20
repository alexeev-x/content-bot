// The only module that touches window.Telegram. Inside Telegram = non-empty initData (never the User-Agent).
// Method names and minimum Bot API versions: https://core.telegram.org/bots/webapps
type Inset = { top: number; bottom: number; left: number; right: number };

type TelegramWebApp = {
  initData: string;
  colorScheme: 'light' | 'dark';
  isVersionAtLeast?(version: string): boolean;
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: Inset;
  contentSafeAreaInset?: Inset;
  BackButton?: {
    show(): void;
    hide(): void;
    onClick(handler: () => void): void;
    offClick(handler: () => void): void;
  };
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  onEvent(event: string, handler: () => void): void;
  offEvent(event: string, handler: () => void): void;
};

/** Minimum Bot API version per feature. Hex colors for header and background need 6.9 (keywords only before). */
const SINCE = {
  backButton: '6.1',
  closingConfirmation: '6.2',
  hexColors: '6.9',
  bottomBarColor: '7.10',
  verticalSwipes: '7.7'
} as const;

function getWebApp(): TelegramWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

export function isInsideTelegram(): boolean {
  const initData = getWebApp()?.initData;
  return typeof initData === 'string' && initData.length > 0;
}

/** Raw initData for sign-in; undefined outside Telegram (never send an empty value). */
export function getInitData(): string | undefined {
  const initData = getWebApp()?.initData;
  return typeof initData === 'string' && initData.length > 0 ? initData : undefined;
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

/** Telegram resizes the Mini App viewport (keyboard, expand); the browser's visualViewport may not see it. */
export function subscribeViewportChanged(handler: () => void): () => void {
  return subscribe('viewportChanged', handler);
}

/** The app when it is inside Telegram and supports `since`; otherwise undefined, so every caller is a no-op. */
function appSupporting(since: string): TelegramWebApp | undefined {
  const app = getWebApp();
  if (!app || !isInsideTelegram()) return undefined;
  return typeof app.isVersionAtLeast === 'function' && app.isVersionAtLeast(since) ? app : undefined;
}

/** Shows Telegram's BackButton and routes its press to `onClick`; the returned function hides it again. */
export function bindBackButton(onClick: () => void): () => void {
  const app = appSupporting(SINCE.backButton);
  const button = app?.BackButton;
  if (!button) return () => {};
  button.onClick(onClick);
  button.show();
  return () => {
    button.offClick(onClick);
    button.hide();
  };
}

/** Pulling down to scroll must not close the app (Bot API 7.7). */
export function disableVerticalSwipes(): void {
  appSupporting(SINCE.verticalSwipes)?.disableVerticalSwipes?.();
}

/** Telegram asks before closing while enabled (Bot API 6.2). */
export function setClosingConfirmation(enabled: boolean): void {
  const app = appSupporting(SINCE.closingConfirmation);
  if (enabled) app?.enableClosingConfirmation?.();
  else app?.disableClosingConfirmation?.();
}

export type TelegramColors = { header: string; background: string; bottomBar: string };

/** `#RRGGBB` colors for Telegram's own chrome; each call is guarded by its own Bot API version. */
export function setTelegramColors(colors: TelegramColors): void {
  const hex = appSupporting(SINCE.hexColors);
  hex?.setHeaderColor?.(colors.header);
  hex?.setBackgroundColor?.(colors.background);
  appSupporting(SINCE.bottomBarColor)?.setBottomBarColor?.(colors.bottomBar);
}

function setInsets(prefix: string, inset: Inset | undefined): void {
  if (!inset) return;
  const style = document.documentElement.style;
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    style.setProperty(`--tg-${prefix}-${side}`, `${inset[side]}px`);
  }
}

/**
 * Mirrors Telegram's insets and stable viewport height into CSS variables on <html>
 * (`--tg-safe-area-inset-*`, `--tg-content-safe-area-inset-*`, `--tg-viewport-stable-height`) and keeps them
 * current on viewport and inset events. The returned function unsubscribes.
 */
export function syncTelegramViewport(): () => void {
  const app = appSupporting('6.0');
  if (!app) return () => {};
  const apply = () => {
    setInsets('safe-area-inset', app.safeAreaInset);
    setInsets('content-safe-area-inset', app.contentSafeAreaInset);
    if (typeof app.viewportStableHeight === 'number') {
      document.documentElement.style.setProperty('--tg-viewport-stable-height', `${app.viewportStableHeight}px`);
    }
  };
  apply();
  const offs = ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged'].map((event) => subscribe(event, apply));
  return () => offs.forEach((off) => off());
}
