import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postSchema } from '@alexeev/contracts';
import { errorBody, ids, post, accessToken } from '../../test/fixtures';
import { server, setupMswServer } from '../../test/msw';
import {
  ApiError,
  apiRequest,
  cancelSessionRenewal,
  parseRetryAfter,
  refreshSession,
  whenRefreshIdle
} from './http-client';
import { clearSession, getAccessToken, setSession } from './session';

setupMswServer();

const get = () => apiRequest(`/api/v1/posts/${ids.post}`, postSchema);
const unauthorized = () => HttpResponse.json(errorBody('UNAUTHORIZED'), { status: 401 });

/** Resource accepts only `valid`; records every Authorization header it sees. */
function protectedResource(valid: string) {
  const seen: Array<string | null> = [];
  server.use(
    http.get('*/api/v1/posts/:id', ({ request }) => {
      const header = request.headers.get('Authorization');
      seen.push(header);
      return header === `Bearer ${valid}` ? HttpResponse.json(post()) : unauthorized();
    })
  );
  return seen;
}

function countRefresh(next: () => Response | Promise<Response>) {
  const calls = { count: 0, credentials: [] as string[], auth: [] as Array<string | null> };
  server.use(
    http.post('*/api/v1/auth/refresh', ({ request }) => {
      calls.count += 1;
      calls.credentials.push(request.credentials);
      calls.auth.push(request.headers.get('Authorization'));
      return next();
    })
  );
  return calls;
}

beforeEach(() => {
  clearSession();
  setSession(accessToken('stale'));
});
afterEach(() => clearSession());

describe('http client re-authentication', () => {
  it('sends the Bearer token from memory', async () => {
    const seen = protectedResource('stale');
    await get();
    expect(seen).toEqual(['Bearer stale']);
  });

  it('refreshes once on 401 and retries the request once with the new token', async () => {
    const seen = protectedResource('fresh');
    const refresh = countRefresh(() => HttpResponse.json(accessToken('fresh')));
    await expect(get()).resolves.toMatchObject({ id: ids.post });
    expect(refresh.count).toBe(1);
    expect(seen).toEqual(['Bearer stale', 'Bearer fresh']);
    expect(getAccessToken()).toBe('fresh');
  });

  it('shares one refresh between concurrent 401s', async () => {
    const seen = protectedResource('fresh');
    const refresh = countRefresh(async () => {
      await delay(30);
      return HttpResponse.json(accessToken('fresh'));
    });
    const results = await Promise.all([get(), get(), get()]);
    expect(results).toHaveLength(3);
    expect(refresh.count).toBe(1);
    expect(seen.filter((h) => h === 'Bearer stale')).toHaveLength(3);
    expect(seen.filter((h) => h === 'Bearer fresh')).toHaveLength(3);
  });

  it('retries with the renewed token, without a second refresh, when it changed while the request was in flight', async () => {
    const seen: Array<string | null> = [];
    server.use(
      http.get('*/api/v1/posts/:id', async ({ request }) => {
        const header = request.headers.get('Authorization');
        seen.push(header);
        if (header === 'Bearer fresh') return HttpResponse.json(post());
        await delay(30);
        return unauthorized();
      })
    );
    const refresh = countRefresh(() => HttpResponse.json(accessToken('unexpected')));
    const pending = get();
    await delay(5);
    setSession(accessToken('fresh')); // renewed by a parallel request while this one was in flight
    await expect(pending).resolves.toMatchObject({ id: ids.post });
    expect(refresh.count).toBe(0);
    expect(seen).toEqual(['Bearer stale', 'Bearer fresh']);
  });

  it('sends the refresh with credentials and the current Bearer', async () => {
    protectedResource('fresh');
    const refresh = countRefresh(() => HttpResponse.json(accessToken('fresh')));
    await get();
    expect(refresh.credentials).toEqual(['include']);
    expect(refresh.auth).toEqual(['Bearer stale']);
  });

  it('runs a reload only after the refresh in flight has finished (a cut refresh signs the owner out)', async () => {
    let release: (() => void) | undefined;
    countRefresh(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return HttpResponse.json(accessToken('fresh'));
    });
    const refreshing = refreshSession();
    await vi.waitFor(() => expect(release).toBeDefined());
    const reload = vi.fn();
    const waiting = whenRefreshIdle(reload);
    await delay(20);
    expect(reload).not.toHaveBeenCalled();
    release?.();
    await refreshing;
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    void waiting;
  });

  it('reloads under the refresh lock and frees it when the page stays (a cancelled leave prompt)', async () => {
    vi.useFakeTimers();
    let held: Promise<unknown> | undefined;
    const request = vi.fn((_name: string, callback: () => Promise<unknown>) => {
      held = callback();
      return held;
    });
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
    try {
      const reload = vi.fn();
      const done = whenRefreshIdle(reload);
      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      expect(request.mock.calls[0]?.[0]).toBe('alexeev-refresh');
      let released = false;
      void held?.then(() => {
        released = true;
      });
      await vi.advanceTimersByTimeAsync(9_000);
      expect(released).toBe(false);
      // The page did not unload: the lock must not stay held, or every refresh would queue forever.
      await vi.advanceTimersByTimeAsync(2_000);
      expect(released).toBe(true);
      await done;
    } finally {
      vi.useRealTimers();
      delete (navigator as unknown as { locks?: unknown }).locks;
    }
  });

  it('clears the session and reports the 401 when the refresh fails', async () => {
    const seen = protectedResource('never');
    const refresh = countRefresh(unauthorized);
    const error = await get().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(refresh.count).toBe(1);
    expect(seen).toHaveLength(1);
    expect(getAccessToken()).toBeNull();
  });

  it('surfaces a transient refresh failure (503) and clears the dead token', async () => {
    protectedResource('never');
    countRefresh(() => HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 }));
    const error = await get().catch((e: unknown) => e);
    expect((error as ApiError).status).toBe(503);
    expect(getAccessToken()).toBeNull();
  });

  it('never loops: a 401 after a successful refresh ends the session', async () => {
    const seen = protectedResource('never');
    const refresh = countRefresh(() => HttpResponse.json(accessToken('fresh')));
    await expect(get()).rejects.toMatchObject({ status: 401 });
    expect(refresh.count).toBe(1);
    expect(seen).toHaveLength(2);
    expect(getAccessToken()).toBeNull();
  });

  it('allows a new refresh after the previous one settled', async () => {
    protectedResource('fresh');
    const refresh = countRefresh(() => HttpResponse.json(accessToken('fresh')));
    await get();
    setSession(accessToken('stale'));
    await get();
    expect(refresh.count).toBe(2);
  });
});

describe('http client errors and cancellation', () => {
  it('exposes Retry-After seconds on 429', async () => {
    server.use(
      http.get('*/api/v1/posts/:id', () =>
        HttpResponse.json(errorBody('RATE_LIMIT'), { status: 429, headers: { 'Retry-After': '12' } })
      )
    );
    await expect(get()).rejects.toMatchObject({ code: 'RATE_LIMIT', status: 429, retryAfterSeconds: 12 });
  });

  it('parses Retry-After as seconds or HTTP date', () => {
    expect(parseRetryAfter('7')).toBe(7);
    expect(parseRetryAfter('Tue, 06 Oct 2026 09:00:30 GMT', Date.parse('2026-10-06T09:00:00Z'))).toBe(30);
    expect(parseRetryAfter('garbage')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it('falls back to the status when the error body is not a contract error', async () => {
    server.use(http.get('*/api/v1/posts/:id', () => HttpResponse.text('<html>', { status: 502 })));
    await expect(get()).rejects.toMatchObject({ code: 'UNAVAILABLE', status: 502 });
  });

  it('rejects a success response that does not match the contract schema', async () => {
    server.use(http.get('*/api/v1/posts/:id', () => HttpResponse.json({ id: 'not-a-uuid' })));
    await expect(get()).rejects.toMatchObject({ code: 'UNAVAILABLE', message: 'Unexpected response shape' });
  });

  it('maps a network failure to UNAVAILABLE with status 0', async () => {
    server.use(http.get('*/api/v1/posts/:id', () => HttpResponse.error()));
    await expect(get()).rejects.toMatchObject({ code: 'UNAVAILABLE', status: 0 });
  });

  it('passes an aborted request through as an abort, not an ApiError', async () => {
    server.use(
      http.get('*/api/v1/posts/:id', async () => {
        await delay(100);
        return HttpResponse.json(post());
      })
    );
    const controller = new AbortController();
    const pending = apiRequest(`/api/v1/posts/${ids.post}`, postSchema, { signal: controller.signal });
    controller.abort();
    const error = await pending.catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).name).toBe('AbortError');
  });
});

describe('session lifecycle races', () => {
  it('does not start a second refresh for a late 401 of a token generation whose refresh already failed', async () => {
    let resourceCalls = 0;
    server.use(
      http.get('*/api/v1/posts/:id', async () => {
        resourceCalls += 1;
        if (resourceCalls === 2) await delay(60); // answers 401 after the first request's refresh failed
        return unauthorized();
      })
    );
    const refresh = countRefresh(unauthorized);
    const results = await Promise.allSettled([get(), get()]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(refresh.count).toBe(1);
  });

  it('keeps a newer session when a stale refresh fails', async () => {
    protectedResource('never');
    countRefresh(async () => {
      await delay(50);
      return unauthorized();
    });
    const pending = get().catch((e: unknown) => e);
    await delay(10);
    setSession(accessToken('newer')); // sign-in finished while the old refresh was in flight
    await pending;
    expect(getAccessToken()).toBe('newer');
  });

  it('does not re-install a session when logout happened during a refresh', async () => {
    protectedResource('resurrected');
    countRefresh(async () => {
      await delay(50);
      return HttpResponse.json(accessToken('resurrected'));
    });
    const pending = get().catch((e: unknown) => e);
    await delay(10);
    cancelSessionRenewal(); // what logout does before its request
    clearSession();
    await pending;
    await delay(70);
    expect(getAccessToken()).toBeNull();
  });
});

describe('proactive renewal', () => {
  const start = Date.parse('2026-10-06T09:00:00.000Z');
  const inMinutes = (m: number) => new Date(start + m * 60_000).toISOString();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
    vi.setSystemTime(start);
  });
  afterEach(() => {
    clearSession();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renews with the still-valid Bearer before the token expires', async () => {
    const refresh = countRefresh(() => HttpResponse.json({ accessToken: 'renewed', expiresAt: inMinutes(120) }));
    setSession({ accessToken: 't1', expiresAt: inMinutes(60) });
    await vi.advanceTimersByTimeAsync(55 * 60_000);
    expect(refresh.count).toBe(1);
    expect(refresh.auth).toEqual(['Bearer t1']);
    expect(getAccessToken()).toBe('renewed');
  });

  it('keeps a still-valid token on a transient failure and retries before expiry', async () => {
    let calls = 0;
    const refresh = countRefresh(() => {
      calls += 1;
      return calls === 1
        ? HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 })
        : HttpResponse.json({ accessToken: 'renewed', expiresAt: inMinutes(120) });
    });
    setSession({ accessToken: 't1', expiresAt: inMinutes(60) });
    await vi.advanceTimersToNextTimerAsync();
    expect(refresh.count).toBe(1);
    expect(getAccessToken()).toBe('t1');
    await vi.advanceTimersByTimeAsync(61_000);
    expect(refresh.count).toBe(2);
    expect(getAccessToken()).toBe('renewed');
  });

  it('clears the session when renewal is refused with 401', async () => {
    countRefresh(unauthorized);
    setSession({ accessToken: 't1', expiresAt: inMinutes(60) });
    await vi.advanceTimersByTimeAsync(55 * 60_000);
    expect(getAccessToken()).toBeNull();
  });

  it('stops the timer when the session is cleared', async () => {
    const refresh = countRefresh(() => HttpResponse.json(accessToken('x')));
    setSession({ accessToken: 't1', expiresAt: inMinutes(60) });
    clearSession();
    await vi.advanceTimersByTimeAsync(120 * 60_000);
    expect(refresh.count).toBe(0);
  });

  it('renews on return to a visible tab when the timer was frozen past its due time', async () => {
    const refresh = countRefresh(() => HttpResponse.json({ accessToken: 'renewed', expiresAt: inMinutes(180) }));
    setSession({ accessToken: 't1', expiresAt: inMinutes(5) }, { serverTime: start });
    const now = performance.now();
    vi.spyOn(performance, 'now').mockReturnValue(now + 3 * 60_000); // device slept: the timer never fired
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10);
    expect(refresh.count).toBe(1);
  });

  it('ignores visibility changes while the renewal timer is still on schedule', async () => {
    const refresh = countRefresh(() => HttpResponse.json(accessToken('x')));
    setSession({ accessToken: 't1', expiresAt: inMinutes(4) }, { serverTime: start });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10);
    expect(refresh.count).toBe(0);
  });

  it('does not refresh on every visibility event: minimum interval and retry budget apply', async () => {
    const refresh = countRefresh(() => HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 }));
    setSession({ accessToken: 't1', expiresAt: inMinutes(5) }, { serverTime: start });
    const now = performance.now();
    vi.spyOn(performance, 'now').mockReturnValue(now + 3 * 60_000);
    for (let i = 0; i < 40; i += 1) {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(10);
    }
    expect(refresh.count).toBe(1);
  });

  it('gives a new sign-in a fresh transient-retry budget', async () => {
    const refresh = countRefresh(() => HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 }));
    setSession({ accessToken: 't0', expiresAt: inMinutes(60) }, { serverTime: start });
    await vi.advanceTimersByTimeAsync(59 * 60_000);
    const first = refresh.count;
    expect(first).toBe(4);
    setSession(
      { accessToken: 't1', expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() },
      { serverTime: Date.now() }
    );
    await vi.advanceTimersByTimeAsync(59 * 60_000);
    expect(refresh.count).toBe(first + 4);
  });

  it('does not send a refresh that was queued behind the lock when logout happened meanwhile', async () => {
    let open: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const request = vi.fn((_name: string, callback: () => Promise<unknown>) => gate.then(callback));
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
    try {
      const refresh = countRefresh(() => HttpResponse.json(accessToken('resurrected')));
      setSession({ accessToken: 't0', expiresAt: inMinutes(60) }, { serverTime: start });
      const queued = refreshSession().catch((e: unknown) => e);
      cancelSessionRenewal(); // logout
      clearSession();
      open();
      expect(((await queued) as Error).name).toBe('AbortError');
      expect(refresh.count).toBe(0);
      expect(getAccessToken()).toBeNull();
    } finally {
      delete (navigator as unknown as { locks?: unknown }).locks;
    }
  });

  it('treats a hung refresh as a transient timeout so it cannot hold the lock', async () => {
    server.use(http.post('*/api/v1/auth/refresh', () => delay('infinite')));
    setSession({ accessToken: 't0', expiresAt: inMinutes(60) }, { serverTime: start });
    const pending = refreshSession().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(15_000);
    const error = await pending;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'UNAVAILABLE', status: 0 });
    expect(getAccessToken()).toBe('t0');
  });

  /** Refresh endpoint that behaves like the server: `serverOffsetMs` is its clock relative to the device. */
  function serverLikeRefresh(options: { serverOffsetMs?: number; hardEndMs?: number; sameExpiry?: boolean } = {}) {
    const times: number[] = [];
    const offset = options.serverOffsetMs ?? 0;
    let lastExpiry: string | undefined = options.sameExpiry ? inMinutes(60) : undefined;
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        times.push(Date.now());
        const serverNow = Date.now() + offset;
        const raw = serverNow + 60 * 60_000;
        const expiresAt = new Date(Math.min(raw, options.hardEndMs ?? raw)).toISOString();
        const body = {
          accessToken: `t${times.length}`,
          expiresAt: options.sameExpiry && lastExpiry ? lastExpiry : expiresAt
        };
        lastExpiry = body.expiresAt;
        return HttpResponse.json(body, { headers: { Date: new Date(serverNow).toUTCString() } });
      })
    );
    return times;
  }

  const gaps = (times: number[]) => times.slice(1).map((t, i) => t - (times[i] ?? 0));

  it('stops renewing when the server caps expiresAt at the session hard end', async () => {
    const hardEnd = start + 3 * 3_600_000;
    const times = serverLikeRefresh({ hardEndMs: hardEnd });
    setSession({ accessToken: 't0', expiresAt: inMinutes(60) }, { serverTime: start });
    await vi.advanceTimersByTimeAsync(4 * 3_600_000);
    expect(times.length).toBeLessThanOrEqual(5);
    expect(Math.min(...gaps(times))).toBeGreaterThanOrEqual(60_000);
    expect(times.filter((t) => t >= hardEnd - 60_000)).toHaveLength(0);
  });

  it('stops scheduling when a refresh does not extend expiresAt', async () => {
    const times = serverLikeRefresh({ sameExpiry: true });
    setSession({ accessToken: 't0', expiresAt: inMinutes(60) }, { serverTime: start });
    await vi.advanceTimersByTimeAsync(55 * 60_000);
    await vi.advanceTimersByTimeAsync(3 * 3_600_000);
    expect(times).toHaveLength(1);
  });

  it('does not schedule renewal for a token with under a minute left', async () => {
    const times = serverLikeRefresh();
    setSession({ accessToken: 't0', expiresAt: inMinutes(0.5) }, { serverTime: start });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(times).toHaveLength(0);
  });

  it('gives up after 3 transient retries', async () => {
    const times: number[] = [];
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        times.push(Date.now());
        return HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 });
      })
    );
    setSession({ accessToken: 't0', expiresAt: inMinutes(60) }, { serverTime: start });
    await vi.advanceTimersByTimeAsync(59 * 60_000);
    expect(times.length).toBeLessThanOrEqual(4);
    expect(Math.min(...gaps(times))).toBeGreaterThanOrEqual(60_000);
    expect(getAccessToken()).toBe('t0');
  });

  it.each([59.5, 61, -61])(
    'renews about 55 minutes after receipt with the device clock %s min ahead',
    async (skewMin) => {
      const times = serverLikeRefresh({ serverOffsetMs: -skewMin * 60_000 });
      vi.setSystemTime(start + skewMin * 60_000); // device clock is skewed; the server is at `start`
      setSession({ accessToken: 't0', expiresAt: inMinutes(60) }, { serverTime: start });
      const t0 = Date.now();
      await vi.advanceTimersByTimeAsync(50 * 60_000);
      expect(times).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(6 * 60_000);
      expect(times).toHaveLength(1);
      expect((times[0] ?? 0) - t0).toBeGreaterThan(54 * 60_000);
    }
  );

  it('serialises refreshes across tabs with a Web Lock', async () => {
    const request = vi.fn((_name: string, callback: () => Promise<unknown>) => callback());
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
    try {
      serverLikeRefresh();
      setSession({ accessToken: 't0', expiresAt: inMinutes(60) }, { serverTime: start });
      await refreshSession();
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0]?.[0]).toBe('alexeev-refresh');
    } finally {
      delete (navigator as unknown as { locks?: unknown }).locks;
    }
  });
});
