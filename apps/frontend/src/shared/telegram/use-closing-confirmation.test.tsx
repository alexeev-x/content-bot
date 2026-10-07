import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useClosingConfirmation } from './use-closing-confirmation';

function installTelegram() {
  const webApp = {
    initData: 'query_id=1&hash=x',
    isVersionAtLeast: () => true,
    enableClosingConfirmation: vi.fn(),
    disableClosingConfirmation: vi.fn()
  };
  (window as unknown as { Telegram: unknown }).Telegram = { WebApp: webApp };
  return webApp;
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { Telegram?: unknown }).Telegram;
});

describe('useClosingConfirmation', () => {
  it('follows the dirty state and turns off on unmount', () => {
    const webApp = installTelegram();
    const { rerender, unmount } = renderHook(({ dirty }) => useClosingConfirmation(dirty), {
      initialProps: { dirty: false }
    });
    expect(webApp.enableClosingConfirmation).not.toHaveBeenCalled();
    rerender({ dirty: true });
    expect(webApp.enableClosingConfirmation).toHaveBeenCalledTimes(1);
    rerender({ dirty: false });
    expect(webApp.disableClosingConfirmation).toHaveBeenCalledTimes(1);
    rerender({ dirty: true });
    unmount();
    expect(webApp.disableClosingConfirmation).toHaveBeenCalledTimes(2);
  });

  it('stays on until the last dirty form is clean', () => {
    const webApp = installTelegram();
    const first = renderHook(() => useClosingConfirmation(true));
    const second = renderHook(() => useClosingConfirmation(true));
    first.unmount();
    expect(webApp.disableClosingConfirmation).not.toHaveBeenCalled();
    second.unmount();
    expect(webApp.disableClosingConfirmation).toHaveBeenCalledTimes(1);
  });

  it('does nothing outside Telegram', () => {
    expect(() => renderHook(() => useClosingConfirmation(true)).unmount()).not.toThrow();
  });
});
