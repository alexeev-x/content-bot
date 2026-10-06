import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, getAccessToken, getSessionExpiresAt, setSession } from '../../../shared/api/session';
import { accessToken, errorBody, widgetUser } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient, createWrapper } from '../../../test/query-wrapper';
import { NotInsideTelegramError, authKeys, signInWithMiniApp, useLogout, useSignInWidget } from '../index';

setupMswServer();

const setInitData = (initData: string) => {
  (window as unknown as { Telegram: unknown }).Telegram = { WebApp: { initData } };
};

beforeEach(() => clearSession());
afterEach(() => {
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  clearSession();
});

describe('Mini App sign-in', () => {
  it('sends initData and stores the session in memory only', async () => {
    setInitData('query_id=1&hash=abc');
    let body: unknown;
    server.use(
      http.post('*/api/v1/auth/telegram', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(accessToken('mini'));
      })
    );
    await signInWithMiniApp();
    expect(body).toEqual({ initData: 'query_id=1&hash=abc' });
    expect(getAccessToken()).toBe('mini');
    expect(getSessionExpiresAt()).toBe('2026-10-06T10:00:00.000Z');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it.each(['', undefined])('does not call the server when initData is %j', async (initData) => {
    if (initData !== undefined) setInitData(initData);
    let called = false;
    server.use(
      http.post('*/api/v1/auth/telegram', () => {
        called = true;
        return HttpResponse.json(accessToken());
      })
    );
    await expect(signInWithMiniApp()).rejects.toBeInstanceOf(NotInsideTelegramError);
    expect(called).toBe(false);
  });
});

describe('widget sign-in', () => {
  it('posts the widget object unchanged, extra fields included, without a Bearer', async () => {
    setSession(accessToken('old'));
    let body: unknown;
    let auth: string | null = 'unset';
    server.use(
      http.post('*/api/v1/auth/telegram-widget', async ({ request }) => {
        body = await request.json();
        auth = request.headers.get('Authorization');
        return HttpResponse.json(accessToken('widget'));
      })
    );
    const { result } = renderHook(() => useSignInWidget(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync(widgetUser);
    });
    expect(body).toEqual(widgetUser);
    expect(auth).toBeNull();
    expect(getAccessToken()).toBe('widget');
  });

  it('does not set a session on a rejected sign-in and never retries', async () => {
    let calls = 0;
    server.use(
      http.post('*/api/v1/auth/telegram-widget', () => {
        calls += 1;
        return HttpResponse.json(errorBody('UNAUTHORIZED'), { status: 401 });
      })
    );
    const { result } = renderHook(() => useSignInWidget(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync(widgetUser).catch(() => undefined);
    });
    expect(calls).toBe(1);
    expect(getAccessToken()).toBeNull();
  });
});

describe('logout', () => {
  it('clears the query cache and the session after the server confirmed', async () => {
    setSession(accessToken('live'));
    const client = createTestQueryClient();
    client.setQueryData(authKeys.me(), { telegramId: '1', name: 'Owner' });
    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper(client) });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(getAccessToken()).toBeNull();
    expect(client.getQueryData(authKeys.me())).toBeUndefined();
  });

  it('signs out locally even when the server call fails', async () => {
    setSession(accessToken('live'));
    server.use(http.post('*/api/v1/auth/logout', () => HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 })));
    const client = createTestQueryClient();
    client.setQueryData(authKeys.me(), { telegramId: '1', name: 'Owner' });
    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper(client) });
    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });
    expect(getAccessToken()).toBeNull();
    expect(client.getQueryData(authKeys.me())).toBeUndefined();
  });
});
