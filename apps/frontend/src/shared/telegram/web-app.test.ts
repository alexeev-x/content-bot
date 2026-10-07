import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bindBackButton,
  disableVerticalSwipes,
  isInsideTelegram,
  setClosingConfirmation,
  setTelegramColors,
  syncTelegramViewport
} from './web-app';

type Handler = () => void;

function installTelegram(version: string, initData = 'query_id=1&hash=x') {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  const handlers = new Map<string, Handler>();
  const webApp = {
    initData,
    colorScheme: 'light',
    isVersionAtLeast: (v: string) => {
      const [a = 0, b = 0] = v.split('.').map(Number);
      return major > a || (major === a && minor >= b);
    },
    safeAreaInset: { top: 1, bottom: 2, left: 3, right: 4 },
    contentSafeAreaInset: { top: 10, bottom: 20, left: 30, right: 40 },
    viewportStableHeight: 600,
    BackButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() },
    disableVerticalSwipes: vi.fn(),
    enableClosingConfirmation: vi.fn(),
    disableClosingConfirmation: vi.fn(),
    setHeaderColor: vi.fn(),
    setBackgroundColor: vi.fn(),
    setBottomBarColor: vi.fn(),
    onEvent: vi.fn((event: string, handler: Handler) => handlers.set(event, handler)),
    offEvent: vi.fn((event: string) => handlers.delete(event))
  };
  (window as unknown as { Telegram: unknown }).Telegram = { WebApp: webApp };
  return { webApp, handlers };
}

afterEach(() => {
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  document.documentElement.removeAttribute('style');
});

describe('telegram wrapper', () => {
  it('is false outside Telegram', () => {
    expect(isInsideTelegram()).toBe(false);
  });
  it('is false with empty initData', () => {
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: { initData: '' } };
    expect(isInsideTelegram()).toBe(false);
  });
  it('is true with non-empty initData', () => {
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: { initData: 'query_id=1&hash=x' } };
    expect(isInsideTelegram()).toBe(true);
  });
});

describe('outside Telegram every call is a no-op', () => {
  it('does not throw and sets nothing', () => {
    const off = bindBackButton(() => {});
    disableVerticalSwipes();
    setClosingConfirmation(true);
    setClosingConfirmation(false);
    setTelegramColors({ header: '#000000', background: '#000000', bottomBar: '#000000' });
    const unsubscribe = syncTelegramViewport();
    off();
    unsubscribe();
    expect(document.documentElement.getAttribute('style')).toBeNull();
  });

  it('does nothing with empty initData even when the methods exist', () => {
    const { webApp } = installTelegram('9.1', '');
    bindBackButton(() => {});
    disableVerticalSwipes();
    setClosingConfirmation(true);
    expect(webApp.BackButton.show).not.toHaveBeenCalled();
    expect(webApp.disableVerticalSwipes).not.toHaveBeenCalled();
    expect(webApp.enableClosingConfirmation).not.toHaveBeenCalled();
  });
});

describe('BackButton', () => {
  it('shows with the handler and hides again on cleanup', () => {
    const { webApp } = installTelegram('9.1');
    const onBack = vi.fn();
    const off = bindBackButton(onBack);
    expect(webApp.BackButton.onClick).toHaveBeenCalledWith(onBack);
    expect(webApp.BackButton.show).toHaveBeenCalledTimes(1);
    off();
    expect(webApp.BackButton.offClick).toHaveBeenCalledWith(onBack);
    expect(webApp.BackButton.hide).toHaveBeenCalledTimes(1);
  });

  it('is skipped before Bot API 6.1', () => {
    const { webApp } = installTelegram('6.0');
    bindBackButton(() => {})();
    expect(webApp.BackButton.show).not.toHaveBeenCalled();
    expect(webApp.BackButton.hide).not.toHaveBeenCalled();
  });
});

describe('closing confirmation and swipes', () => {
  it('toggles confirmation', () => {
    const { webApp } = installTelegram('9.1');
    setClosingConfirmation(true);
    expect(webApp.enableClosingConfirmation).toHaveBeenCalledTimes(1);
    setClosingConfirmation(false);
    expect(webApp.disableClosingConfirmation).toHaveBeenCalledTimes(1);
  });

  it('skips confirmation before 6.2 and swipes before 7.7', () => {
    const { webApp } = installTelegram('6.1');
    setClosingConfirmation(true);
    disableVerticalSwipes();
    expect(webApp.enableClosingConfirmation).not.toHaveBeenCalled();
    expect(webApp.disableVerticalSwipes).not.toHaveBeenCalled();
  });

  it('disables vertical swipes from 7.7', () => {
    const { webApp } = installTelegram('7.7');
    disableVerticalSwipes();
    expect(webApp.disableVerticalSwipes).toHaveBeenCalledTimes(1);
  });
});

describe('colors', () => {
  const colors = { header: '#111111', background: '#222222', bottomBar: '#333333' };

  it('sets all three on a current client', () => {
    const { webApp } = installTelegram('9.1');
    setTelegramColors(colors);
    expect(webApp.setHeaderColor).toHaveBeenCalledWith('#111111');
    expect(webApp.setBackgroundColor).toHaveBeenCalledWith('#222222');
    expect(webApp.setBottomBarColor).toHaveBeenCalledWith('#333333');
  });

  it('guards each call by its own version: hex needs 6.9, the bottom bar 7.10', () => {
    const old = installTelegram('6.8');
    setTelegramColors(colors);
    expect(old.webApp.setHeaderColor).not.toHaveBeenCalled();
    expect(old.webApp.setBackgroundColor).not.toHaveBeenCalled();

    const mid = installTelegram('7.9');
    setTelegramColors(colors);
    expect(mid.webApp.setHeaderColor).toHaveBeenCalledTimes(1);
    expect(mid.webApp.setBottomBarColor).not.toHaveBeenCalled();
  });
});

describe('viewport and insets', () => {
  const style = () => document.documentElement.style;

  it('writes CSS variables now and on every event, then unsubscribes', () => {
    const { webApp, handlers } = installTelegram('9.1');
    const off = syncTelegramViewport();
    expect(style().getPropertyValue('--tg-content-safe-area-inset-top')).toBe('10px');
    expect(style().getPropertyValue('--tg-safe-area-inset-left')).toBe('3px');
    expect(style().getPropertyValue('--tg-viewport-stable-height')).toBe('600px');
    expect([...handlers.keys()].sort()).toEqual(['contentSafeAreaChanged', 'safeAreaChanged', 'viewportChanged']);

    webApp.contentSafeAreaInset = { top: 55, bottom: 0, left: 0, right: 0 };
    webApp.viewportStableHeight = 480;
    handlers.get('contentSafeAreaChanged')?.();
    expect(style().getPropertyValue('--tg-content-safe-area-inset-top')).toBe('55px');
    handlers.get('viewportChanged')?.();
    expect(style().getPropertyValue('--tg-viewport-stable-height')).toBe('480px');

    off();
    expect(webApp.offEvent).toHaveBeenCalledTimes(3);
  });
});
