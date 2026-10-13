import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, getAccessToken } from '../../shared/api/session';
import { server, setupMswServer } from '../../test/msw';
import { bootstrapSession } from './bootstrap';

setupMswServer();

describe('bootstrapSession', () => {
  beforeEach(() => {
    clearSession();
    window.history.replaceState({}, '', '/__proto/analytics');
    vi.stubGlobal('__LOCAL_SIGN_IN__', true);
  });

  afterEach(() => {
    clearSession();
    window.history.replaceState({}, '', '/');
    vi.unstubAllGlobals();
  });

  it('does not sign in or create a session for a mock-only prototype route', async () => {
    let localSignIns = 0;
    server.use(
      http.post('*/api/v1/auth/local', () => {
        localSignIns += 1;
        return HttpResponse.json({ accessToken: 'local', expiresAt: '2099-01-01T00:00:00.000Z' });
      })
    );

    expect(await bootstrapSession()).toEqual({ kind: 'done' });
    expect(localSignIns).toBe(0);
    expect(getAccessToken()).toBeNull();
  });
});
